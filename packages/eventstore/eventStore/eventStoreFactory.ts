import type { ClientSession, Collection, Filter, OptionalUnlessRequiredId, PushOperator, UpdateFilter } from 'mongodb'
import type { AnyDomainEvent, Subject } from '../types/index'
import type { ProjectionDefinition } from '../utils/utilsProjections.types'
import type { ExpectedStreamVersion } from './concurrencyError'
import type { AggregateStreamResult, AppendStreamOptions, EventStoreOptions, EventStream, MultiStreamAppendResult, ReadStreamResult } from './eventStoreFactory.types'
import { randomUUID } from 'node:crypto'
import { MongoServerError } from 'mongodb'
import { MongoClientWrapper } from '../mongoClient/mongoClientWrapper'
import { groupEventsByStreamSubject } from '../utils/utilsEventStore'
import { getCollectionNameFromSubject, getStreamSubjectFromSubject } from '../utils/utilsSubject'
import { ConcurrencyError } from './concurrencyError'

export interface EventStoreInstance<
  TProjections extends readonly ProjectionDefinition<any, any, any>[] | undefined = undefined,
> {
  getInstanceMongoClientWrapper: () => MongoClientWrapper
  getCollectionBySubject: <TDomainEvent extends AnyDomainEvent = AnyDomainEvent>(
    subject: Subject,
  ) => Collection<EventStream<TDomainEvent, TProjections>>
  getCollectionByEntity: <TDomainEvent extends AnyDomainEvent = AnyDomainEvent>(
    entity: string,
  ) => Collection<EventStream<TDomainEvent, TProjections>>
  getEventStreamBySubject: <TDomainEvent extends AnyDomainEvent = AnyDomainEvent>(
    subject: Subject,
  ) => Promise<ReadStreamResult<TDomainEvent>>
  aggregateStream: <
    State,
    TDomainEvent extends AnyDomainEvent = AnyDomainEvent,
  >(
    streamSubject: Subject,
    options: {
      evolve: (state: State, event: TDomainEvent) => State
      initialState: () => State
    },
  ) => Promise<AggregateStreamResult<State>>
  appendOrCreateStream: <TDomainEvent extends AnyDomainEvent>(
    events: Array<TDomainEvent>,
    options?: AppendStreamOptions,
  ) => Promise<MultiStreamAppendResult<TDomainEvent, TProjections>>
}

/**
 * Helper function to process a single stream within a transaction
 */
async function processStreamInTransaction<
  TDomainEvent extends AnyDomainEvent,
  TProjections extends readonly ProjectionDefinition<any, any, any>[] | undefined = undefined,
