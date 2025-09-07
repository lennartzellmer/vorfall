import type { ClientSession, Collection, PushOperator, UpdateFilter } from 'mongodb'
import type { AnyDomainEvent, StreamSubject, Subject } from '../types/index'
import type { ProjectionDefinition } from '../utils/utilsProjections.types'
import type { EventStoreOptions, EventStream, MultiStreamAppendResult, ReadStreamResult } from './eventStoreFactory.types'
import { randomUUID } from 'node:crypto'
import { MongoClientWrapper } from '../mongoClient/mongoClientWrapper'
import { groupEventsByStreamSubject } from '../utils/utilsEventStore'
import { getCollectionNameFromSubject, getStreamSubjectFromSubject } from '../utils/utilsSubject'

export interface EventStoreInstance<
  TProjections extends readonly ProjectionDefinition<any, any, any>[] | undefined = undefined,
> {
  getInstanceMongoClientWrapper: () => MongoClientWrapper
  getCollectionBySubject: <TDomainEvent extends AnyDomainEvent = AnyDomainEvent>(
    subject: Subject
  ) => Collection<EventStream<TDomainEvent, TProjections>>
  getEventStreamBySubject: <TDomainEvent extends AnyDomainEvent = AnyDomainEvent>(
    subject: Subject
  ) => Promise<ReadStreamResult<TDomainEvent>>
  aggregateStream: <
    State,
    TDomainEvent extends AnyDomainEvent = AnyDomainEvent,
  >(
    streamSubject: Subject,
    options: {
      evolve: (state: State, event: TDomainEvent) => State
      initialState: () => State
    }
  ) => Promise<State>
  appendOrCreateStream: <TDomainEvent extends AnyDomainEvent>(
    events: Array<TDomainEvent>
  ) => Promise<MultiStreamAppendResult<TDomainEvent, TProjections>>
}

/**
 * Helper function to process a single stream within a transaction
 */
async function processStreamInTransaction<
  TDomainEvent extends AnyDomainEvent,
  TProjections extends readonly ProjectionDefinition<any, any, any>[] | undefined = undefined,
>(
  streamSubject: StreamSubject,
  events: Array<TDomainEvent>,
  collection: Collection<EventStream<TDomainEvent, TProjections>>,
  projections: TProjections,
  session?: ClientSession,
): Promise<EventStream<TDomainEvent, TProjections>> {
  const now = new Date()

  const updates: UpdateFilter<EventStream<TDomainEvent, TProjections>> = {
    $setOnInsert: {
      'streamId': randomUUID(),
      'metadata.createdAt': now,
      streamSubject,
    },
    $set: {
      'metadata.updatedAt': now,
    },
    $push: {
      events: { $each: events },
    } as PushOperator<EventStream<TDomainEvent, TProjections>>,
  }

  let result = await collection.findOneAndUpdate(
    { streamSubject },
    updates,
    {
      useBigInt64: true,
      upsert: true,
      ignoreUndefined: true,
      returnDocument: 'after',
      projection: { _id: 0 },
      ...(session && { session }),
    },
  )

  if (projections && projections.length > 0) {
    const eventTypes = events.map(event => event.type)
    const applicableProjections = projections.filter(p =>
      p.canHandle.some(type => eventTypes.includes(type)),
    )

    const setUpdates: Record<string, any> = {}
    for (const projection of applicableProjections) {
      const state = events.reduce((state, event) => projection.evolve(state, event), result?.projections?.[projection.name] || projection.initialState())
      setUpdates[`projections.${projection.name}`] = state
    }

    const projectionUpdates: UpdateFilter<EventStream<TDomainEvent, TProjections>> = { $set: setUpdates }
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
  const mongoClient = new MongoClientWrapper({ connectionString: options.connectionString })
  const projections = options.projections || ([] as unknown as TProjections)

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
        }
      }
      return {
        events: stream.events,
        streamExists: true,
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
    ): Promise<State> {
      const { evolve, initialState } = options
      const { events } = await this.getEventStreamBySubject<TDomainEvent>(streamSubject)
      if (!events) {
        return initialState()
      }
      const state = events.reduce((state, event) => evolve(state, event), initialState())
      return state
    },

    async appendOrCreateStream<TDomainEvent extends AnyDomainEvent>(
      events: Array<TDomainEvent>,
    ): Promise<MultiStreamAppendResult<TDomainEvent, TProjections>> {
      if (!events || events.length === 0) {
        throw new Error('Cannot process an empty array of events')
      }

      // Group events by stream subject
      const eventGroups = groupEventsByStreamSubject(events)

      // If all events belong to the same stream, we can optimize by avoiding transaction overhead
      if (eventGroups.size === 1) {
        const firstEntry = eventGroups.entries().next().value as [StreamSubject, Array<TDomainEvent>]
        const [streamSubject, streamEvents] = firstEntry
        const collection = this.getCollectionBySubject<TDomainEvent>(streamSubject)

        const client = mongoClient.getClient()
        const session = client.startSession()

        try {
          const result = await session.withTransaction(async () => {
            return await processStreamInTransaction(
              streamSubject,
              streamEvents,
              collection,
              projections,
              session,
            )
          })

          return {
            streams: [result],
            totalEventsAppended: events.length,
            streamSubjects: [streamSubject],
          }
        }
        finally {
          await session.endSession()
        }
      }

      // Handle multiple streams with MongoDB transaction
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
