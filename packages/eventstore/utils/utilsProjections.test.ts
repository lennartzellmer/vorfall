import type { EventStoreInstance } from '../eventStore/eventStoreFactory'
import type { DomainEvent } from '../types'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createEventStore } from '../eventStore/eventStoreFactory'
import { createDomainEvent } from './utilsEventStore'
import { countProjections, createProjectionDefinition, findMultipleProjections, findOneProjection } from './utilsProjections'
import { createSubject, getStreamSubjectFromSubject } from './utilsSubject'

describe('createProjectionDefinition', () => {
  it('should create a type save projection definition', async () => {
    type TestEventOne = DomainEvent<'test.eventOne', {
      value: string
    }, undefined>

    type TestEventTwo = DomainEvent<'test.eventTwo', {
      value: string
    }, undefined>

    type TestEvents = TestEventOne | TestEventTwo

    const evolve = (state: { value: string } | null, event: TestEvents) => {
      if (!state)
        return { value: event.data.value }
      return { ...state, value: event.data.value }
    }

    const projectionDefinition = createProjectionDefinition({
      name: 'testProjection',
      evolve,
      canHandle: ['test.eventOne', 'test.eventTwo'],
      initialState: () => ({ value: '' }),
    })

    expect(projectionDefinition.name).toBe('testProjection')
    expect(projectionDefinition.canHandle).toEqual(['test.eventOne', 'test.eventTwo'])
    expect(projectionDefinition.evolve).toBeDefined()
    expect(projectionDefinition.initialState).toBeDefined()
  })
})

describe('findSingleProjection', () => {
  let replSet: MongoMemoryReplSet
  let eventStore: EventStoreInstance<typeof projectionDefinition[]>
  let connectionString: string

  const testSubject = createSubject('recepie/123')
  const streamSubject = getStreamSubjectFromSubject(testSubject)
  const testEvent = createDomainEvent({
    type: 'recepie.salt.added',
    subject: testSubject,
    data: { amount: 1 },
  })

  const projectionDefinition = createProjectionDefinition({
    name: 'testProjection',
    evolve: (state: { saltAdded: number } | null, event: typeof testEvent) => {
      if (!state)
        return { saltAdded: 0 }
      return { ...state, saltAdded: state.saltAdded + event.data.amount }
    },
    canHandle: ['recepie.salt.added'],
    initialState: () => ({ saltAdded: 0 }),
  })

  beforeAll(async () => {
    // Start in-memory MongoDB replica set for transaction support
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 3 }, // Create a replica set with 3 members
    })
    connectionString = replSet.getUri()
    eventStore = createEventStore({ connectionString, projections: [projectionDefinition] })
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

  it('should find one projection by stream subject and projection name', async () => {
    await eventStore.appendOrCreateStream([testEvent])

    const streamFilter = {
      projectionName: 'testProjection',
    } as const

    const projection = await findOneProjection(eventStore, streamSubject, streamFilter)

    expect(projection).not.toBeNull()
    expect(projection?.streamSubject).toBe(streamSubject)
    expect(projection?.projections?.testProjection).toEqual({ saltAdded: 1 })
  })

  it('should find one projection with stream name and projection query', async () => {
    const testEvent1 = createDomainEvent({
      type: 'recepie.salt.added',
      subject: testSubject,
      data: { amount: 1 },
    })

    await eventStore.appendOrCreateStream([testEvent1])

    const projectionQuery = {
      projectionName: 'testProjection',
      projectionQuery: {
        saltAdded: {
          $gt: 0,
        },
      },
    } as const

    const projection = await findOneProjection(eventStore, streamSubject, projectionQuery)

    expect(projection).not.toBeNull()
    expect(projection?.streamSubject).toBe(streamSubject)
    expect(projection?.projections?.testProjection).toEqual({ saltAdded: 1 })
  })

  it('should find one projection with stream base and projection query', async () => {
    const testEvent1 = createDomainEvent({
      type: 'recepie.salt.added',
      subject: testSubject,
      data: { amount: 1 },
    })

    await eventStore.appendOrCreateStream([testEvent1])

    const projectionQuery = {
      projectionName: 'testProjection',
      projectionQuery: {
        saltAdded: {
          $gt: 0,
        },
      },
      matchAll: true,
    } as const

    const testSubject2 = createSubject('recepie/996')

    const projection = await findOneProjection(eventStore, testSubject2, projectionQuery)

    expect(projection).not.toBeNull()
    expect(projection?.streamSubject).toBe(streamSubject)
    expect(projection?.projections?.testProjection).toEqual({ saltAdded: 1 })
  })
})

