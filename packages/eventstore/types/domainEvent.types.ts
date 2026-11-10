import type { CloudEventV1 } from 'cloudevents'
import type { Brand, DefaultRecord } from './index'

export type Subject<TEntity extends string = string> = Brand<`${TEntity}/${string}`, 'Subject'>

export type AnyDomainEvent = DomainEvent<any, any, any, Subject>

/**
 * A stored event whose type is not known at this point, such as an event read
 * back from a stream. Unlike `AnyDomainEvent` it contains no `any`: `type` is a
 * plain string and `data` may be missing, with unknown fields, so it has to be
 * checked before it is used.
 */
export type UnknownDomainEvent = DomainEvent<string, DefaultRecord | undefined, DefaultRecord | undefined>

export type DomainEvent<
  EventType extends string = string,
  EventData extends DefaultRecord | undefined = DefaultRecord,
  EventMetaData extends DefaultRecord | undefined = undefined,
  EventSubject extends Subject = Subject,
> = CloudEventV1<EventData extends undefined ? undefined : EventData>
  & {
    type: EventType
    subject: EventSubject
    data: EventData extends undefined ? undefined : EventData
  } & (EventMetaData extends undefined ? Record<string, never> : { metadata: EventMetaData })
