import type { DomainEvent } from './index'
import { expectTypeOf, test } from 'vitest'
import { createDomainEvent } from '../utils/utilsEventStore'

type OrderPlaced = DomainEvent<'order.placed', { orderId: string }>
type OrderPlacedWithMetadata = DomainEvent<'order.placed', { orderId: string }, { userId: string }>

declare const orderPlaced: OrderPlaced
declare const orderPlacedWithMetadata: OrderPlacedWithMetadata

test('lets a copy of an event without metadata override its attributes', () => {
  const later: OrderPlaced = { ...orderPlaced, time: '2027-03-01T12:00:00.000Z' }

  expectTypeOf(later.time).toEqualTypeOf<string | undefined>()
  expectTypeOf(later.data.orderId).toEqualTypeOf<string>()
})

test('keeps the event type when an event without metadata is passed to createDomainEvent', () => {
  expectTypeOf(createDomainEvent({ ...orderPlaced, data: { orderId: 'order-2' } }))
    .toEqualTypeOf<DomainEvent<'order.placed', { orderId: string }, undefined, OrderPlaced['subject']>>()
})

test('rejects metadata on an event typed without metadata', () => {
  // @ts-expect-error - OrderPlaced carries no metadata
  const withMetadata: OrderPlaced = { ...orderPlaced, metadata: { userId: 'user-1' } }
  void withMetadata
})

test('requires the metadata of an event typed with metadata', () => {
  expectTypeOf(orderPlacedWithMetadata.metadata).toEqualTypeOf<{ userId: string }>()

  const { metadata: _metadata, ...withoutMetadata } = orderPlacedWithMetadata
  // @ts-expect-error - metadata is missing
  const missing: OrderPlacedWithMetadata = withoutMetadata
  void missing
})
