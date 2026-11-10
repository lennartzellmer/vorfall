import type { AnyDomainEvent } from '../types/index'
import { describe, expect, it, vi } from 'vitest'
import { combineEventDerivations, createEventDerivation } from './utilsEventDerivations'
import { createDomainEvent } from './utilsEventStore'
import { createStreamSubject } from './utilsSubject'

describe('combineEventDerivations', () => {
  const orderStream = createStreamSubject('order/1')
  const orderPlaced = createDomainEvent({ type: 'order.placed', subject: orderStream, data: { orderId: '1' } })
  const orderCancelled = createDomainEvent({ type: 'order.cancelled', subject: orderStream, data: { reason: 'late' } })

  type OrderPlaced = typeof orderPlaced
  type OrderCancelled = typeof orderCancelled

  function taskFrom(by: string, event: AnyDomainEvent): AnyDomainEvent {
    return createDomainEvent({ type: 'task.created', subject: createStreamSubject('task/1'), data: { by, from: event.type } })
  }

  it('should pass only events of a listed type to derive', () => {
    const derive = vi.fn((_event: OrderPlaced): ReadonlyArray<AnyDomainEvent> => [])
    const deriveEvents = combineEventDerivations(createEventDerivation({ canHandle: ['order.placed'], derive }))

    deriveEvents([orderPlaced, orderCancelled])

    expect(derive).toHaveBeenCalledTimes(1)
    expect(derive).toHaveBeenCalledWith(orderPlaced)
  })

  it('should derive per caller event in order, and per event in the order of the derivations', () => {
    const first = createEventDerivation({
      canHandle: ['order.placed', 'order.cancelled'],
      derive: (event: OrderPlaced | OrderCancelled) => [taskFrom('first', event)],
    })
    const second = createEventDerivation({
      canHandle: ['order.placed'],
      derive: (event: OrderPlaced) => [taskFrom('second', event)],
    })

    const derived = combineEventDerivations(first, second)([orderPlaced, orderCancelled])

    expect(derived.map(event => event.data)).toEqual([
      { by: 'first', from: 'order.placed' },
      { by: 'second', from: 'order.placed' },
      { by: 'first', from: 'order.cancelled' },
    ])
  })

  it('should derive nothing when no derivation handles an event', () => {
    const deriveEvents = combineEventDerivations(createEventDerivation({
      canHandle: ['order.cancelled'],
      derive: (event: OrderCancelled) => [taskFrom('cancelled', event)],
    }))

    expect(deriveEvents([orderPlaced])).toEqual([])
  })
})
