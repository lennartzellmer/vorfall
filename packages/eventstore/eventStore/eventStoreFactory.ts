import type { Collection, PushOperator, UpdateFilter, WithId } from 'mongodb'
import type { AnyDomainEvent, Subject } from '../types/index'
import type { ProjectionDefinition } from '../utils/utilsProjections.types'
import type { EventStoreOptions, EventStream, ReadStreamResult } from './eventStoreFactory.types'
import { randomUUID } from 'node:crypto'
import { MongoClientWrapper } from '../mongoClient/mongoClientWrapper'
import { eventsHaveSameStreamSubject } from '../utils/utilsEventStore'
import { createSubject, getCollectionNameFromSubject, getStreamSubjectFromSubject } from '../utils/utilsSubject'

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
  ) => Promise<EventStream<TDomainEvent, TProjections>>
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
        WithId<EventStream<TDomainEvent, TProjections>>
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
    ): Promise<EventStream<TDomainEvent, TProjections>> {
      const [firstEvent] = events

      if (!firstEvent) {
        throw new Error('Cannot check stream subject for an empty array of events')
      }

      if (!eventsHaveSameStreamSubject(events)) {
        throw new Error('All events must have the same stream subject')
      }

      const eventSubject = createSubject(firstEvent.subject)
      const streamSubject = getStreamSubjectFromSubject(eventSubject)

      const collection = this.getCollectionBySubject<TDomainEvent>(streamSubject)

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
          },
        )
      }

      if (!result) {
        throw new Error(`Failed to upsert or update stream: ${streamSubject}`)
      }

      return result
    },
  }

  return eventStore
}
