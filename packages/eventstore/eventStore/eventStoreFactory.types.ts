import type { Document, Filter } from 'mongodb'
import type { AnyDomainEvent, Subject } from '../types/index'
import type { ProjectionDefinition } from '../utils/utilsProjections.types'

export interface EventStoreOptions<TProjections extends readonly ProjectionDefinition<any, any, any>[] | undefined = undefined> {
  connectionString: string
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
    ? { [K in P[number] as K['name']]: ReturnType<K['evolve']> }
    : undefined
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
