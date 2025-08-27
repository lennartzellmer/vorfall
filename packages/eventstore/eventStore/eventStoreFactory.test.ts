import type { DomainEvent } from '../types/index.js'
import type { EventStoreInstance } from './eventStoreFactory.js'
import { CloudEvent } from 'cloudevents'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createDomainEvent, createEventStream } from '../utils/utilsEventStore.js'
import { createProjectionDefinition } from '../utils/utilsProjections.js'
import { createSubject, getStreamSubjectFromSubject } from '../utils/utilsSubject.js'
import { createEventStore } from './eventStoreFactory.js'

describe('mongoClientWrapper Integration Tests', () => {
  let mongod: MongoMemoryServer
  let eventStore: EventStoreInstance
  let connectionString: string

  // Provide test data
  const subjectExisting = createSubject('veranstaltung/123/erstellt')
  const streamSubject = getStreamSubjectFromSubject(subjectExisting)
  const testEvent = createDomainEvent({
    type: 'veranstaltung.erstellt',
    subject: subjectExisting,
    data: { test: 'data' },
  })
  const eventStream = createEventStream([testEvent])

  beforeAll(async () => {
    // Start in-memory MongoDB
    mongod = await MongoMemoryServer.create()
    connectionString = mongod.getUri()
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
    // Clean shutdown
    await mongod.stop()
  })

  describe('getEventStreamBySubject', () => {
    it('should return empty result when stream does not exist', async () => {
      const subjectNonExisting = createSubject('test/non-existentstream')
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
      expect(result.streamId).toBeDefined()
      expect(result.streamSubject).toBe(streamSubject)
      expect(result.events.length).toBe(1)
      expect(createDomainEvent(result.events[0]!)).toMatchObject(testEvent)
    })

    it('should append an event to an existing stream', async () => {
      const collection = eventStore.getCollectionBySubject(streamSubject)
      await collection.insertOne(eventStream, { ignoreUndefined: true })

      const newEvent = createDomainEvent({
        type: 'veranstaltung.aktualisiert',
        subject: subjectExisting,
        data: { updated: 'data' },
      })

      // wait for 10ms to ensure the updatedAt field is different
      await new Promise(resolve => setTimeout(resolve, 10))

      const result = await eventStore.appendOrCreateStream([newEvent])

      expect(result).toBeDefined()
      expect(result.streamId).toBeDefined()
      expect(result.streamSubject).toBe(streamSubject)
      expect(result.metadata.createdAt.valueOf()).toBeLessThan(result.metadata.updatedAt.valueOf())
      expect(result.events.length).toBe(2)
      expect(createDomainEvent(result.events[1]!)).toMatchObject(newEvent)
    })

    it('should store a projection when configured', async () => {
      const projectionDefinition = createProjectionDefinition({
        name: 'TestProjection',
        canHandle: ['veranstaltung.erstellt'],
        evolve: (state: { count: number }) => {
          return { count: state.count + 1 }
        },
        initialState: () => ({ count: 0 }),
      })

      const testeventStore = createEventStore({ connectionString, projections: [projectionDefinition] })
      await eventStore.getInstanceMongoClientWrapper().waitForConnection()

      const result = await testeventStore.appendOrCreateStream([testEvent])

      expect(result.projections?.TestProjection).toEqual({ count: 1 })
    })
    it('should update an already existing projection', async () => {
      const projectionDefinition = createProjectionDefinition({
        name: 'TestProjection',
        canHandle: ['veranstaltung.erstellt'],
        evolve: (state: { count: number }) => {
          return { count: state.count + 1 }
        },
        initialState: () => ({ count: 0 }),
      })

      const testeventStore = createEventStore({ connectionString, projections: [projectionDefinition] })
      await eventStore.getInstanceMongoClientWrapper().waitForConnection()

      const result = await testeventStore.appendOrCreateStream([testEvent])

      expect(result.projections?.TestProjection).toEqual({ count: 1 })

      const result2 = await testeventStore.appendOrCreateStream([testEvent])

      expect(result2.projections?.TestProjection).toEqual({ count: 2 })
    })
  })

  describe('aggregateStream', () => {
    const firstTestEvent = createDomainEvent({
      type: 'event.created',
      subject: subjectExisting,
      data: { increase: 1 },
    })

    type FirstTestEvent = DomainEvent<
      'event.created',
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
      const subjectNonExisting = createSubject('test/non-existent-aggregate')

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
        type: 'event.created',
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
