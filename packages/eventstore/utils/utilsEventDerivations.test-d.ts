import type { DeriveEvents } from '../eventStore/eventStoreFactory.types'
import type { DomainEvent } from '../types/index'
import { expectTypeOf, test } from 'vitest'
import { combineEventDerivations, createEventDerivation } from './utilsEventDerivations'

type OrderPlaced = DomainEvent<'order.placed', { orderId: string }>
type OrderCancelled = DomainEvent<'order.cancelled', { reason: string }>
type TaskCreated = DomainEvent<'task.created', { orderId: string }>

declare const taskCreated: TaskCreated

test('types the derive parameter as the annotated event', () => {
  createEventDerivation({
    canHandle: ['order.placed'],
    derive: (event: OrderPlaced) => {
      expectTypeOf(event.data.orderId).toEqualTypeOf<string>()
      return [taskCreated]
    },
  })
})

test('narrows a union of handled events by their type', () => {
  createEventDerivation({
    canHandle: ['order.placed', 'order.cancelled'],
    derive: (event: OrderPlaced | OrderCancelled) => {
      if (event.type === 'order.cancelled') {
        expectTypeOf(event.data).toEqualTypeOf<{ reason: string }>()
        return []
      }
      expectTypeOf(event.data).toEqualTypeOf<{ orderId: string }>()
      return [taskCreated]
    },
  })
})

test('rejects a canHandle entry that is not a type of the derive parameter', () => {
  createEventDerivation({
    // @ts-expect-error - 'order.plaecd' is not the type of OrderPlaced
    canHandle: ['order.plaecd'],
    derive: (_event: OrderPlaced) => [taskCreated],
  })
})

test('rejects a derive that does not return domain events', () => {
  createEventDerivation({
    canHandle: ['order.placed'],
    // @ts-expect-error - a string is not a domain event
    derive: (_event: OrderPlaced) => ['task.created'],
  })
})

test('combines derivations of different event types into the deriveEvents option', () => {
  const forPlaced = createEventDerivation({ canHandle: ['order.placed'], derive: (_event: OrderPlaced) => [taskCreated] })
  const forCancelled = createEventDerivation({ canHandle: ['order.cancelled'], derive: (_event: OrderCancelled) => [] })

  expectTypeOf(combineEventDerivations(forPlaced, forCancelled)).toEqualTypeOf<DeriveEvents>()
})
