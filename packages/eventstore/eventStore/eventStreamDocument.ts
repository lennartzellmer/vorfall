import type { Filter } from 'mongodb'
import type { AnyDomainEvent, Subject } from '../types/index'
import type { ProjectionDefinition } from '../utils/utilsProjections.types'
import type { EventStream, StoredEventStream } from './eventStoreFactory.types'

/**
 * The filter that selects one stream document by its subject. The stream
 * subject is the document `_id`; this module is the only one that spells
 * that out, so every lookup goes through here.
 * @param streamSubject - The subject of the stream
 * @returns The filter for the stream's document
 */
export function bySubject<
  TDomainEvent extends AnyDomainEvent = AnyDomainEvent,
  P extends readonly ProjectionDefinition<any, any, any>[] | undefined = undefined,
>(streamSubject: Subject): Filter<StoredEventStream<TDomainEvent, P>> {
  return { _id: streamSubject } as Filter<StoredEventStream<TDomainEvent, P>>
}

/**
 * The stored shape of a stream: the subject moves under `_id`.
 * @param stream - The stream in its public shape
 * @returns The document to store
 */
export function toDocument<
  TDomainEvent extends AnyDomainEvent,
  P extends readonly ProjectionDefinition<any, any, any>[] | undefined = undefined,
>(stream: EventStream<TDomainEvent, P>): StoredEventStream<TDomainEvent, P> {
  const { streamSubject, ...rest } = stream
  return { _id: streamSubject, ...rest }
}

/**
 * The public shape of a stored stream document.
 * @param document - The document as read from the collection
 * @returns The stream with its subject under `streamSubject`
 */
export function fromDocument<
  TDomainEvent extends AnyDomainEvent,
  P extends readonly ProjectionDefinition<any, any, any>[] | undefined = undefined,
>(document: StoredEventStream<TDomainEvent, P>): EventStream<TDomainEvent, P> {
  const { _id, ...rest } = document
  return { streamSubject: _id, ...rest }
}
