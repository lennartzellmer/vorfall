import type { ClientSession, Collection, Filter, PushOperator, UpdateFilter } from 'mongodb'
import type { AnyDomainEvent, Subject } from '../types/index'
import type { ProjectionDefinition } from '../utils/utilsProjections.types'
import type { ExpectedStreamVersion } from './concurrencyError'
import type { AggregateStreamResult, AppendStreamOptions, EventStoreOptions, EventStream, MultiStreamAppendResult, ReadStreamResult, StoredEventStream } from './eventStoreFactory.types'
import { MongoServerError } from 'mongodb'
import { MongoClientWrapper } from '../mongoClient/mongoClientWrapper'
import { createEventStream, groupEventsByStreamSubject } from '../utils/utilsEventStore'
import { selectEventsForProjection, UnhandledProjectionEventError } from '../utils/utilsProjections'
import { getCollectionNameFromSubject, getStreamSubjectFromSubject } from '../utils/utilsSubject'
import { ConcurrencyError, MissingExpectedVersionError } from './concurrencyError'
import { bySubject, fromDocument, toDocument } from './eventStreamDocument'

export interface EventStoreInstance<
  TProjections extends readonly ProjectionDefinition<any, any, any>[] | undefined = undefined,
> {
  getInstanceMongoClientWrapper: () => MongoClientWrapper
  getCollectionBySubject: <TDomainEvent extends AnyDomainEvent = AnyDomainEvent>(
    subject: Subject,
  ) => Collection<StoredEventStream<TDomainEvent, TProjections>>
  getCollectionByEntity: <TDomainEvent extends AnyDomainEvent = AnyDomainEvent>(
    entity: string,
  ) => Collection<StoredEventStream<TDomainEvent, TProjections>>
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
    options: AppendStreamOptions,
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
  collection: Collection<StoredEventStream<TDomainEvent, TProjections>>,
  projections: TProjections,
  expectedVersion: ExpectedStreamVersion,
  session?: ClientSession,
): Promise<EventStream<TDomainEvent, TProjections>> {
  const now = new Date()

  let result: StoredEventStream<TDomainEvent, TProjections> | null

  if (expectedVersion === 'no-stream' || expectedVersion === 0) {
    const newStream = toDocument(createEventStream<TDomainEvent, TProjections>(events))

    try {
      await collection.insertOne(newStream, {
        ignoreUndefined: true,
        ...(session && { session }),
      })
    }
    catch (error) {
      // The _id index rejects a concurrent create of the same subject. The
      // actual version cannot be read here: the failed write already aborted
      // the transaction.
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new ConcurrencyError(streamSubject, expectedVersion)
      }
      throw error
    }

    result = newStream
  }
  else {
    const versionFilter: Filter<StoredEventStream<TDomainEvent, TProjections>>
      = typeof expectedVersion === 'number'
        ? { ...bySubject<TDomainEvent, TProjections>(streamSubject), version: expectedVersion }
        : bySubject(streamSubject)

    const updates: UpdateFilter<StoredEventStream<TDomainEvent, TProjections>> = {
      $setOnInsert: {
        'metadata.createdAt': now,
      },
      $set: {
        'metadata.updatedAt': now,
      },
      $inc: {
        version: events.length,
      } as NonNullable<UpdateFilter<StoredEventStream<TDomainEvent, TProjections>>['$inc']>,
      $push: {
        events: { $each: events },
      } as PushOperator<StoredEventStream<TDomainEvent, TProjections>>,
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
        ...(session && { session }),
      },
    )

    if (!result && typeof expectedVersion === 'number') {
      const actual = await collection.findOne(
        bySubject(streamSubject),
        { projection: { version: 1 }, ...(session && { session }) },
      )
      throw new ConcurrencyError(streamSubject, expectedVersion, actual?.version)
    }
  }

  if (projections && projections.length > 0) {
    const setUpdates: Record<string, any> = {}
    const unsetUpdates: Record<string, any> = {}
    for (const projection of projections) {
      const handledEvents = selectEventsForProjection(projection, streamSubject, events)
      if (handledEvents.length === 0) {
        continue
      }

      let state = result?.projections?.[projection.name] ?? projection.initialState()
      for (const event of handledEvents) {
        // A null from evolve removes the projection; the next event starts
        // again from the initial state, exactly as it would in a later append.
        state = projection.evolve(state ?? projection.initialState(), event)
        // undefined means evolve has no case for this event type; failing the
        // append here keeps the projection from going silently stale.
        if (state === undefined) {
          throw new UnhandledProjectionEventError(projection.name, event.type)
        }
      }

      if (state === null) {
        unsetUpdates[`projections.${projection.name}`] = ''
      }
      else {
        setUpdates[`projections.${projection.name}`] = state
      }
    }

    const projectionUpdates: UpdateFilter<StoredEventStream<TDomainEvent, TProjections>> = {}
    if (Object.keys(setUpdates).length > 0) {
      projectionUpdates.$set = setUpdates
    }
    if (Object.keys(unsetUpdates).length > 0) {
      projectionUpdates.$unset = unsetUpdates
    }

    // MongoDB rejects an update without operators, so an append that no
    // configured projection folds leaves the document as written above.
    if (Object.keys(projectionUpdates).length > 0) {
      result = await collection.findOneAndUpdate(
        bySubject(streamSubject),
        projectionUpdates,
        {
          useBigInt64: true,
          ignoreUndefined: true,
          returnDocument: 'after',
          projection: { _id: 0 },
          ...(session && { session }),
        },
      )
    }
  }

  if (!result) {
    throw new Error(`Failed to upsert or update stream: ${streamSubject}`)
  }

  return fromDocument(result)
}

