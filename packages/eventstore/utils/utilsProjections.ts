import type { EventStoreInstance } from '../eventStore/eventStoreFactory'
import type { EventStreamWithProjection, ProjectionQuery } from '../eventStore/eventStoreFactory.types'
import type { AnyDomainEvent, Brand, Subject } from '../types/index'
import type {
  AnyProjectionDefinition,
  EntitySelection,
  EventTypeSelection,
  ProjectionDefinition,
  ProjectionNames,
  ProjectionQueryOptions,
  ProjectionStateOf,
} from './utilsProjections.types'
import { bySubject, fromDocument } from '../eventStore/eventStreamDocument'
import { transformFilterForNestedPath } from './utilsMongoFilter'

/**
 * Creates a projection definition for handling events and evolving state in a type safe manner.
 * @param config - The configuration for the projection definition
 * @param config.name - The name of the projection
 * @param config.canHandle - The event types the projection folds, from any stream carrying them.
 * Use this for projections that observe a chosen subset of events.
 * @param config.entity - The entity whose streams the projection folds completely: every event of
 * every stream under `<entity>/`. Use this for aggregate projections, whose `evolve` handles all
 * events of its own stream; there is no event type list that could drift from `evolve`.
 * @param config.evolve - Function to evolve the state based on an event
 * @param config.initialState - Function to create the initial state
 * @returns A projection definition object
 * @template TState - The type of the state
 * @template TEvent - The type of the event
 */
export function createProjectionDefinition<
  TName extends string,
  TState extends object,
  TEvent extends AnyDomainEvent,
>(config: {
  name: TName
  evolve: (state: TState | null, event: TEvent) => TState | null
  initialState: () => TState | null
} & (EventTypeSelection<TEvent> | EntitySelection)): ProjectionDefinition<TState, TName, TEvent> {
  const { name, evolve, initialState } = config

  // Same discriminant as selectEventsForProjection: an explicit
  // `entity: undefined` (e.g. from a spread config) is a canHandle selection.
  if (config.entity !== undefined) {
    return { name, evolve, initialState, entity: config.entity }
  }
  return { name, evolve, initialState, canHandle: config.canHandle }
}

/**
 * Thrown when a projection's `evolve` returns `undefined` for an event, which
 * means it has no case for that event type. An entity-selected projection
 * receives every event of its streams, so a type missing from `evolve` would
 * otherwise leave the projection silently stale.
 */
export class UnhandledProjectionEventError extends Error {
  constructor(
    public readonly projectionName: string,
    public readonly eventType: string,
  ) {
    super(`Projection "${projectionName}" returned undefined for event type "${eventType}"; evolve must return a state or null for every event it receives`)
    this.name = 'UnhandledProjectionEventError'
  }
}

/**
 * The events of one append that a projection folds: all of them when the
 * stream belongs to the projection's entity, the ones whose type is listed in
 * `canHandle` otherwise. An empty result means the projection does not apply
 * to this append.
 * @param projection - The projection definition
 * @param streamSubject - The subject of the stream being appended to
 * @param events - The events being appended to that stream
 * @returns The events the projection folds, in append order
 */
export function selectEventsForProjection<TDomainEvent extends AnyDomainEvent>(
  projection: AnyProjectionDefinition,
  streamSubject: Subject,
  events: readonly TDomainEvent[],
): TDomainEvent[] {
  if (projection.entity !== undefined) {
    return streamSubject.startsWith(`${projection.entity}/`) ? [...events] : []
  }
  return events.filter(event => projection.canHandle.includes(event.type))
}

/**
 * Finds a projection in the event store based on the provided filter and optional projection query.
 * @param eventStore - The event store instance to query
 * @param streamSubject - The stream subject to filter by
 * @param query - The projection query containing projectionName and optional projectionQuery
 * @returns A promise that resolves to the found projection or undefined if not found
 * @template TDomainEvent - The type of the domain event
 * @template TProjections - The type of projections defined in the event store
 */
export async function findOneProjection<
  TProjections extends readonly AnyProjectionDefinition[],
  const TProjectionName extends ProjectionNames<TProjections>,
>(
  eventStore: EventStoreInstance<TProjections>,
  streamSubject: Subject,
  query: ProjectionQuery<TProjectionName>,
): Promise<EventStreamWithProjection<TProjections, TProjectionName> | null> {
  const { projectionName, projectionQuery } = query
  const collection = eventStore.getCollectionBySubject(streamSubject)

  const filters = [
    bySubject<AnyDomainEvent, TProjections>(streamSubject),
    { [`projections.${projectionName}`]: { $exists: true } },
  ]

  if (projectionQuery) {
    const queryTransfomed = transformFilterForNestedPath(projectionQuery, `projections.${projectionName}`)
    filters.push(queryTransfomed)
    if (query.matchAll) {
      filters.splice(0, 1)
    }
  }

  const result = await collection.findOne(
    {
      $and: filters,
    },
    {
      useBigInt64: true,
    },
  )

  if (!result) {
    return null
  }
  // The `$exists` filter above guarantees the queried projection is present;
  // that narrowing is not expressible through fromDocument's signature.
  return fromDocument(result) as unknown as EventStreamWithProjection<TProjections, TProjectionName>
}

