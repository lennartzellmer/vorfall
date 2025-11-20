import type { DomainEvent } from '../types/index'
import type { EventStoreInstance } from './eventStoreFactory'
import { CloudEvent } from 'cloudevents'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createDomainEvent, createEventStream } from '../utils/utilsEventStore'
import { createProjectionDefinition } from '../utils/utilsProjections'
import { createSubject, getStreamSubjectFromSubject } from '../utils/utilsSubject'
import { createEventStore } from './eventStoreFactory'

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
      replSet: { count: 3 }, // Create a replica set with 3 members
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
      })
    })

    it('should return data when stream exists', async () => {
      const collection = eventStore.getCollectionBySubject(streamSubject)
      await collection.insertOne(eventStream, { ignoreUndefined: true })

      const eventStreamResult = await eventStore.getEventStreamBySubject(streamSubject)

      expect(eventStreamResult).not.toBeNull()
      expect(eventStreamResult?.events.length).toBe(1)
      // eslint-disable-next-line ts/no-non-null-asserted-optional-chain
      expect(new CloudEvent(eventStreamResult?.events[0]!)).toMatchObject(testEvent)
    })
  })

  describe('appendOrCreateStream', () => {
    it('should create a new stream with a single event', async () => {
      const result = await eventStore.appendOrCreateStream([testEvent])

      expect(result).toBeDefined()
      expect(result.totalEventsAppended).toBe(1)
      expect(result.streamSubjects).toEqual([streamSubject])
      expect(result.streams.length).toBe(1)

      const stream = result.streams[0]!
      expect(stream.streamId).toBeDefined()
      expect(stream.streamSubject).toBe(streamSubject)
      expect(stream.events.length).toBe(1)
      expect(createDomainEvent(stream.events[0]!)).toMatchObject(testEvent)
    })

    it('should append an event to an existing stream', async () => {
      const collection = eventStore.getCollectionBySubject(streamSubject)
      await collection.insertOne(eventStream, { ignoreUndefined: true })

      const newEvent = createDomainEvent({
        type: 'user.updated',
        subject: subjectExisting,
        data: { name: 'Alice Example', email: 'ally@example.com' },
      })

      // wait for 10ms to ensure the updatedAt field is different
      await new Promise(resolve => setTimeout(resolve, 10))

      const result = await eventStore.appendOrCreateStream([newEvent])

      expect(result).toBeDefined()
      expect(result.totalEventsAppended).toBe(1)
      expect(result.streamSubjects).toEqual([streamSubject])
      expect(result.streams.length).toBe(1)

      const stream = result.streams[0]!
      expect(stream.streamId).toBeDefined()
      expect(stream.streamSubject).toBe(streamSubject)
      expect(stream.metadata.createdAt.valueOf()).toBeLessThan(stream.metadata.updatedAt.valueOf())
      expect(stream.events.length).toBe(2)
      expect(createDomainEvent(stream.events[1]!)).toMatchObject(newEvent)
    })

    it('should store a projection when configured', async () => {
      const projectionDefinition = createProjectionDefinition({
        name: 'TestProjection',
        canHandle: ['user.created'],
        evolve: (state: { count: number }) => {
          return { count: state.count + 1 }
        },
        initialState: () => ({ count: 0 }),
      })

      const testeventStore = createEventStore({ connectionString, projections: [projectionDefinition] })
      await testeventStore.getInstanceMongoClientWrapper().waitForConnection()

      const result = await testeventStore.appendOrCreateStream([testEvent])

      expect(result.streams[0]?.projections?.TestProjection).toEqual({ count: 1 })
    })
    it('should update an already existing projection', async () => {
      const projectionDefinition = createProjectionDefinition({
        name: 'TestProjection',
        canHandle: ['user.created'],
        evolve: (state: { count: number }) => {
          return { count: state.count + 1 }
        },
        initialState: () => ({ count: 0 }),
      })

      const testeventStore = createEventStore({ connectionString, projections: [projectionDefinition] })
      await testeventStore.getInstanceMongoClientWrapper().waitForConnection()

      const result = await testeventStore.appendOrCreateStream([testEvent])

      expect(result.streams[0]?.projections?.TestProjection).toEqual({ count: 1 })

      const result2 = await testeventStore.appendOrCreateStream([testEvent])

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
      const result = await eventStore.appendOrCreateStream([event1, event2, event3])

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
        evolve: (state: { count: number }) => {
          return { count: state.count + 1 }
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

      const result = await testEventStore.appendOrCreateStream([event1, event2])

      expect(result.streams.length).toBe(2)

      // Both streams should have their projections updated
      const stream1 = result.streams.find(s => s.streamSubject === getStreamSubjectFromSubject(stream1Subject))
      const stream2 = result.streams.find(s => s.streamSubject === getStreamSubjectFromSubject(stream2Subject))

      expect(stream1?.projections?.EventCountProjection).toEqual({ count: 1 })
      expect(stream2?.projections?.EventCountProjection).toEqual({ count: 1 })
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

      expect(result).toEqual({ count: 0, events: [] })
    })

    it('should aggregate events from existing stream', async () => {
      const collection = eventStore.getCollectionBySubject(streamSubject)
      const testEventStream = createEventStream([firstTestEvent])
      await collection.insertOne(testEventStream, { ignoreUndefined: true })

      const result = await eventStore.aggregateStream(streamSubject, {
        evolve,
        initialState,
      })

      expect(result).toEqual({
        count: 1,
        events: [firstTestEvent.type],
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
      await collection.insertOne(testEventStream, { ignoreUndefined: true })

      const result = await eventStore.aggregateStream(streamSubject, {
        evolve,
        initialState,
      })

      expect(result).toEqual({
        count: 100, // 1 + 99 from the two events
        events: [firstTestEvent.type, secondTestEvent.type],
      })
    })
  })
})
