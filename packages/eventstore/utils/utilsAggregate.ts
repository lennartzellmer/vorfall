import type { StreamConfig } from '../commandHandling/handleCommand.types'
import type { AnyDomainEvent, Brand, DefaultRecord } from '../types/index'
import type { ProjectionDefinition } from './utilsProjections.types'
import { createProjectionDefinition } from './utilsProjections'
import { createStreamSubject } from './utilsSubject'

/**
 * Everything callers need to work with one aggregate: its stream subject, the
 * stream configuration for `handleCommand` and the projection definition for
 * `createEventStore`, all derived from a single `evolve`/`initialState` pair.
 */
export interface AggregateDefinition<
  TName extends string,
  TState extends DefaultRecord,
  TEvent extends AnyDomainEvent,
> {
  name: TName
  /** The stream subject `<name>/<id>` of one aggregate instance. */
  subject: (id: string) => Brand<`${TName}/${string}`, 'Subject'>
  evolve: (state: TState | null, event: TEvent) => TState | null
  initialState: () => TState | null
  /** The `streams` entry for `handleCommand` that loads one aggregate instance. */
  stream: (id: string) => StreamConfig<TState | null, TEvent>
  projection: ProjectionDefinition<TState, TName, TEvent>
}

/**
 * Defines an aggregate: name, evolve and initial state. The projection folds
 * every event of every stream under `<name>/`, so `evolve` is the only place
 * that lists the aggregate's event types; there is no event type list that
 * could drift from it.
 * @param config - The aggregate configuration
 * @param config.name - The aggregate name; used as the collection, the projection name and the subject prefix
 * @param config.evolve - Function to evolve the state based on an event
 * @param config.initialState - Function to create the initial state
 * @returns The aggregate definition
 */
export function defineAggregate<
  TName extends string,
  TState extends DefaultRecord,
  TEvent extends AnyDomainEvent,
>(config: {
  name: TName
  evolve: (state: TState | null, event: TEvent) => TState | null
  initialState: () => TState | null
}): AggregateDefinition<TName, TState, TEvent> {
  const { name, evolve, initialState } = config

  // The literal-level format check of createStreamSubject cannot judge a
  // generic name; the runtime check still guarantees the entity/id shape.
  const subject = (id: string) =>
    createStreamSubject(`${name}/${id}` as `${string}/${string}`) as unknown as Brand<`${TName}/${string}`, 'Subject'>

  return {
    name,
    subject,
    evolve,
    initialState,
    stream: id => ({ evolve, initialState, streamSubject: subject(id) }),
    projection: createProjectionDefinition({ name, entity: name, evolve, initialState }),
  }
}