>(
  streamSubject: Subject,
  events: Array<TDomainEvent>,
  collection: Collection<EventStream<TDomainEvent, TProjections>>,
  projections: TProjections,
  expectedVersion: ExpectedStreamVersion,
  session?: ClientSession,
): Promise<EventStream<TDomainEvent, TProjections>> {
  const now = new Date()

  let result: EventStream<TDomainEvent, TProjections> | null

  if (expectedVersion === 'no-stream' || expectedVersion === 0) {
    const newStream = {
      streamId: randomUUID(),
      streamSubject,
      events,
      version: events.length,
      metadata: {
        createdAt: now,
        updatedAt: now,
      },
    } as OptionalUnlessRequiredId<EventStream<TDomainEvent, TProjections>>

    try {
      await collection.insertOne(newStream, {
        ignoreUndefined: true,
        ...(session && { session }),
      })
    }
    catch (error) {
      // The unique index on streamSubject rejects a concurrent create. The
      // actual version cannot be read here: the failed write already aborted
      // the transaction.
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new ConcurrencyError(streamSubject, expectedVersion)
      }
      throw error
    }

    delete (newStream as { _id?: unknown })._id
    result = newStream as EventStream<TDomainEvent, TProjections>
  }
  else {
    const versionFilter: Filter<EventStream<TDomainEvent, TProjections>>
      = typeof expectedVersion === 'number'
        ? ({ streamSubject, version: expectedVersion } as Filter<EventStream<TDomainEvent, TProjections>>)
        : ({ streamSubject } as Filter<EventStream<TDomainEvent, TProjections>>)

    const updates: UpdateFilter<EventStream<TDomainEvent, TProjections>> = {
      $setOnInsert: {
        'streamId': randomUUID(),
        'metadata.createdAt': now,
        streamSubject,
      },
      $set: {
        'metadata.updatedAt': now,
      },
      $inc: {
        version: events.length,
      } as NonNullable<UpdateFilter<EventStream<TDomainEvent, TProjections>>['$inc']>,
      $push: {
        events: { $each: events },
      } as PushOperator<EventStream<TDomainEvent, TProjections>>,
    }

    result = await collection.findOneAndUpdate(
      versionFilter,
      updates,
      {
        useBigInt64: true,
        // With an exact expected version an upsert would create a second
        // document on a version mismatch instead of failing the check.
        upsert: expectedVersion === 'any',
        ignoreUndefined: true,
        returnDocument: 'after',
        projection: { _id: 0 },
        ...(session && { session }),
      },
    )

    if (!result && typeof expectedVersion === 'number') {
      const actual = await collection.findOne(
        { streamSubject } as Filter<EventStream<TDomainEvent, TProjections>>,
        { projection: { version: 1, events: 1 }, ...(session && { session }) },
      )
      throw new ConcurrencyError(streamSubject, expectedVersion, actual ? actual.version ?? actual.events.length : undefined)
    }
  }

  if (projections && projections.length > 0) {
    const eventTypes = events.map(event => event.type)
    const applicableProjections = projections.filter(p =>
      p.canHandle.some(type => eventTypes.includes(type)),
    )

    const setUpdates: Record<string, any> = {}
    const unsetUpdates: Record<string, any> = {}
    for (const projection of applicableProjections) {
      const state = events
        .filter(event => projection.canHandle.includes(event.type))
        .reduce(
          (state, event) => projection.evolve(state, event),
          result?.projections?.[projection.name] ?? projection.initialState(),
        )

      if (state === null) {
        unsetUpdates[`projections.${projection.name}`] = ''
      }
      else {
        setUpdates[`projections.${projection.name}`] = state
      }
    }

    const projectionUpdates: UpdateFilter<EventStream<TDomainEvent, TProjections>> = {}
    if (Object.keys(setUpdates).length > 0) {
      projectionUpdates.$set = setUpdates
    }
    if (Object.keys(unsetUpdates).length > 0) {
      projectionUpdates.$unset = unsetUpdates
    }
    result = await collection.findOneAndUpdate(
      { streamSubject },
      projectionUpdates,
      {
        useBigInt64: true,
        ignoreUndefined: true,
        returnDocument: 'after',
        ...(session && { session }),
      },
    )
  }

  if (!result) {
    throw new Error(`Failed to upsert or update stream: ${streamSubject}`)
  }

  return result
}

