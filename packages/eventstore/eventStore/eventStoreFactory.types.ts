import type { Document, Filter } from 'mongodb'
import type { MongoClientWrapperOptions } from '../mongoClient/mongoClientWrapper.types'
import type { AnyDomainEvent, Subject } from '../types/index'
import type { ProjectionDefinition, ProjectionNames, ProjectionStates, ProjectionStatesWith } from '../utils/utilsProjections.types'
import type { ExpectedStreamVersion } from './concurrencyError'

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
  /** Number of events in the stream, used for optimistic concurrency checks */
  version: number
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
  /** Current stream version (0 if the stream does not exist) */
  version: number
}

export interface AggregateStreamResult<State> {
  state: State
  streamExists: boolean
  /** Stream version at read time; pass as expectedVersion when appending */
  version: number
}

export interface AppendStreamOptions {
  /**
   * Expected version per stream subject. Streams not listed are appended
   * unconditionally ('any'). On a mismatch the whole append (all streams in
   * the call) is rolled back with a ConcurrencyError.
   */
  expectedVersions?: ReadonlyMap<Subject, ExpectedStreamVersion>
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
