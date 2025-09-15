import type { CloudEventV1 } from 'cloudevents'
import type { Brand, DefaultRecord } from './index'

export type Subject = Brand<`${string}/${string}`, 'Subject'>

export type AnyDomainEvent = DomainEvent<any, any, any, Subject>

export type DomainEvent<
  EventType extends string = string,
  EventData extends DefaultRecord | undefined = DefaultRecord,
  EventMetaData extends DefaultRecord | undefined = undefined,
  EventSubject extends Subject = Subject,
>
= CloudEventV1<EventData extends undefined ? undefined : EventData>
  & {
    type: EventType
    subject: EventSubject
    data: EventData extends undefined ? undefined : EventData
  } & (EventMetaData extends undefined ? Record<string, never> : { metadata: EventMetaData })

export interface eventStoreOptions {
  connectionString: string
}
