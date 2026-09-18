---
"vorfall": minor
---

The stream subject is the document `_id`.

- A stream document is keyed by its subject: `_id: 'user/123'`. It no longer carries a `streamSubject` field or a `streamId`. The unique index on `streamSubject` and its bootstrap before each append are gone; the `_id` index is the unique index, and a concurrent create of the same subject still fails with `ConcurrencyError`.
- **Incompatible with collections written by earlier versions**, which are keyed by ObjectId. There is no migration. Point the new version at a fresh database; a reused one still carries the old unique index on a field new documents do not have, and the second stream in each collection would fail with a duplicate key error.
- `getCollectionBySubject` and `getCollectionByEntity` return the stored shape, `StoredEventStream` (new export). Direct queries filter on `_id`. `toDocument` and `fromDocument` (new exports) translate between the stored shape and `EventStream`.
- `EventStream.streamId` and `FindMultipleProjectionQuery.streamIds` are removed.
- Returned streams never carry `_id`, on any append path. Previously the document returned after a projection fold included it.
- Requires MongoDB 4.4 or later: the first append to a new entity creates the collection inside the transaction.
