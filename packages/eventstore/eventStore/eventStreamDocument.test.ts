import { describe, expect, it } from 'vitest'
import { createDomainEvent, createEventStream } from '../utils/utilsEventStore'
import { createSubject } from '../utils/utilsSubject'
import { fromDocument, toDocument } from './eventStreamDocument'

describe('eventStreamDocument', () => {
  const event = createDomainEvent({
    type: 'user.created',
    subject: createSubject('user/123/created'),
    data: { name: 'Alice' },
  })
  const stream = createEventStream([event])

  it('stores the stream subject as the document _id and nothing else under a subject key', () => {
    const document = toDocument(stream)

    expect(document._id).toBe('user/123')
    expect(document).not.toHaveProperty('streamSubject')
  })

  it('reads the stream subject back from _id and carries no _id on the public side', () => {
    const publicStream = fromDocument(toDocument(stream))

    expect(publicStream.streamSubject).toBe('user/123')
    expect(publicStream).not.toHaveProperty('_id')
  })

  it('round-trips a stream unchanged', () => {
    expect(fromDocument(toDocument(stream))).toEqual(stream)
  })
})