describe('findMultipleProjections', () => {
  let replSet: MongoMemoryReplSet
  let eventStore: EventStoreInstance<typeof projectionDefinitions>
  let connectionString: string

  const testSubjects = Array.from({ length: 30 }, (_, i) => createSubject(`recepie/${i + 1}`))

  const testEventsForEventStream = testSubjects.map((subject, index) => createDomainEvent({
    type: 'recepie.salt.added',
    subject,
    data: { amount: index + 1 },
  }))

  type possibleEvents = typeof testEventsForEventStream[number]

  const projectionDefinition = createProjectionDefinition({
    name: 'testProjection',
    evolve: (state: { saltAdded: number, subject: string } | null, event: possibleEvents) => {
      if (!state)
        return { saltAdded: event.data.amount, subject: event.subject }
      return { ...state, saltAdded: state.saltAdded + event.data.amount }
    },
    canHandle: ['recepie.salt.added'],
    initialState: () => null,
  })

  const projectionDefinition2 = createProjectionDefinition({
    name: 'testProjection2',
    evolve: (state: { timesSaltAdded: number, subject: string } | null, event: possibleEvents) => {
      if (!state)
        return { timesSaltAdded: 0, subject: event.subject }
      return { ...state, timesSaltAdded: state.timesSaltAdded + 1 }
    },
    canHandle: ['recepie.salt.added'],
    initialState: () => null,
  })

  const projectionDefinitions = [projectionDefinition, projectionDefinition2] as const

  beforeAll(async () => {
    // Start in-memory MongoDB replica set for transaction support
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 3 }, // Create a replica set with 3 members
    })
    connectionString = replSet.getUri()
    eventStore = createEventStore({ connectionString, projections: projectionDefinitions })
    await eventStore.getInstanceMongoClientWrapper().waitForConnection()

    for (const event of testEventsForEventStream) {
      await eventStore.appendOrCreateStream([event])
    }
  })

  afterAll(async () => {
    await eventStore.getInstanceMongoClientWrapper().close()
    await replSet.stop()
  })

  it('should find 30 projections', async () => {
    const streamFilter = {
      projectionName: 'testProjection',
    } as const

    const options = {
      skip: 0,
      limit: 50,
    }

    const projections = await findMultipleProjections(eventStore, 'recepie', streamFilter, options)

    expect(projections).not.toBeNull()
    expect(projections.length).toBe(30)
  })

  it('should respect limit if specified', async () => {
    const streamFilter = {
      projectionName: 'testProjection2',
    } as const

    const options = {
      skip: 0,
      limit: 20,
    }

    const projections = await findMultipleProjections(eventStore, 'recepie', streamFilter, options)

    expect(projections).not.toBeNull()
    expect(projections.length).toBe(20)
  })

  it('should respect skip if specified', async () => {
    const streamFilter = {
      projectionName: 'testProjection',
    } as const

    const options = {
      skip: 10,
      limit: 20,
    }

    const projections = await findMultipleProjections(eventStore, 'recepie', streamFilter, options)

    expect(projections).not.toBeNull()
    expect(projections.length).toBe(20)
    expect(projections[0]!.subject).toEqual('recepie/11')
  })

  it('should respect sorting if specified', async () => {
    const streamFilter = {
      projectionName: 'testProjection',
    } as const

    const options = {
      sort: {
        saltAdded: -1,
      },
      limit: 40,
    } as const

    const projections = await findMultipleProjections(eventStore, 'recepie', streamFilter, options)

    expect(projections).not.toBeNull()
    expect(projections.length).toBe(30)
    expect(projections[0]!.saltAdded).toEqual(30)
  })

  // Add a test for countProjections
  it('should count 30 projections', async () => {
    const streamFilter = {
      projectionName: 'testProjection',
    } as const

    const count = await countProjections(eventStore, 'recepie', streamFilter)

    expect(count).toBe(30)
  })
})
