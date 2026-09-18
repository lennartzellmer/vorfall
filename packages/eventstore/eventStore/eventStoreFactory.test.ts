import type { DomainEvent, Subject } from '../types/index'
import type { EventStoreInstance } from './eventStoreFactory'
import { CloudEvent } from 'cloudevents'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createDomainEvent, createEventStream } from '../utils/utilsEventStore'
import { createProjectionDefinition, UnhandledProjectionEventError } from '../utils/utilsProjections'
import { createStreamSubject, createSubject, getStreamSubjectFromSubject } from '../utils/utilsSubject'
import { ConcurrencyError, MissingExpectedVersionError } from './concurrencyError'
import { createEventStore } from './eventStoreFactory'
import { toDocument } from './eventStreamDocument'

describe('mongoClientWrapper Integration Tests', () => {
  let replSet: MongoMemoryReplSet
  let eventStore: EventStoreInstance
  let connectionString: string

  // Provide test data
  const subjectExisting = createSubject('user/123/created')
  const streamSubject = getStreamSubjectFromSubject(subjectExisting)
  const testEvent = createDomainEvent({
    type: 'user.created',
    subject: subjectExisting,
    data: { name: 'Alice Example', email: 'alice@example.com' },
  })
  const eventStream = createEventStream([testEvent])

  beforeAll(async () => {
    // Start in-memory MongoDB replica set for transaction support
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 }, // Single member: transactions work, elections cannot happen
    })
    connectionString = replSet.getUri()
    eventStore = createEventStore({ connectionString })
    await eventStore.getInstanceMongoClientWrapper().waitForConnection()
  })

  afterEach(async () => {
    // Clean up collections between tests
    const db = eventStore.getInstanceMongoClientWrapper().getDatabase()
    const collections = await db.collections()
    for (const collection of collections) {
      await collection.drop()
    }
  })

  afterAll(async () => {
    await eventStore.getInstanceMongoClientWrapper().close()
    await replSet.stop()
  })

  describe('getEventStreamBySubject', () => {
    it('should return empty result when stream does not exist', async () => {
      const subjectNonExisting = createSubject('user/non-existentstream')
      const result = await eventStore.getEventStreamBySubject(subjectNonExisting)

      expect(result).toEqual({
        events: [],
        streamExists: false,
        version: 0,
      })
    })

    it('should return data when stream exists', async () => {
      const collection = eventStore.getCollectionBySubject(streamSubject)
      await collection.insertOne(toDocument(eventStream), { ignoreUndefined: true })

      const eventStreamResult = await eventStore.getEventStreamBySubject(streamSubject)

      expect(eventStreamResult).not.toBeNull()
      expect(eventStreamResult?.events.length).toBe(1)
      // eslint-disable-next-line ts/no-non-null-asserted-optional-chain
      expect(new CloudEvent(eventStreamResult?.events[0]!)).toMatchObject(testEvent)
    })
  })

  describe('appendOrCreateStream', () => {
    it('should create a new stream with a single event', async () => {
      const result = await eventStore.appendOrCreateStream([testEvent], { expectedVersions: 'any' })

      expect(result).toBeDefined()
      expect(result.totalEventsAppended).toBe(1)
      expect(result.streamSubjects).toEqual([streamSubject])
      expect(result.streams.length).toBe(1)

      const stream = result.streams[0]!
      expect(stream.streamSubject).toBe(streamSubject)
      expect(stream.events.length).toBe(1)
      expect(createDomainEvent(stream.events[0]!)).toMatchObject(testEvent)
    })

    it('should append an event to an existing stream', async () => {
      const collection = eventStore.getCollectionBySubject(streamSubject)
      await collection.insertOne(toDocument(eventStream), { ignoreUndefined: true })

      const newEvent = createDomainEvent({
        type: 'user.updated',
        subject: subjectExisting,
        data: { name: 'Alice Example', email: 'ally@example.com' },
      })

      // wait for 10ms to ensure the updatedAt field is different
      await new Promise(resolve => setTimeout(resolve, 10))

      const result = await eventStore.appendOrCreateStream([newEvent], { expectedVersions: 'any' })

      expect(result).toBeDefined()
      expect(result.totalEventsAppended).toBe(1)
      expect(result.streamSubjects).toEqual([streamSubject])
      expect(result.streams.length).toBe(1)

      const stream = result.streams[0]!
      expect(stream.streamSubject).toBe(streamSubject)
      expect(stream.metadata.createdAt.valueOf()).toBeLessThan(stream.metadata.updatedAt.valueOf())
      expect(stream.events.length).toBe(2)
      expect(createDomainEvent(stream.events[1]!)).toMatchObject(newEvent)
    })

    it('should store the stream keyed by its subject as _id', async () => {
      await eventStore.appendOrCreateStream([testEvent], { expectedVersions: 'any' })

      const document = await eventStore.getCollectionBySubject(streamSubject).findOne({ _id: streamSubject })

      expect(document?._id).toBe(streamSubject)
      expect(document).not.toHaveProperty('streamSubject')
      expect(document?.version).toBe(1)
    })

    it('should rely on the _id index alone', async () => {
      const testeventStore = createEventStore({ connectionString })
      await testeventStore.getInstanceMongoClientWrapper().waitForConnection()

      await testeventStore.appendOrCreateStream([testEvent], { expectedVersions: 'any' })

      const collection = testeventStore.getCollectionBySubject(streamSubject)
      const indexes = await collection.indexes()
      expect(indexes.map(index => index.name)).toEqual(['_id_'])
    })

    it('should return streams under their subject with no storage identifiers on every write path', async () => {
      const ordersProjection = createProjectionDefinition({
        name: 'Orders',
        entity: 'order',
        evolve: (state: { count: number } | null) => ({ count: (state?.count ?? 0) + 1 }),
        initialState: () => ({ count: 0 }),
      })
      const testeventStore = createEventStore({ connectionString, projections: [ordersProjection] })
      await testeventStore.getInstanceMongoClientWrapper().waitForConnection()
      const orderStreamSubject = createStreamSubject('order/1')
      const orderEvent = createDomainEvent({ type: 'order.placed', subject: createSubject('order/1/placed'), data: { total: 1 } })

      // insert path, nothing folded; insert path, projection folded; append path, projection folded
      const insertedUnfolded = await testeventStore.appendOrCreateStream([testEvent], { expectedVersions: new Map([[streamSubject, 'no-stream']]) })
      const insertedFolded = await testeventStore.appendOrCreateStream([orderEvent], { expectedVersions: new Map([[orderStreamSubject, 'no-stream']]) })
      const appendedFolded = await testeventStore.appendOrCreateStream([orderEvent], { expectedVersions: 'any' })

      for (const result of [insertedUnfolded, insertedFolded, appendedFolded]) {
        const stream = result.streams[0]!
        expect(stream).not.toHaveProperty('_id')
        expect(stream).not.toHaveProperty('streamId')
      }
      expect(insertedUnfolded.streams[0]?.streamSubject).toBe(streamSubject)
      expect(insertedFolded.streams[0]?.streamSubject).toBe(orderStreamSubject)
      expect(appendedFolded.streams[0]?.streamSubject).toBe(orderStreamSubject)
      expect(appendedFolded.streams[0]?.projections?.Orders).toEqual({ count: 2 })
    })

    it('should store a projection when configured', async () => {
      const projectionDefinition = createProjectionDefinition({
        name: 'TestProjection',
        canHandle: ['user.created'],
        evolve: (state: { count: number } | null) => {
          return { count: (state?.count ?? 0) + 1 }
        },
        initialState: () => ({ count: 0 }),
      })

      const testeventStore = createEventStore({ connectionString, projections: [projectionDefinition] })
      await testeventStore.getInstanceMongoClientWrapper().waitForConnection()

      const result = await testeventStore.appendOrCreateStream([testEvent], { expectedVersions: 'any' })

      expect(result.streams[0]?.projections?.TestProjection).toEqual({ count: 1 })
    })
    it('should only pass events listed in canHandle to evolve', async () => {
      const seenEventTypes: string[] = []
      const projectionDefinition = createProjectionDefinition({
        name: 'TestProjection',
        canHandle: ['user.created'],
        evolve: (state: { count: number } | null, event) => {
          seenEventTypes.push(event.type)
          return { count: (state?.count ?? 0) + 1 }
        },
        initialState: () => ({ count: 0 }),
      })

      const testeventStore = createEventStore({ connectionString, projections: [projectionDefinition] })
      await testeventStore.getInstanceMongoClientWrapper().waitForConnection()

      const unrelatedEvent = createDomainEvent({
        type: 'user.updated',
        subject: subjectExisting,
        data: { name: 'Alice Updated' },
      })
      const result = await testeventStore.appendOrCreateStream([testEvent, unrelatedEvent], { expectedVersions: 'any' })

      expect(seenEventTypes).toEqual(['user.created'])
      expect(result.streams[0]?.projections?.TestProjection).toEqual({ count: 1 })
    })
    it('should pass every event of the stream to a projection selected by entity', async () => {
      const seenEventTypes: string[] = []
      const projectionDefinition = createProjectionDefinition({
        name: 'TestProjection',
        entity: 'user',
        evolve: (state: { count: number } | null, event) => {
          seenEventTypes.push(event.type)
          return { count: (state?.count ?? 0) + 1 }
        },
        initialState: () => ({ count: 0 }),
      })

      const testeventStore = createEventStore({ connectionString, projections: [projectionDefinition] })
      await testeventStore.getInstanceMongoClientWrapper().waitForConnection()

      const updatedEvent = createDomainEvent({
        type: 'user.updated',
        subject: subjectExisting,
        data: { name: 'Alice Updated' },
      })
      const result = await testeventStore.appendOrCreateStream([testEvent, updatedEvent], { expectedVersions: 'any' })

      expect(seenEventTypes).toEqual(['user.created', 'user.updated'])
      expect(result.streams[0]?.projections?.TestProjection).toEqual({ count: 2 })
    })
    it('should not apply a projection selected by entity to streams of another entity', async () => {
      const projectionDefinition = createProjectionDefinition({
        name: 'TestProjection',
        entity: 'order',
        evolve: (state: { count: number } | null) => ({ count: (state?.count ?? 0) + 1 }),
        initialState: () => ({ count: 0 }),
      })

      const testeventStore = createEventStore({ connectionString, projections: [projectionDefinition] })
      await testeventStore.getInstanceMongoClientWrapper().waitForConnection()

      const result = await testeventStore.appendOrCreateStream([testEvent], { expectedVersions: 'any' })

      expect(result.streams[0]?.projections?.TestProjection).toBeUndefined()
    })
    it('should fail the append when an entity projection has no case for an event type', async () => {
      type UserCreated = DomainEvent<'user.created', { name: string, email: string }>
      const projectionDefinition = createProjectionDefinition({
        name: 'TestProjection',
        entity: 'user',
        evolve: (state: { count: number } | null, event: UserCreated) => {
          switch (event.type) {
            case 'user.created':
              return { count: (state?.count ?? 0) + 1 }
          }
        },
        initialState: () => ({ count: 0 }),
      })

      const testeventStore = createEventStore({ connectionString, projections: [projectionDefinition] })
      await testeventStore.getInstanceMongoClientWrapper().waitForConnection()
      await testeventStore.appendOrCreateStream([testEvent], { expectedVersions: 'any' })

      const unhandledEvent = createDomainEvent({
        type: 'user.avatarUploaded',
        subject: subjectExisting,
        data: { url: 'https://example.com/avatar.png' },
      })
      const append = testeventStore.appendOrCreateStream([unhandledEvent], { expectedVersions: 'any' })

      await expect(append).rejects.toBeInstanceOf(UnhandledProjectionEventError)
      await expect(append).rejects.toMatchObject({ projectionName: 'TestProjection', eventType: 'user.avatarUploaded' })
      // The failed fold aborts the transaction: the event was not appended either.
      const stream = await testeventStore.getEventStreamBySubject(subjectExisting)
      expect(stream.version).toBe(1)
      expect(stream.events.map(event => event.type)).toEqual(['user.created'])
    })
    it('should restart a projection from its initial state after evolve returned null, however the events are batched', async () => {
      // evolve tells null and the initial state apart: an increment on a
      // removed counter stays removed, an increment on the initial state counts.
      const counterProjection = createProjectionDefinition({
        name: 'Counter',
        entity: 'user',
        evolve: (state: { count: number } | null, event: DomainEvent<'user.created' | 'user.reset'>) => {
          if (event.type === 'user.reset')
            return null
          return state ? { count: state.count + 1 } : null
        },
        initialState: () => ({ count: 0 }),
      })
      const testeventStore = createEventStore({ connectionString, projections: [counterProjection] })
      await testeventStore.getInstanceMongoClientWrapper().waitForConnection()
      const created = () => createDomainEvent({ type: 'user.created', subject: subjectExisting, data: { name: 'Alice Example', email: 'alice@example.com' } })
      const reset = createDomainEvent({ type: 'user.reset', subject: subjectExisting, data: undefined })

      const oneBatch = await testeventStore.appendOrCreateStream([created(), reset, created()], { expectedVersions: 'any' })
      expect(oneBatch.streams[0]?.projections?.Counter).toEqual({ count: 1 })

      const otherSubject = createSubject('user/456/created')
      const otherCreated = () => createDomainEvent({ type: 'user.created', subject: otherSubject, data: { name: 'Bob', email: 'bob@example.com' } })
      const otherReset = createDomainEvent({ type: 'user.reset', subject: otherSubject, data: undefined })
      await testeventStore.appendOrCreateStream([otherCreated(), otherReset], { expectedVersions: 'any' })
      const twoBatches = await testeventStore.appendOrCreateStream([otherCreated()], { expectedVersions: 'any' })
      expect(twoBatches.streams[0]?.projections?.Counter).toEqual({ count: 1 })

      const aggregated = await testeventStore.aggregateStream(streamSubject, { evolve: counterProjection.evolve, initialState: counterProjection.initialState })
      expect(aggregated.state).toEqual({ count: 1 })
    })
    it('should not carry the storage _id on a stream returned after a projection folded', async () => {
      const projectionDefinition = createProjectionDefinition({
        name: 'TestProjection',
        entity: 'user',
        evolve: (state: { count: number } | null) => ({ count: (state?.count ?? 0) + 1 }),
        initialState: () => ({ count: 0 }),
      })
      const testeventStore = createEventStore({ connectionString, projections: [projectionDefinition] })
      await testeventStore.getInstanceMongoClientWrapper().waitForConnection()

      const created = await testeventStore.appendOrCreateStream([testEvent], { expectedVersions: 'any' })
      const appended = await testeventStore.appendOrCreateStream([testEvent], { expectedVersions: 'any' })

      expect(created.streams[0]).not.toHaveProperty('_id')
      expect(appended.streams[0]).not.toHaveProperty('_id')
      expect(appended.streams[0]?.projections?.TestProjection).toEqual({ count: 2 })
    })
    it('should update an already existing projection', async () => {
      const projectionDefinition = createProjectionDefinition({
        name: 'TestProjection',
        canHandle: ['user.created'],
        evolve: (state: { count: number } | null) => {
          return { count: (state?.count ?? 0) + 1 }
        },
        initialState: () => ({ count: 0 }),
      })

      const testeventStore = createEventStore({ connectionString, projections: [projectionDefinition] })
      await testeventStore.getInstanceMongoClientWrapper().waitForConnection()

      const result = await testeventStore.appendOrCreateStream([testEvent], { expectedVersions: 'any' })

      expect(result.streams[0]?.projections?.TestProjection).toEqual({ count: 1 })

      const result2 = await testeventStore.appendOrCreateStream([testEvent], { expectedVersions: 'any' })

      expect(result2.streams[0]?.projections?.TestProjection).toEqual({ count: 2 })
    })

    it('should handle events from multiple different streams in a single transaction', async () => {
      // TODO: Test negative case where one of the streams does not exist and transaction should fail

      // Create events for different streams
      const stream1Subject = createSubject('user/123/created')
      const stream2Subject = createSubject('user/456/created')

      const event1 = createDomainEvent({
        type: 'user.created',
        subject: stream1Subject,
        data: { name: 'Alice Example', email: 'alice@example.com' },
      })

      const event2 = createDomainEvent({
        type: 'user.created',
        subject: stream2Subject,
        data: { name: 'Bob Example', email: 'bob@example.com' },
      })

      const event3 = createDomainEvent({
        type: 'user.updated',
        subject: stream1Subject,
        data: { name: 'Alice Updated', email: 'alice.updated@example.com' },
      })

      // Append events from different streams
      const result = await eventStore.appendOrCreateStream([event1, event2, event3], { expectedVersions: 'any' })

      expect(result).toBeDefined()
      expect(result.totalEventsAppended).toBe(3)
      expect(result.streamSubjects.length).toBe(2)
      expect(result.streams.length).toBe(2)

      // Find streams by subject
      const stream1 = result.streams.find(s => s.streamSubject === getStreamSubjectFromSubject(stream1Subject))
      const stream2 = result.streams.find(s => s.streamSubject === getStreamSubjectFromSubject(stream2Subject))

      expect(stream1).toBeDefined()
      expect(stream2).toBeDefined()

      // Stream 1 should have 2 events (event1 and event3)
      expect(stream1!.events.length).toBe(2)
      expect(stream1!.events[0]!.type).toBe('user.created')
      expect(stream1!.events[1]!.type).toBe('user.updated')

      // Stream 2 should have 1 event (event2)
      expect(stream2!.events.length).toBe(1)
      expect(stream2!.events[0]!.type).toBe('user.created')
    })

    it('should handle multiple streams with projections correctly', async () => {
      const projectionDefinition = createProjectionDefinition({
        name: 'EventCountProjection',
        canHandle: ['user.created'],
        evolve: (state: { count: number } | null) => {
          return { count: (state?.count ?? 0) + 1 }
        },
        initialState: () => ({ count: 0 }),
      })

      const testEventStore = createEventStore({ connectionString, projections: [projectionDefinition] })
      await testEventStore.getInstanceMongoClientWrapper().waitForConnection()

      // Create events for different streams
      const stream1Subject = createSubject('user/789/created')
      const stream2Subject = createSubject('user/101/created')

      const event1 = createDomainEvent({
        type: 'user.created',
        subject: stream1Subject,
        data: { name: 'Charlie Example', email: 'charlie@example.com' },
      })

      const event2 = createDomainEvent({
        type: 'user.created',
        subject: stream2Subject,
        data: { name: 'Dana Example', email: 'dana@example.com' },
      })

      const result = await testEventStore.appendOrCreateStream([event1, event2], { expectedVersions: 'any' })

      expect(result.streams.length).toBe(2)

      // Both streams should have their projections updated
      const stream1 = result.streams.find(s => s.streamSubject === getStreamSubjectFromSubject(stream1Subject))
      const stream2 = result.streams.find(s => s.streamSubject === getStreamSubjectFromSubject(stream2Subject))

      expect(stream1?.projections?.EventCountProjection).toEqual({ count: 1 })
      expect(stream2?.projections?.EventCountProjection).toEqual({ count: 1 })
    })

    describe('projection deletion via null evolve return', () => {
      const deletionProjection = createProjectionDefinition({
        name: 'DeletionProjection',
        canHandle: ['user.created', 'user.deleted'],
        evolve: (state: { count: number } | null, event: { type: string }) => {
          if (event.type === 'user.deleted')
            return null
          return { count: (state?.count ?? 0) + 1 }
        },
        initialState: () => null,
      })

      it('should $unset the projection field when evolve returns null', async () => {
        const testEventStore = createEventStore({ connectionString, projections: [deletionProjection] })
        await testEventStore.getInstanceMongoClientWrapper().waitForConnection()

        const subject = createSubject('user/999/created')
        const streamSubject = getStreamSubjectFromSubject(subject)

        const created = createDomainEvent({
          type: 'user.created',
          subject,
          data: { name: 'Erin Example', email: 'erin@example.com' },
        })

        const createdResult = await testEventStore.appendOrCreateStream([created], { expectedVersions: 'any' })
        expect(createdResult.streams[0]?.projections?.DeletionProjection).toEqual({ count: 1 })

        const deleted = createDomainEvent({
          type: 'user.deleted',
          subject,
        })

        const deletedResult = await testEventStore.appendOrCreateStream([deleted], { expectedVersions: 'any' })
        expect(deletedResult.streams[0]?.projections?.DeletionProjection).toBeUndefined()

        // The field must be removed from the stored document (via $unset), not merely set to null
        const rawDocument = await testEventStore.getCollectionBySubject(streamSubject).findOne({ _id: streamSubject })
        expect(rawDocument?.projections).not.toHaveProperty('DeletionProjection')
      })

      it('should re-evolve from initial state after the projection was previously deleted', async () => {
        const testEventStore = createEventStore({ connectionString, projections: [deletionProjection] })
        await testEventStore.getInstanceMongoClientWrapper().waitForConnection()

        const subject = createSubject('user/998/created')

        const created = createDomainEvent({ type: 'user.created', subject })
        const deleted = createDomainEvent({ type: 'user.deleted', subject })
        const recreated = createDomainEvent({ type: 'user.created', subject })

        await testEventStore.appendOrCreateStream([created], { expectedVersions: 'any' })
        await testEventStore.appendOrCreateStream([deleted], { expectedVersions: 'any' })
        const result = await testEventStore.appendOrCreateStream([recreated], { expectedVersions: 'any' })

        // Started fresh from initialState() (null) rather than continuing the previous count
        expect(result.streams[0]?.projections?.DeletionProjection).toEqual({ count: 1 })
      })

      it('should delete the projection when both events land in the same append call', async () => {
        const testEventStore = createEventStore({ connectionString, projections: [deletionProjection] })
        await testEventStore.getInstanceMongoClientWrapper().waitForConnection()

        const subject = createSubject('user/997/created')

        const created = createDomainEvent({ type: 'user.created', subject })
        const deleted = createDomainEvent({ type: 'user.deleted', subject })

        const result = await testEventStore.appendOrCreateStream([created, deleted], { expectedVersions: 'any' })

        expect(result.streams[0]?.projections?.DeletionProjection).toBeUndefined()
      })

      it('should combine $set and $unset in a single append call when one projection is updated and a sibling projection is deleted', async () => {
        const keepProjection = createProjectionDefinition({
          name: 'KeepProjection',
          canHandle: ['user.created', 'user.deleted'],
          evolve: (state: { count: number } | null) => ({ count: (state?.count ?? 0) + 1 }),
          initialState: () => null,
        })

        const testEventStore = createEventStore({
          connectionString,
          projections: [deletionProjection, keepProjection],
        })
        await testEventStore.getInstanceMongoClientWrapper().waitForConnection()

        const subject = createSubject('user/996/created')

        // Seed both projections with a non-null state so the second call below
        // exercises an update ($set), not just an initial creation.
        const created = createDomainEvent({ type: 'user.created', subject })
        await testEventStore.appendOrCreateStream([created], { expectedVersions: 'any' })

        // This single append call is what's under test: DeletionProjection evolves
        // to null ($unset) while KeepProjection evolves to a new state ($set).
        const deleted = createDomainEvent({ type: 'user.deleted', subject })
        const result = await testEventStore.appendOrCreateStream([deleted], { expectedVersions: 'any' })

        expect(result.streams[0]?.projections?.DeletionProjection).toBeUndefined()
        expect(result.streams[0]?.projections?.KeepProjection).toEqual({ count: 2 })
      })
    })
  })

  describe('optimistic concurrency control', () => {
    it('should set and increment the stream version on append', async () => {
      const first = await eventStore.appendOrCreateStream([testEvent], { expectedVersions: 'any' })
      expect(first.streams[0]!.version).toBe(1)

      const secondEvent = createDomainEvent({
        type: 'user.updated',
        subject: subjectExisting,
        data: { name: 'Alice Updated' },
      })
      const second = await eventStore.appendOrCreateStream([secondEvent], { expectedVersions: 'any' })
      expect(second.streams[0]!.version).toBe(2)
    })

    it('should append when the expected version matches', async () => {
      await eventStore.appendOrCreateStream([testEvent], { expectedVersions: 'any' })

      const secondEvent = createDomainEvent({
        type: 'user.updated',
        subject: subjectExisting,
        data: { name: 'Alice Updated' },
      })
      const result = await eventStore.appendOrCreateStream([secondEvent], {
        expectedVersions: new Map([[streamSubject, 1]]),
      })

      expect(result.streams[0]!.version).toBe(2)
      expect(result.streams[0]!.events.length).toBe(2)
    })

    it('should throw ConcurrencyError and write nothing when the expected version does not match', async () => {
      await eventStore.appendOrCreateStream([testEvent], { expectedVersions: 'any' })

      const secondEvent = createDomainEvent({
        type: 'user.updated',
        subject: subjectExisting,
        data: { name: 'Alice Updated' },
      })

      const append = eventStore.appendOrCreateStream([secondEvent], {
        expectedVersions: new Map([[streamSubject, 5]]),
      })

      await expect(append).rejects.toThrowError(ConcurrencyError)
      await expect(eventStore.appendOrCreateStream([secondEvent], {
        expectedVersions: new Map([[streamSubject, 5]]),
      })).rejects.toMatchObject({
        streamSubject,
        expectedVersion: 5,
        actualVersion: 1,
      })

      const { events } = await eventStore.getEventStreamBySubject(streamSubject)
      expect(events.length).toBe(1)
    })

    it('should throw ConcurrencyError for no-stream when the stream already exists', async () => {
      // Fresh instance: the shared store's ensure cache believes the unique
      // index still exists, but afterEach dropped the collection with it.
      const freshStore = createEventStore({ connectionString })
      await freshStore.getInstanceMongoClientWrapper().waitForConnection()

      await freshStore.appendOrCreateStream([testEvent], { expectedVersions: 'any' })

      const append = freshStore.appendOrCreateStream([testEvent], {
        expectedVersions: new Map([[streamSubject, 'no-stream' as const]]),
      })

      await expect(append).rejects.toThrowError(ConcurrencyError)
    })

    it('should create the stream when no-stream is expected and it does not exist', async () => {
      const result = await eventStore.appendOrCreateStream([testEvent], {
        expectedVersions: new Map([[streamSubject, 'no-stream' as const]]),
      })

      expect(result.streams[0]!.version).toBe(1)
      const { streamExists } = await eventStore.getEventStreamBySubject(streamSubject)
      expect(streamExists).toBe(true)
    })

    it('should roll back all streams when one expected version does not match', async () => {
      const otherSubject = createSubject('user/456/created')
      const otherStreamSubject = getStreamSubjectFromSubject(otherSubject)
      const otherEvent = createDomainEvent({
        type: 'user.created',
        subject: otherSubject,
        data: { name: 'Bob Example' },
      })

      await eventStore.appendOrCreateStream([testEvent], { expectedVersions: 'any' })

      const append = eventStore.appendOrCreateStream([testEvent, otherEvent], {
        expectedVersions: new Map<Subject, number>([
          [streamSubject, 1],
          [otherStreamSubject, 7],
        ]),
      })

      await expect(append).rejects.toThrowError(ConcurrencyError)

      const existing = await eventStore.getEventStreamBySubject(streamSubject)
      expect(existing.events.length).toBe(1)
      const other = await eventStore.getEventStreamBySubject(otherStreamSubject)
      expect(other.streamExists).toBe(false)
    })

    it('should throw MissingExpectedVersionError and write nothing when a stream is not listed in the map', async () => {
      const otherSubject = createSubject('user/456/created')
      const otherStreamSubject = getStreamSubjectFromSubject(otherSubject)
      const otherEvent = createDomainEvent({
        type: 'user.created',
        subject: otherSubject,
        data: { name: 'Bob Example' },
      })

      const append = eventStore.appendOrCreateStream([testEvent, otherEvent], {
        expectedVersions: new Map([[streamSubject, 'no-stream' as const]]),
      })

      await expect(append).rejects.toThrowError(MissingExpectedVersionError)
      await expect(append).rejects.toMatchObject({ streamSubject: otherStreamSubject })

      const existing = await eventStore.getEventStreamBySubject(streamSubject)
      expect(existing.streamExists).toBe(false)
    })
  })

  describe('aggregateStream', () => {
    const firstTestEvent = createDomainEvent({
      type: 'user.created',
      subject: subjectExisting,
      data: { increase: 1 },
    })

    type FirstTestEvent = DomainEvent<
      'user.created',
      { increase: number }
    >

    interface TestState {
      count: number
      events: Array<string>
    }

    const initialState = (): TestState => ({ count: 0, events: [] })

    const evolve = (state: TestState, event: FirstTestEvent): TestState => ({
      count: state.count + (event.data?.increase || 1),
      events: [...state.events, event.type],
    })

    it('should return initial state when stream does not exist', async () => {
      const subjectNonExisting = createSubject('user/non-existent-aggregate')

      const result = await eventStore.aggregateStream(subjectNonExisting, {
        evolve,
        initialState,
      })

      expect(result).toEqual({
        state: { count: 0, events: [] },
        streamExists: false,
        version: 0,
      })
    })

    it('should aggregate events from existing stream', async () => {
      const collection = eventStore.getCollectionBySubject(streamSubject)
      const testEventStream = createEventStream([firstTestEvent])
      await collection.insertOne(toDocument(testEventStream), { ignoreUndefined: true })

      const result = await eventStore.aggregateStream(streamSubject, {
        evolve,
        initialState,
      })

      expect(result).toEqual({
        state: {
          count: 1,
          events: [firstTestEvent.type],
        },
        streamExists: true,
        version: 1,
      })
    })

    it('should aggregate multiple events from existing stream', async () => {
      const secondTestEvent = createDomainEvent({
        type: 'user.created',
        subject: subjectExisting,
        data: { increase: 99 },
      })

      const collection = eventStore.getCollectionBySubject(streamSubject)
      const testEventStream = createEventStream([firstTestEvent, secondTestEvent])
      await collection.insertOne(toDocument(testEventStream), { ignoreUndefined: true })

      const result = await eventStore.aggregateStream(streamSubject, {
        evolve,
        initialState,
      })

      expect(result).toEqual({
        state: {
          count: 100, // 1 + 99 from the two events
          events: [firstTestEvent.type, secondTestEvent.type],
        },
        streamExists: true,
        version: 2,
      })
    })
  })
})
