import type { Document, Filter } from 'mongodb'
import type { DefaultRecord, DomainEvent, StreamSubject } from '../types/index'
import type { ProjectionDefinition } from '../utils/utilsProjections.types'

export interface EventStoreOptions<TProjections extends readonly ProjectionDefinition<any, any, any>[] | undefined = undefined> {
  connectionString: string
  projections?: TProjections
}

export interface EventStream<
  EventType extends string = string,
  EventData extends DefaultRecord = DefaultRecord,
  EventMetaData extends DefaultRecord | undefined = undefined,
  P extends readonly ProjectionDefinition<any, any, any>[] | undefined = undefined,
> {
  streamId: string
  streamSubject: StreamSubject
  events: Array<DomainEvent<EventType, EventData, EventMetaData>>
  metadata: {
    createdAt: Date
    updatedAt: Date
  }
  projections?: P extends readonly ProjectionDefinition<any, any, any>[]
    ? { [K in P[number] as K['name']]: ReturnType<K['evolve']> }
    : undefined
}

export interface ReadStreamResult<
  EventType extends string = string,
  EventData extends DefaultRecord = DefaultRecord,
  EventMetaData extends DefaultRecord | undefined = undefined,
> {
  events: Array<DomainEvent<EventType, EventData, EventMetaData>>
  streamExists: boolean
}

export interface ProjectionQuery<TProjectionName extends string> {
  projectionName: TProjectionName
  projectionQuery?: Filter<Document>
}

export interface FindMultipleProjectionQuery<T extends StreamSubject = StreamSubject> {
  projectionName: string
  streamSubject: T
  streamIds?: string[]
}
