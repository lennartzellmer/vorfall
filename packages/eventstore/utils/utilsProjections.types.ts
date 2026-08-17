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

export type AnyProjectionDefinition = ProjectionDefinition<any, any, any>

/**
 * The literal union of every projection name defined on an event store.
 */
export type ProjectionNames<TProjections extends readonly AnyProjectionDefinition[]> = TProjections[number]['name']

/**
 * The persisted state of a single projection. `null` is stripped on purpose:
 * `evolve` returns `null` to signal deletion, in which case the event store
 * `$unset`s the key instead of storing a null value, so a projection that is
 * present on a document is never null.
 */
export type ProjectionStateOf<
  TProjections extends readonly AnyProjectionDefinition[],
  TProjectionName extends ProjectionNames<TProjections>,
> = NonNullable<ReturnType<Extract<TProjections[number], { name: TProjectionName }>['evolve']>>

/**
 * The `projections` sub-document as it is actually persisted: every key is
 * optional, because a projection only materialises once it has handled an
 * applicable event (and disappears again when `evolve` returns `null`).
 */
export type ProjectionStates<TProjections extends readonly AnyProjectionDefinition[]> = {
  [K in TProjections[number] as K['name']]?: NonNullable<ReturnType<K['evolve']>>
}

/**
 * `ProjectionStates` narrowed by a query: the projection that was queried by
 * name is guaranteed to exist (the query filters on `$exists: true`), all
 * others stay optional.
 */
export type ProjectionStatesWith<
  TProjections extends readonly AnyProjectionDefinition[],
  TProjectionName extends ProjectionNames<TProjections>,
> = { [K in TProjectionName]-?: ProjectionStateOf<TProjections, K> }
  & { [K in Exclude<ProjectionNames<TProjections>, TProjectionName>]?: ProjectionStateOf<TProjections, K> }

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
