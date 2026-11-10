import type { AnyDomainEvent } from '../types/index'
import type { CanHandle } from './utilsProjections.types'

/**
 * Derives events from one caller event of a listed type. Only events whose
 * type is in `canHandle` reach `derive`, so its parameter can be typed with
 * exactly those events.
 */
export interface EventDerivation<TEvent extends AnyDomainEvent = AnyDomainEvent> {
  /** The event types this derivation reacts to. */
  canHandle: CanHandle<TEvent>
  /** The events derived from one caller event; `[]` derives nothing. */
  derive: (event: TEvent) => ReadonlyArray<AnyDomainEvent>
}

export type AnyEventDerivation = EventDerivation<any>
