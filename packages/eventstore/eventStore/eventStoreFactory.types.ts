import type { Document, Filter } from 'mongodb'
import type { MongoClientWrapperOptions } from '../mongoClient/mongoClientWrapper.types'
import type { AnyDomainEvent, Subject } from '../types/index'
import type { ProjectionDefinition, ProjectionNames, ProjectionStates, ProjectionStatesWith } from '../utils/utilsProjections.types'

export interface EventStoreOptions<TProjections extends readonly ProjectionDefinition<any, any, any>[] | undefined = undefined> extends MongoClientWrapperOptions {
  projections?: TProjections
}

export interface EventStream<
  TDomainEvent extends AnyDomainEvent = AnyDomainEvent,
  P extends readonly ProjectionDefinition<any, any, any>[] | undefined = undefined,
> {
  streamId: string
  streamSubject: Subject
  events: Array<TDomainEvent>
  metadata: {
    createdAt: Date
    updatedAt: Date
  }
  projections?: P extends readonly ProjectionDefinition<any, any, any>[]
    ? ProjectionStates<P>
    : undefined
}

/**
 * The result of a projection query: an event stream on which the projection
 * that was queried by name is guaranteed to be present and non-null.
 */
export type EventStreamWithProjection<
  TProjections extends readonly ProjectionDefinition<any, any, any>[],
  TProjectionName extends ProjectionNames<TProjections>,
  TDomainEvent extends AnyDomainEvent = AnyDomainEvent,
> = Omit<EventStream<TDomainEvent, TProjections>, 'projections'> & {
  projections: ProjectionStatesWith<TProjections, TProjectionName>
}

export interface ReadStreamResult<
  TDomainEvent extends AnyDomainEvent = AnyDomainEvent,
> {
  events: Array<TDomainEvent>
  streamExists: boolean
}

export interface ProjectionQuery<TProjectionName extends string> {
  projectionName: TProjectionName
  projectionQuery?: Filter<Document>
  matchAll?: boolean
}

export interface FindMultipleProjectionQuery<T extends Subject = Subject> {
  projectionName: string
  streamSubject: T
  streamIds?: string[]
}

export interface MultiStreamAppendResult<
  TDomainEvent extends AnyDomainEvent = AnyDomainEvent,
  P extends readonly ProjectionDefinition<any, any, any>[] | undefined = undefined,
> {
  streams: ReadonlyArray<EventStream<TDomainEvent, P>>
  totalEventsAppended: number
  streamSubjects: Array<Subject>
}