export function createEventStore<TProjections extends readonly ProjectionDefinition<any, any, any>[] | undefined = undefined>(
  options: EventStoreOptions<TProjections>,
): EventStoreInstance<TProjections> {
  const { projections: configuredProjections, ...mongoClientOptions } = options
  const mongoClient = new MongoClientWrapper(mongoClientOptions)
  const projections = configuredProjections || ([] as unknown as TProjections)

  // Index creation is not allowed inside a transaction, so the unique index on
  // streamSubject is ensured (once per collection) before appends start. The
  // same step backfills the version field on documents written before
  // versioning existed — the $inc on append would otherwise start at 0 and the
  // exact-version filter would never match them.
  const ensuredCollections = new Map<string, Promise<unknown>>()
  function ensureCollectionReady(collection: Collection<any>): Promise<unknown> {
    const key = collection.collectionName
    let ensured = ensuredCollections.get(key)
    if (!ensured) {
      ensured = Promise.all([
        collection.createIndex({ streamSubject: 1 }, { unique: true }),
        collection.updateMany(
          { version: { $exists: false } },
          [{ $set: { version: { $size: '$events' } } }],
        ),
      ])
      ensured.catch(() => ensuredCollections.delete(key))
      ensuredCollections.set(key, ensured)
    }
    return ensured
  }

  const eventStore: EventStoreInstance<TProjections> = {
    getInstanceMongoClientWrapper(): MongoClientWrapper {
      return mongoClient
    },

    getCollectionBySubject<TDomainEvent extends AnyDomainEvent = AnyDomainEvent>(
      subject: Subject,
    ): Collection<EventStream<TDomainEvent, TProjections>> {
      const collectionName = getCollectionNameFromSubject(subject)
      return mongoClient.getDatabase().collection<EventStream<TDomainEvent, TProjections>>(collectionName)
    },

    getCollectionByEntity<TDomainEvent extends AnyDomainEvent = AnyDomainEvent>(
      entity: string,
    ): Collection<EventStream<TDomainEvent, TProjections>> {
      const collectionName = entity
      return mongoClient.getDatabase().collection<EventStream<TDomainEvent, TProjections>>(collectionName)
    },

    async getEventStreamBySubject<TDomainEvent extends AnyDomainEvent = AnyDomainEvent>(
      subject: Subject,
    ): Promise<ReadStreamResult<TDomainEvent>> {
      const streamSubject = getStreamSubjectFromSubject(subject)
      const collection = this.getCollectionBySubject<TDomainEvent>(streamSubject)
      const filter = {
        streamSubject: { $eq: streamSubject },
      }
      const stream = await collection.findOne<
        EventStream<TDomainEvent, TProjections>
      >(filter, {
        projection: { _id: 0 },
        useBigInt64: true,
      })
      if (!stream) {
        return {
          events: [],
          streamExists: false,
          version: 0,
        }
      }
      return {
        events: stream.events,
        streamExists: true,
        // Documents written before versioning existed carry no version field
        // until the first append backfills the collection.
        version: stream.version ?? stream.events.length,
      }
    },

    async aggregateStream<
      State,
      TDomainEvent extends AnyDomainEvent = AnyDomainEvent,
    >(
      streamSubject: Subject,
      options: {
        evolve: (state: State, event: TDomainEvent) => State
        initialState: () => State
      },
    ): Promise<AggregateStreamResult<State>> {
      const { evolve, initialState } = options
      const { events, streamExists, version } = await this.getEventStreamBySubject<TDomainEvent>(streamSubject)
      const state = events.reduce((state, event) => evolve(state, event), initialState())
      return { state, streamExists, version }
    },

    async appendOrCreateStream<TDomainEvent extends AnyDomainEvent>(
      events: Array<TDomainEvent>,
      options?: AppendStreamOptions,
    ): Promise<MultiStreamAppendResult<TDomainEvent, TProjections>> {
      if (!events || events.length === 0) {
        throw new Error('Cannot process an empty array of events')
      }

      const eventGroups = groupEventsByStreamSubject(events)

      for (const streamSubject of eventGroups.keys()) {
        await ensureCollectionReady(this.getCollectionBySubject(streamSubject))
      }

      const client = mongoClient.getClient()
      const session = client.startSession()

      try {
        const results = await session.withTransaction(async () => {
          const streamResults: Array<EventStream<TDomainEvent, TProjections>> = []

          for (const [streamSubject, streamEvents] of eventGroups) {
            const collection = this.getCollectionBySubject<TDomainEvent>(streamSubject)
            const result = await processStreamInTransaction(
              streamSubject,
              streamEvents,
              collection,
              projections,
              options?.expectedVersions?.get(streamSubject) ?? 'any',
              session,
            )
            streamResults.push(result)
          }

          return streamResults
        })

        return {
          streams: results,
          totalEventsAppended: events.length,
          streamSubjects: Array.from(eventGroups.keys()),
        }
      }
      finally {
        await session.endSession()
      }
    },
  }

  return eventStore
}
