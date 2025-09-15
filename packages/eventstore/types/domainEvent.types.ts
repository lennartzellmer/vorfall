import type { CloudEventV1 } from 'cloudevents'
import type { Brand, DefaultRecord } from './index'

export type Subject = Brand<`${string}/${string}`, 'Subject'>

export type StreamSubject = Subject

export type AnyDomainEvent = DomainEvent<any, any, any>

export type DomainEvent<
  EventType extends string = string,
  EventData extends DefaultRecord | undefined = DefaultRecord,
  EventMetaData extends DefaultRecord | undefined = undefined,
>
= CloudEventV1<EventData extends undefined ? undefined : EventData>
  & {
    type: EventType
    subject: Subject
    data: EventData extends undefined ? undefined : EventData
  } & (EventMetaData extends undefined ? Record<string, never> : { metadata: EventMetaData })

export interface eventStoreOptions {
  connectionString: string
}
