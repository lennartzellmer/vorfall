import type { StreamConfig } from '../commandHandling/handleCommand.types'
import type { AnyDomainEvent, Subject } from '../types/index'
import type { ProjectionDefinition } from './utilsProjections.types'
import { createProjectionDefinition } from './utilsProjections'
import { createStreamSubject } from './utilsSubject'

/**
 * Everything callers need to work with one aggregate: its stream subject, the
 * stream configuration for `handleCommand` and the projection definition for
 * `createEventStore`, all derived from a single `evolve` function.
 */
export interface AggregateDefinition<
  TName extends string,
  TState extends object,
  TEvent extends AnyDomainEvent,
> {
  name: TName
  /** The stream subject `<name>/<id>` of one aggregate instance. */
  subject: (id: string) => Subject<TName>
  evolve: (state: TState | null, event: TEvent) => TState | null
  /** The `streams` entry for `handleCommand` that loads one aggregate instance. */
  stream: (id: string) => StreamConfig<TState | null, TEvent>
  projection: ProjectionDefinition<TState, TName, TEvent>
}

/**
 * Defines an aggregate by name and evolve function. An aggregate has no state
 * until its first event and none again after `evolve` returns `null`: both
 * the command-side fold and the projection start from `null`, so the two
 * never disagree. The projection folds every event of every stream under
 * `<name>/`, so `evolve` is the only place that lists the aggregate's event
 * types; there is no event type list that could drift from it.
 * @param config - The aggregate configuration
 * @param config.name - The aggregate name; used as the collection, the projection name and the subject prefix
 * @param config.evolve - Function to evolve the state based on an event
 * @returns The aggregate definition
 */
export function defineAggregate<
  TName extends string,
  TState extends object,
  TEvent extends AnyDomainEvent,
>(config: {
  name: TName
  evolve: (state: TState | null, event: TEvent) => TState | null
}): AggregateDefinition<TName, TState, TEvent> {
  const { name, evolve } = config
  const initialState = (): TState | null => null

  // The literal-level format check of createStreamSubject cannot judge a
  // generic name; the runtime check still guarantees the entity/id shape.
  const subject = (id: string) =>
    createStreamSubject(`${name}/${id}` as `${string}/${string}`) as Subject<TName>

  return {
    name,
    subject,
    evolve,
    stream: id => ({ evolve, initialState, streamSubject: subject(id) }),
    projection: createProjectionDefinition({ name, entity: name, evolve, initialState }),
  }
}
