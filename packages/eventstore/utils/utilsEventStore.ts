import type { EventStream } from '../eventStore/eventStoreFactory.types'
import type { AnyDomainEvent, DefaultRecord, DomainEvent, Subject } from '../types/index'
import type { StreamSubjectFromSubject } from './utilsSubject'
import { randomUUID } from 'node:crypto'
import { CloudEvent } from 'cloudevents'
import { createSubject, getStreamSubjectFromSubject } from './utilsSubject'

/**
 * Check if all events in an array have the same 2 parts in their subject
 * @param events The array of cloudevents to check
 * @returns The collection name
 */
export function eventsHaveSameStreamSubject<
  EventType extends string = string,
  EventData extends DefaultRecord | undefined = DefaultRecord,
  EventMetaData extends DefaultRecord | undefined = undefined,
>(events: Array<DomainEvent<EventType, EventData, EventMetaData>>): boolean {
  const [firstEvent] = events
  if (!firstEvent) {
    throw new Error('Cannot check stream subject for an empty array of events')
  }
  const firstEventSubject = createSubject(firstEvent.subject)
  const firstStreamSubject = getStreamSubjectFromSubject(firstEventSubject)
  return events.every((event) => {
    const eventSubject = createSubject(event.subject)
    return getStreamSubjectFromSubject(eventSubject) === firstStreamSubject
  })
}

/**
 * Creates a DomainCloudEvent which is a CloudEvent with a mandatory subject field
 * @template Type The event type as a string literal
 * @template EventData The type of the data in the CloudEvent
 * @template EventMetaData The metadata type
 * @param domainCloudEventAttributes The attributes for the CloudEvent
 * @returns A DomainCloudEvent with the specified data and inferred types
 */
export function createDomainEvent<
  Type extends string = string,
  EventData extends DefaultRecord | undefined = undefined,
  EventMetaData extends DefaultRecord | undefined = undefined,
  TSubject extends Subject = Subject,
>(
  domainCloudEventAttributes: EventMetaData extends undefined
    ? {
        type: Type
        subject: TSubject
        data?: EventData | undefined
      }
    : {
        type: Type
        subject: TSubject
        data?: EventData | undefined
        metadata: EventMetaData
      },
): DomainEvent<Type, EventData, EventMetaData, TSubject> {
  const DEFAULTS = {
    id: randomUUID(),
    source: 'vorfall.eventsourcing.system',
    specversion: '1.0',
    version: '1.0',
    date: new Date(),
    datacontenttype: 'application/json',
  } as const

  const eventAttributes = { ...DEFAULTS, ...domainCloudEventAttributes }
  const cloudEvent = new CloudEvent(eventAttributes) as unknown as DomainEvent<Type, EventData, EventMetaData, TSubject>

  return cloudEvent
}

/**
 * Creates an EventStream from an array of DomainEvents
 * @template TDomainEvent The DomainEvent type
 * @param events The array of DomainEvents to create the EventStream from
 * @returns An EventStream containing the provided events
 */
export function createEventStream<TDomainEvent extends AnyDomainEvent>(
  events: Array<TDomainEvent>,
): EventStream<TDomainEvent> {
  const firstEvent = events[0]

  if (!firstEvent) {
    throw new Error('Cannot create an event stream from an empty array of events')
  }

  const subject = createSubject(firstEvent.subject)

  const streamSubject = getStreamSubjectFromSubject(subject)

  return {
    streamId: randomUUID(),
    streamSubject,
    events,
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    projections: undefined,
  }
}

type StreamSubjectFromEvents<TEvents extends ReadonlyArray<AnyDomainEvent>>
  = StreamSubjectFromSubject<TEvents[number]['subject']>

type EventsForStream<
  TEvents extends ReadonlyArray<AnyDomainEvent>,
  TStream extends Subject,
> = TEvents[number] extends infer TEvent
  ? TEvent extends { subject: infer TSubject }
    ? StreamSubjectFromSubject<TSubject & Subject> extends TStream
      ? TEvent
      : never
    : never
  : never

interface GroupedEventsByStreamSubjectMap<TEvents extends ReadonlyArray<AnyDomainEvent>>
  extends ReadonlyMap<StreamSubjectFromEvents<TEvents>, Array<TEvents[number]>> {
  get: <TStream extends StreamSubjectFromEvents<TEvents>>(
    key: TStream,
  ) => Array<EventsForStream<TEvents, TStream>> | undefined
  has: <TStream extends StreamSubjectFromEvents<TEvents>>(key: TStream) => boolean
}

/**
 * Groups events by their stream subject
 * @template TEvents The array of events to group
 * @param events The array of events to group
 * @returns A Map where keys are stream subjects and values are arrays of events for that stream
 */
export function groupEventsByStreamSubject<const TEvents extends ReadonlyArray<AnyDomainEvent>>(
  events: TEvents,
): GroupedEventsByStreamSubjectMap<TEvents> {
  const eventGroups = new Map<Subject, Array<TEvents[number]>>()

  for (const event of events) {
    const streamSubject = getStreamSubjectFromSubject(event.subject)

    if (!eventGroups.has(streamSubject)) {
      eventGroups.set(streamSubject, [])
    }
    eventGroups.get(streamSubject)!.push(event)
  }

  return eventGroups as unknown as GroupedEventsByStreamSubjectMap<TEvents>
}