/**
 * Finds multiple projections in the event store based on the provided filter and optional projection query.
 * @param eventStore - The event store instance to query
 * @param entity - The entity collection backing the projection data
 * @param query - The projectionName and query to filter the projections
 * @param queryOptions - Skip, limit and sort options for the query
 * @returns A promise that resolves to the found projections or an empty array if not found
 */
type SubjectValue<TSubject extends Subject> = TSubject extends Brand<infer TValue, 'Subject'> ? TValue : never

type EntityFromSubject<TSubject extends Subject> = SubjectValue<TSubject> extends `${infer Entity}/${string}`
  ? Entity
  : never

type ProjectionEntity<
  TProjections extends readonly AnyProjectionDefinition[],
  TProjectionName extends ProjectionNames<TProjections>,
> = Extract<TProjections[number], { name: TProjectionName }> extends ProjectionDefinition<any, any, infer TEventType>
  ? TEventType extends { subject: infer TSubject }
    ? TSubject extends Subject
      ? EntityFromSubject<TSubject>
      : never
    : never
  : never

export async function findMultipleProjections<
  TProjections extends readonly AnyProjectionDefinition[],
  const TProjectionName extends ProjectionNames<TProjections>,
>(
  eventStore: EventStoreInstance<TProjections>,
  entity: ProjectionEntity<TProjections, TProjectionName>,
  query: ProjectionQuery<TProjectionName>,
  queryOptions: ProjectionQueryOptions,
): Promise<Array<ProjectionStateOf<TProjections, TProjectionName>>> {
  const { projectionName, projectionQuery } = query

  // If entity includes a / that means it cannot be a collection name of an entity. The function should throw an error then.
  if (entity.includes('/')) {
    throw new Error(`Invalid entity name: ${entity}. Entity names cannot include slashes.`)
  }

  const collection = eventStore.getCollectionByEntity(entity)

  const filters = [
    { [`projections.${projectionName}`]: { $exists: true } },
  ]

  if (projectionQuery) {
    const queryTransfomed = transformFilterForNestedPath(projectionQuery, `projections.${projectionName}`)
    filters.push(queryTransfomed)
  }

  // The mongo projection only returns the `projections` sub-document, and only
  // the key that was queried by name.
  let mongoQuery = collection.find<{
    projections?: Partial<Record<TProjectionName, ProjectionStateOf<TProjections, TProjectionName>>>
  }>(
    { $and: filters },
    {
      useBigInt64: true,
      projection: { [`projections.${projectionName}`]: 1 },
    },
  )

  if (queryOptions?.skip) {
    mongoQuery = mongoQuery.skip(queryOptions.skip)
  }

  if (queryOptions?.limit) {
    mongoQuery = mongoQuery.limit(queryOptions.limit)
  }

  if (queryOptions?.sort) {
    const sort = transformFilterForNestedPath(queryOptions.sort, `projections.${projectionName}`)
    mongoQuery = mongoQuery.sort(sort)
  }

  const streams = await mongoQuery.toArray()

  return streams
    .map(stream => stream.projections?.[projectionName])
    .filter((state): state is ProjectionStateOf<TProjections, TProjectionName> => state != null)
}

/**
 * Counts the number of projections in the event store based on the provided filter.
 * @param eventStore - The event store instance to query
 * @param entity - The entity collection backing the projection data
 * @param query - The projectionName and query to filter the projections
 * @returns A promise that resolves to the count of projections
 */
export async function countProjections<
  TProjections extends readonly AnyProjectionDefinition[],
  const TProjectionName extends ProjectionNames<TProjections>,
>(
  eventStore: EventStoreInstance<TProjections>,
  entity: ProjectionEntity<TProjections, TProjectionName>,
  query: ProjectionQuery<TProjectionName>,
): Promise<number> {
  const { projectionName, projectionQuery } = query
  const collection = eventStore.getCollectionByEntity(entity)

  const filters = [
    { [`projections.${projectionName}`]: { $exists: true } },
  ]

  if (projectionQuery) {
    const queryTransfomed = transformFilterForNestedPath(projectionQuery, `projections.${projectionName}`)
    filters.push(queryTransfomed)
  }

  const result = await collection.countDocuments({
    $and: filters,
  })

  return result
}