export function createEventStore<TProjections extends readonly ProjectionDefinition<any, any, any>[] | undefined = undefined>(
  options: EventStoreOptions<TProjections>,
): EventStoreInstance<TProjections> {
  const { projections: configuredProjections, ...mongoClientOptions } = options
  const mongoClient = new MongoClientWrapper(mongoClientOptions)
  const projections = configuredProjections || ([] as unknown as TProjections)

  const eventStore: EventStoreInstance<TProjections> = {
    getInstanceMongoClientWrapper(): MongoClientWrapper {
      return mongoClient
    },

    getCollectionBySubject<TDomainEvent extends AnyDomainEvent = AnyDomainEvent>(
      subject: Subject,
    ): Collection<StoredEventStream<TDomainEvent, TProjections>> {
      const collectionName = getCollectionNameFromSubject(subject)
      return mongoClient.getDatabase().collection<StoredEventStream<TDomainEvent, TProjections>>(collectionName)
    },

    getCollectionByEntity<TDomainEvent extends AnyDomainEvent = AnyDomainEvent>(
      entity: string,
    ): Collection<StoredEventStream<TDomainEvent, TProjections>> {
      const collectionName = entity
      return mongoClient.getDatabase().collection<StoredEventStream<TDomainEvent, TProjections>>(collectionName)
    },

    async getEventStreamBySubject<TDomainEvent extends AnyDomainEvent = AnyDomainEvent>(
      subject: Subject,
    ): Promise<ReadStreamResult<TDomainEvent>> {
      const streamSubject = getStreamSubjectFromSubject(subject)
      const collection = this.getCollectionBySubject<TDomainEvent>(streamSubject)
      const stream = await collection.findOne<
        StoredEventStream<TDomainEvent, TProjections>
      >(bySubject(streamSubject), {
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
        version: stream.version,
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
      // Same rule as the projection fold: after evolve returned null, the next
      // event starts again from the initial state.
      const state = events.reduce((state, event) => evolve(state ?? initialState(), event), initialState())
      return { state, streamExists, version }
    },

    async appendOrCreateStream<TDomainEvent extends AnyDomainEvent>(
      events: Array<TDomainEvent>,
      options: AppendStreamOptions,
    ): Promise<MultiStreamAppendResult<TDomainEvent, TProjections>> {
      if (!events || events.length === 0) {
        throw new Error('Cannot process an empty array of events')
      }

      const eventGroups = groupEventsByStreamSubject(events)

      // Opting out of the concurrency check is explicit: a map must cover
      // every stream in the append, so a forgotten stream fails loudly here
      // instead of silently appending unchecked.
      const { expectedVersions } = options
      const resolvedVersions = new Map<Subject, ExpectedStreamVersion>()
      for (const streamSubject of eventGroups.keys()) {
        const expected = expectedVersions === 'any' ? 'any' : expectedVersions.get(streamSubject)
        if (expected === undefined) {
          throw new MissingExpectedVersionError(streamSubject)
        }
        resolvedVersions.set(streamSubject, expected)
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
              resolvedVersions.get(streamSubject)!,
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
