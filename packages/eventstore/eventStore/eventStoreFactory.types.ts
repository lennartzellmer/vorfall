import type { Document, Filter } from 'mongodb'
import type { MongoClientWrapperOptions } from '../mongoClient/mongoClientWrapper.types'
import type { AnyDomainEvent, Subject } from '../types/index'
import type { ProjectionDefinition, ProjectionNames, ProjectionStates, ProjectionStatesWith } from '../utils/utilsProjections.types'
import type { ExpectedStreamVersion } from './concurrencyError'

/**
 * Derives further events from the caller's events of one append. It sees
 * every event type, so its events are untyped; `combineEventDerivations`
 * builds one from typed derivations.
 */
export type DeriveEvents = (events: ReadonlyArray<AnyDomainEvent>) => ReadonlyArray<AnyDomainEvent>

export interface EventStoreOptions<TProjections extends readonly ProjectionDefinition<any, any, any>[] | undefined = undefined> extends MongoClientWrapperOptions {
  projections?: TProjections
  /**
   * Derives further events from the events of an append. They are written in
   * the same transaction, so either everything is stored or nothing.
   *
   * Runs once per `appendOrCreateStream` call, before the transaction starts,
   * and only sees the caller's events; derived events are not passed through
   * it again. It must be synchronous and free of side effects. If it throws,
   * nothing is written and the error reaches the caller unchanged.
   */
  deriveEvents?: DeriveEvents
}

export interface EventStream<
  TDomainEvent extends AnyDomainEvent = AnyDomainEvent,
  P extends readonly ProjectionDefinition<any, any, any>[] | undefined = undefined,
> {
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
 * The stored shape of a stream: the stream subject is the document `_id`.
 * `getCollectionBySubject` and `getCollectionByEntity` hand out collections
 * of this shape; `toDocument`/`fromDocument` translate to and from
 * `EventStream`.
 */
export type StoredEventStream<
  TDomainEvent extends AnyDomainEvent = AnyDomainEvent,
  P extends readonly ProjectionDefinition<any, any, any>[] | undefined = undefined,
> = Omit<EventStream<TDomainEvent, P>, 'streamSubject'> & { _id: Subject }

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
   * Expected version per stream subject. Every stream the caller writes to
   * must be listed — a missing entry throws MissingExpectedVersionError.
   * Streams that only derived events write to need no entry. Pass 'any' (for
   * one stream, or as the whole value to cover all streams) to append without
   * a concurrency check. On a mismatch the whole append (all streams in the
   * call) is rolled back with a ConcurrencyError.
   */
  expectedVersions: ReadonlyMap<Subject, ExpectedStreamVersion> | 'any'
}

export interface ProjectionQuery<TProjectionName extends string> {
  projectionName: TProjectionName
  projectionQuery?: Filter<Document>
  matchAll?: boolean
}

export interface FindMultipleProjectionQuery<T extends Subject = Subject> {
  projectionName: string
  streamSubject: T
}

/** What one `appendOrCreateStream` call wrote, for reporting only. */
export interface EventsWritten {
  /** Every event the call wrote. */
  total: number
  /** The events passed to `appendOrCreateStream`. */
  direct: number
  /** The events returned by `deriveEvents`. */
  derived: number
}

export interface MultiStreamAppendResult<
  P extends readonly ProjectionDefinition<any, any, any>[] | undefined = undefined,
> {
  /**
   * The caller's streams as stored after the write. A stream holds every
   * event stored in it, including earlier events and derived events, so its
   * events are not narrowed to the type of the appended ones.
   */
  streams: ReadonlyArray<EventStream<AnyDomainEvent, P>>
  eventsWritten: EventsWritten
  streamSubjects: Array<Subject>
}
