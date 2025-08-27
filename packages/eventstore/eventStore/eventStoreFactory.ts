import type { Collection, PushOperator, UpdateFilter, WithId } from 'mongodb'
import type { DefaultRecord, DomainEvent, Subject } from '../types/index.js'
import type { ProjectionDefinition } from '../utils/utilsProjections.types.js'
import type { EventStoreOptions, EventStream, ReadStreamResult } from './eventStoreFactory.types.js'
import { randomUUID } from 'node:crypto'
import { MongoClientWrapper } from '../mongoClient/mongoClientWrapper.js'
import { eventsHaveSameStreamSubject } from '../utils/utilsEventStore.js'
import { createSubject, getCollectionNameFromSubject, getStreamSubjectFromSubject } from '../utils/utilsSubject.js'

export interface EventStoreInstance<
  TProjections extends readonly ProjectionDefinition<any, any, any>[] | undefined = undefined,
> {
  getInstanceMongoClientWrapper: () => MongoClientWrapper
  getCollectionBySubject: <
    EventType extends string = string,
    EventData extends DefaultRecord = DefaultRecord,
    EventMetaData extends DefaultRecord | undefined = undefined,
  >(subject: Subject
  ) => Collection<EventStream<EventType, EventData, EventMetaData, TProjections>>
  getEventStreamBySubject: <
    EventType extends string = string,
    EventData extends DefaultRecord = DefaultRecord,
    EventMetaData extends DefaultRecord | undefined = undefined,
  >(subject: Subject
  ) => Promise<ReadStreamResult<EventType, EventData, EventMetaData>>
  aggregateStream: <
    State,
    EventType extends string = string,
    EventData extends DefaultRecord = DefaultRecord,
    EventMetaData extends DefaultRecord | undefined = undefined,
  >(
    streamSubject: Subject,
    options: {
      evolve: (state: State, event: DomainEvent<EventType, EventData, EventMetaData>) => State
      initialState: () => State
    }
  ) => Promise<State>
  appendOrCreateStream: <
    EventType extends string = string,
    EventData extends DefaultRecord = DefaultRecord,
    EventMetaData extends DefaultRecord | undefined = undefined,
  >(events: Array<DomainEvent<EventType, EventData, EventMetaData>>
  ) => Promise<EventStream<EventType, EventData, EventMetaData, TProjections>>
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

    getCollectionBySubject<
      EventType extends string = string,
      EventData extends DefaultRecord = DefaultRecord,
      EventMetaData extends DefaultRecord | undefined = undefined,
    >(subject: Subject,
    ): Collection<EventStream<EventType, EventData, EventMetaData, TProjections>> {
      const collectionName = getCollectionNameFromSubject(subject)
      return mongoClient.getDatabase().collection<EventStream<EventType, EventData, EventMetaData, TProjections>>(collectionName)
    },

    async getEventStreamBySubject<
      EventType extends string = string,
      EventData extends DefaultRecord = DefaultRecord,
      EventMetaData extends DefaultRecord | undefined = undefined,
    >(subject: Subject,
    ): Promise<ReadStreamResult<EventType, EventData, EventMetaData>> {
      const streamSubject = getStreamSubjectFromSubject(subject)
      const collection = this.getCollectionBySubject<EventType, EventData, EventMetaData>(streamSubject)
      const filter = {
        streamSubject: { $eq: streamSubject },
      }
      const stream = await collection.findOne<
        WithId<EventStream<EventType, EventData, EventMetaData, TProjections>>
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
      EventType extends string = string,
      EventData extends DefaultRecord = DefaultRecord,
      EventMetaData extends DefaultRecord | undefined = undefined,
    >(
      streamSubject: Subject,
      options: {
        evolve: (state: State, event: DomainEvent<EventType, EventData, EventMetaData>) => State
        initialState: () => State
      },
    ): Promise<State> {
      const { evolve, initialState } = options
      const { events } = await this.getEventStreamBySubject<EventType, EventData, EventMetaData>(streamSubject)
      if (!events) {
        return initialState()
      }
      const state = events.reduce((state, event) => evolve(state, event), initialState())
      return state
    },

    async appendOrCreateStream<
      EventType extends string = string,
      EventData extends DefaultRecord = DefaultRecord,
      EventMetaData extends DefaultRecord | undefined = undefined,
    >(
      events: Array<DomainEvent<EventType, EventData, EventMetaData>>,
    ): Promise<EventStream<EventType, EventData, EventMetaData, TProjections>> {
      const [firstEvent] = events

      if (!firstEvent) {
        throw new Error('Cannot check stream subject for an empty array of events')
      }

      if (!eventsHaveSameStreamSubject(events)) {
        throw new Error('All events must have the same stream subject')
      }

      const eventSubject = createSubject(firstEvent.subject)
      const streamSubject = getStreamSubjectFromSubject(eventSubject)

      const collection = this.getCollectionBySubject<EventType, EventData, EventMetaData>(streamSubject)

      const now = new Date()

      const updates: UpdateFilter<EventStream<EventType, EventData, EventMetaData, TProjections>> = {
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
        } as PushOperator<EventStream<EventType, EventData, EventMetaData, TProjections>>,
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

        const projectionUpdates: UpdateFilter<EventStream<EventType, EventData, EventMetaData, TProjections>> = { $set: setUpdates }
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
