import type { EventStoreInstance } from '../eventStore/eventStoreFactory.js'
import type { EventStream, ProjectionQuery } from '../eventStore/eventStoreFactory.types.js'
import type { AnyDomainEvent, DefaultRecord, StreamSubject, Subject } from '../types/index.js'
import type { CanHandle, ProjectionDefinition, ProjectionQueryOptions } from './utilsProjections.types.js'
import { transformFilterForNestedPath } from './utilsMongoFilter.js'

/**
 * Creates a projection definition for handling events and evolving state in a type safe manner.
 * @param config - The configuration for the projection definition
 * @param config.name - The name of the projection
 * @param config.canHandle - Function to determine if the projection can handle a specific event
 * @param config.evolve - Function to evolve the state based on an event
 * @param config.initialState - Function to create the initial state
 * @returns A projection definition object
 * @template TState - The type of the state
 * @template TEvent - The type of the event
 */
export function createProjectionDefinition<
  TName extends string,
  TState extends DefaultRecord,
  TEvent extends AnyDomainEvent,
>(config: {
  name: TName
  canHandle: CanHandle<TEvent>
  evolve: (state: TState, event: TEvent) => TState
  initialState: () => TState | null
}): ProjectionDefinition<TState, TName, TEvent> {
  return {
    name: config.name,
    canHandle: config.canHandle,
    evolve: config.evolve,
    initialState: config.initialState,
  } as const
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
  TProjections extends readonly ProjectionDefinition<any, any, any>[],
>(
  eventStore: EventStoreInstance<TProjections>,
  streamSubject: StreamSubject,
  query: ProjectionQuery<TProjections[number]['name']>,
): Promise<(EventStream<any, any, any, TProjections> & { projections: NonNullable<EventStream<any, any, any, TProjections>['projections']> }) | null> {
  const { projectionName, projectionQuery } = query
  const collection = eventStore.getCollectionBySubject(streamSubject)

  const filters = [
    { streamSubject: { $eq: streamSubject } },
    { [`projections.${projectionName}`]: { $exists: true } },
  ]

  if (projectionQuery) {
    const queryTransfomed = transformFilterForNestedPath(projectionQuery, `projections.${projectionName}`)
    filters.push(queryTransfomed)
  }

  const result = await collection.findOne(
    {
      $and: filters,
    },
    {
      useBigInt64: true,
      projection: { _id: 0 },
    },
  )

  return result as (EventStream<any, any, any, TProjections> & { projections: NonNullable<EventStream<any, any, any, TProjections>['projections']> }) | null
}

/**
 * Finds multiple projections in the event store based on the provided filter and optional projection query.
 * @param eventStore - The event store instance to query
 * @param subject - The filter to find matching streams
 * @param query - The projectionName and query to filter the projections
 * @param queryOptions - Skip, limit and sort options for the query
 * @returns A promise that resolves to the found projections or an empty array if not found
 */
export async function findMultipleProjections<
  TProjections extends readonly ProjectionDefinition<any, any, any>[],
  TProjectionName extends TProjections[number]['name'],
>(

  eventStore: EventStoreInstance<TProjections>,
  subject: Subject,
  query: ProjectionQuery<TProjectionName>,
  queryOptions: ProjectionQueryOptions,
): Promise<Array<TProjections extends readonly ProjectionDefinition<any, any, any>[]
  ? NonNullable<EventStream<any, any, any, TProjections>['projections']>[TProjectionName]
  : unknown>> {
  const { projectionName, projectionQuery } = query

  const collection = eventStore.getCollectionBySubject(subject)

  const filters = [
    { [`projections.${projectionName}`]: { $exists: true } },
  ]

  if (projectionQuery) {
    const queryTransfomed = transformFilterForNestedPath(projectionQuery, `projections.${projectionName}`)
    filters.push(queryTransfomed)
  }

  let mongoQuery = collection.find<
    EventStream<any, any, any, TProjections>
  >(
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

  const result = streams.map(stream => stream.projections?.[projectionName]).filter(Boolean)

  return result as Array<TProjections extends readonly ProjectionDefinition<any, any, any>[]
    ? NonNullable<EventStream<any, any, any, TProjections>['projections']>[TProjectionName]
    : unknown>
}

/**
 * Counts the number of projections in the event store based on the provided filter.
 * @param eventStore - The event store instance to query
 * @param subject - The filter to find matching streams
 * @param query - The projectionName and query to filter the projections
 * @returns A promise that resolves to the count of projections
 */
export async function countProjections<TProjections extends readonly ProjectionDefinition<any, any, any>[]>(
  eventStore: EventStoreInstance<TProjections>,
  subject: Subject,
  query: ProjectionQuery<TProjections[number]['name']>,
): Promise<number> {
  const { projectionName, projectionQuery } = query
  const collection = eventStore.getCollectionBySubject(subject)

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
