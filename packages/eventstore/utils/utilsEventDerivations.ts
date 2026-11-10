import type { DeriveEvents } from '../eventStore/eventStoreFactory.types'
import type { AnyDomainEvent } from '../types/index'
import type { AnyEventDerivation, EventDerivation } from './utilsEventDerivations.types'

/**
 * Creates a derivation that reacts to the listed event types. Annotate the
 * `derive` parameter with the event type: `canHandle` is then checked against
 * it at compile time, and at runtime only events of a listed type are passed
 * in, so the annotation holds.
 * @param derivation - The derivation definition
 * @param derivation.canHandle - The event types the derivation reacts to
 * @param derivation.derive - Returns the events derived from one caller event
 * @returns The derivation, for `combineEventDerivations`
 * @template TEvent - The events the derivation handles
 */
export function createEventDerivation<TEvent extends AnyDomainEvent>(
  derivation: EventDerivation<TEvent>,
): EventDerivation<TEvent> {
  return { canHandle: derivation.canHandle, derive: derivation.derive }
}

/**
 * Turns derivations into the `deriveEvents` option of `createEventStore`.
 * The caller's events are taken in order; each one goes to every derivation
 * that lists its type, in the order the derivations are given.
 * @param derivations - Derivations created with `createEventDerivation`
 * @returns The function for the `deriveEvents` option
 */
export function combineEventDerivations(...derivations: ReadonlyArray<AnyEventDerivation>): DeriveEvents {
  return events => events.flatMap(event => derivations.flatMap(
    derivation => derivation.canHandle.includes(event.type) ? derivation.derive(event) : [],
  ))
}
