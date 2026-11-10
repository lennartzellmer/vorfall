import type { DomainEvent, UnknownDomainEvent } from '../types/index'
import type { EventStoreInstance } from './eventStoreFactory'
import type { DeriveEvents, EventStoreOptions } from './eventStoreFactory.types'
import { expectTypeOf, test } from 'vitest'

type OrderPlaced = DomainEvent<'order.placed', { orderId: string }>

declare const eventStore: EventStoreInstance
declare const orderPlaced: OrderPlaced

// A returned stream holds every event stored in it: its earlier events and
// derived events, not only the ones passed to this append.
test('types the result stream events as unknown stored events, not as the appended ones', async () => {
  const result = await eventStore.appendOrCreateStream([orderPlaced], { expectedVersions: 'any' })

  expectTypeOf(result.streams[0]!.events[0]!).toEqualTypeOf<UnknownDomainEvent>()
})

test('requires a check before the data of a result stream event is used', async () => {
  const result = await eventStore.appendOrCreateStream([orderPlaced], { expectedVersions: 'any' })
  const event = result.streams[0]!.events[0]!

  // @ts-expect-error - data may be undefined
  void event.data.orderId
  // @ts-expect-error - a field of unknown data is unknown, not a string
  const orderId: string = event.data?.orderId

  expectTypeOf(event.type).toEqualTypeOf<string>()
  const data = event.data
  if (data && typeof data.orderId === 'string') {
    expectTypeOf(data.orderId).toEqualTypeOf<string>()
  }
  return orderId
})

test('takes a DeriveEvents function as the deriveEvents option', () => {
  expectTypeOf<EventStoreOptions['deriveEvents']>().toEqualTypeOf<DeriveEvents | undefined>()
})
