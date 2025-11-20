import { describe, expect, it } from 'vitest'
import { createDomainEvent, eventsHaveSameStreamSubject, groupEventsByStreamSubject } from './utilsEventStore'
import { createSubject } from './utilsSubject'

describe('createDomainCloudEvent', () => {
  it('should create a CloudEvent with default values', () => {
    const event = createDomainEvent({
      type: 'user.created',
      subject: createSubject('user/123/created'),
      data: { name: 'John Doe' },
    })
    expect(event).toBeInstanceOf(Object)
    expect(event.id).toBeDefined()
    expect(event.specversion).toBe('1.0')
    expect(event.type).toBe('user.created')
    expect(event.source).toBe('vorfall.eventsourcing.system')
    expect(event.subject).toBe('user/123/created')
    expect(event.data).toEqual({ name: 'John Doe' })
    expect(event.datacontenttype).toBe('application/json')
    expect(event.version).toBe('1.0')
    expect(event.date).toBeInstanceOf(Date)
  })
})

describe('hasSameStreamSubject', () => {
  it('should return true for multiple events with the same stream subject', () => {
    const events = [
      createDomainEvent({
        type: 'user.created',
        subject: createSubject('user/123/orders/12'),
        data: { name: 'John Doe' },
      }),
      createDomainEvent({
        type: 'user.created',
        subject: createSubject('user/123/orders/12'),
        data: { name: 'John Doe' },
      }),
    ]
    const result = eventsHaveSameStreamSubject(events)
    expect(result).toBe(true)
  })
  it('should return true for one event in the array', () => {
    const events = [
      createDomainEvent({
        type: 'user.created',
        subject: createSubject('user/123/orders/12'),
        data: { name: 'John Doe' },
      }),
    ]
    const result = eventsHaveSameStreamSubject(events)
    expect(result).toBe(true)
  })
  it('should return false for different stream subjects', () => {
    const events = [
      createDomainEvent({
        type: 'user.created',
        subject: createSubject('user/345/orders/12'),
        data: { name: 'John Doe' },
      }),
      createDomainEvent({
        type: 'user.created',
        subject: createSubject('user/123/orders/12'),
        data: { name: 'John Doe' },
      }),
    ]
    const result = eventsHaveSameStreamSubject(events)
    expect(result).toBe(false)
  })

  it('should return true for different subjects if they are not in the first 2 parts', () => {
    const events = [
      createDomainEvent({
        type: 'user.created',
        subject: createSubject('user/123/orders/456'),
        data: { name: 'John Doe' },
      }),
      createDomainEvent({
        type: 'user.created',
        subject: createSubject('user/123/orders/123'),
        data: { name: 'John Doe' },
      }),
    ]
    const result = eventsHaveSameStreamSubject(events)
    expect(result).toBe(true)
  })
})

describe('groupEventsByStreamSubject', () => {
  const event1 = createDomainEvent({
    type: 'user.created',
    subject: createSubject('user/123'),
    data: { name: 'John Doe' },
  })
  const event2 = createDomainEvent({
    type: 'user.deleted',
    subject: createSubject('user/456'),
    data: { name: 'Mr. Doe' },
  })
  const event3 = createDomainEvent({
    type: 'user.unsubscribed',
    subject: createSubject('user/123'),
    data: { name: 'Jane Doe' },
  })
  const events = [
    event1,
    event2,
    event3,
  ]
  it('should group events by stream subject', () => {
    const result = groupEventsByStreamSubject(events)

    expect(result.size).toBe(2)
    expect(result.get(createSubject('user/123'))?.length).toBe(2)
    expect(result.get(createSubject('user/456'))?.length).toBe(1)
  })
})
