import type { AnyDomainEvent } from '../types/index'
import type { ProjectionDefinition } from '../utils/utilsProjections.types'
import type { EventStream, StoredEventStream } from './eventStoreFactory.types'

/**
 * The stored shape of a stream. The stream subject is the document `_id`;
 * this is the only module that knows that spelling.
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
