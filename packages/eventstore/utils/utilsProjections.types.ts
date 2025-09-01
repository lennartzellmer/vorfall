import type { Document } from 'mongodb'
import type { AnyDomainEvent, DomainEvent, MaybeAwait } from '../types/index'

export type MessageTypeOf<T extends AnyDomainEvent> = T['type']

export type CanHandle<T extends AnyDomainEvent> = MessageTypeOf<T>[]

export interface ProjectionDefinition<
  TState,
  TName extends string = string,
  TEventType extends AnyDomainEvent = AnyDomainEvent,
> {
  name: TName
  canHandle: CanHandle<TEventType>
  evolve: (state: TState, event: TEventType) => TState
  initialState: () => TState | null
}

export type MongoDBWithNullableDocumentEvolve<
  Doc extends Document,
  EventType extends DomainEvent,
> = (
  document: Doc | null,
  event: EventType,
) => MaybeAwait<Doc | null>

export interface ProjectionQueryOptions {
  skip?: number
  limit?: number
  sort?: Record<string, 1 | -1>
}
