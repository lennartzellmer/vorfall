import { describe, expect, it } from 'vitest'
import { createDomainEvent, eventsHaveSameStreamSubject } from './utilsEventStore.js'
import { createSubject } from './utilsSubject.js'

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
        type: 'benutzer.erstellt',
        subject: createSubject('veranstaltung/123/registrierung/12'),
        data: { name: 'John Doe' },
      }),
      createDomainEvent({
        type: 'benutzer.erstellt',
        subject: createSubject('veranstaltung/123/registrierung/12'),
        data: { name: 'John Doe' },
      }),
    ]
    const result = eventsHaveSameStreamSubject(events)
    expect(result).toBe(true)
  })
  it('should return true for one event in the array', () => {
    const events = [
      createDomainEvent({
        type: 'benutzer.erstellt',
        subject: createSubject('veranstaltung/123/registrierung/12'),
        data: { name: 'John Doe' },
      }),
    ]
    const result = eventsHaveSameStreamSubject(events)
    expect(result).toBe(true)
  })
  it('should return false for differnt stream subjects', () => {
    const events = [
      createDomainEvent({
        type: 'benutzer.erstellt',
        subject: createSubject('veranstaltung/345/registrierung/12'),
        data: { name: 'John Doe' },
      }),
      createDomainEvent({
        type: 'benutzer.erstellt',
        subject: createSubject('veranstaltung/123/registrierung/12'),
        data: { name: 'John Doe' },
      }),
    ]
    const result = eventsHaveSameStreamSubject(events)
    expect(result).toBe(false)
  })

  it('should return true for differnt subjects if they are not in the first 2 parts', () => {
    const events = [
      createDomainEvent({
        type: 'benutzer.erstellt',
        subject: createSubject('veranstaltung/123/registrierung/456'),
        data: { name: 'John Doe' },
      }),
      createDomainEvent({
        type: 'benutzer.erstellt',
        subject: createSubject('veranstaltung/123/registrierung/123'),
        data: { name: 'John Doe' },
      }),
    ]
    const result = eventsHaveSameStreamSubject(events)
    expect(result).toBe(true)
  })
})
