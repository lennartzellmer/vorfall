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
  /**
   * `state` is null when the projection doesn't exist yet (before the first
   * applicable event) or was deleted by a previous evolve call in the same
   * batch. Returning `null` deletes the projection document: the event store
   * removes `projections.<name>` from the stream instead of persisting a
   * null value.
   */
  evolve: (state: TState | null, event: TEventType) => TState | null
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
