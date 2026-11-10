import type { AnyDomainEvent, DomainEvent } from '../types/index'
import type { EventStoreInstance } from './eventStoreFactory'
import type { DeriveEvents, EventStoreOptions } from './eventStoreFactory.types'
import { expectTypeOf, test } from 'vitest'

type OrderPlaced = DomainEvent<'order.placed', { orderId: string }>

declare const eventStore: EventStoreInstance
declare const orderPlaced: OrderPlaced

// A returned stream holds every event stored in it: its earlier events and
// derived events, not only the ones passed to this append.
test('types the result stream events as any stored event, not as the appended ones', async () => {
  const result = await eventStore.appendOrCreateStream([orderPlaced], { expectedVersions: 'any' })

  expectTypeOf(result.streams[0]!.events[0]!).toEqualTypeOf<AnyDomainEvent>()
})

test('takes a DeriveEvents function as the deriveEvents option', () => {
  expectTypeOf<EventStoreOptions['deriveEvents']>().toEqualTypeOf<DeriveEvents | undefined>()
})
