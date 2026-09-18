# Plan: the stream subject becomes the document `_id`

Status: implemented on `feat/subject-as-document-id`, stacked on #17.

## Decision

A stream document is keyed by its stream subject. The stored document has
`_id: 'user/123'` and no separate `streamSubject` field. The public
`EventStream` type keeps `streamSubject`; one mapping function translates
between the stored shape and the public shape at the storage boundary.

Consequences that fall out of this:

- The synthetic unique index on `streamSubject`, and the bootstrap that
  creates it before every append, are deleted. The `_id` index MongoDB
  maintains on every collection is the unique index.
- A concurrent create of the same stream is still detected: a duplicate
  `_id` raises the same error code 11000 the code already maps to
  `ConcurrencyError`.
- The `_id` leak reported in the review of #17 is closed by construction:
  the only value under `_id` is the subject, and every returned stream goes
  through the mapper that renames it.
- Existing collections keyed by ObjectId are not readable by the new
  version. No migration is provided; that has been decided.

## Stored shape vs public shape

Before (stored and returned, minus a strip of `_id` in four places):

```
{ _id: ObjectId(...), streamId: '<uuid>', streamSubject: 'user/123', events, version, metadata, projections? }
```

After, stored:

```
{ _id: 'user/123', events, version, metadata, projections? }
```

After, returned to callers (unchanged from today's type, minus `streamId`):

```
{ streamSubject: 'user/123', events, version, metadata, projections? }
```

## Decisions to confirm before starting

1. **Drop `streamId`.** It is a UUID generated at creation, stored, and
   never read by the library. Its only surface is `streamIds?` on the
   exported `FindMultipleProjectionQuery` type, which no function consumes.
   With the subject as the key there is one identity; a second one needs a
   reason, and the only one on record (telling incarnations apart after a
   delete) has no delete to go with it. This plan assumes it is dropped.
2. **Lean layout.** The subject is stored once, under `_id`. Not also under
   `streamSubject`. The mapper renames on the way out.
3. **Changeset level.** The repo has shipped incompatible changes as `minor`
   while on 0.x (ESM-only in 0.3.0). This plan proposes `minor` with an
   explicit incompatibility note, matching the index note in 0.3.0. Use
   `major` instead if 1.0.0 is meant to signal the storage break.

## Changes, file by file

### `packages/eventstore/eventStore/eventStoreFactory.types.ts`

- Remove `streamId` from `EventStream`.
- Add the stored shape and export it, since it appears in the public
  `EventStoreInstance` signature:

  ```ts
  export type StoredEventStream<TDomainEvent, P> =
    Omit<EventStream<TDomainEvent, P>, 'streamSubject'> & { _id: Subject }
  ```

- Remove `streamIds` from `FindMultipleProjectionQuery`. The type itself is
  exported but unused by any function; consider removing it in the same
  breath and noting that in the changeset.

### New: `packages/eventstore/eventStore/eventStreamDocument.ts`

Two functions and nothing else. This is the only module that knows the
stored spelling.

```ts
export function toDocument(stream: EventStream): StoredEventStream
// { _id: stream.streamSubject, ...rest }

export function fromDocument(doc: StoredEventStream): EventStream
// { streamSubject: doc._id, ...rest }
```

Both are pure. Unit test them in isolation: round trip, no `_id` on the
public side, no `streamSubject` on the stored side.

### `packages/eventstore/utils/utilsEventStore.ts`

- `createEventStream` keeps returning the public shape (it is exported and
  used by tests as a fixture builder). Drop the `streamId` line and the
  `randomUUID` import if nothing else uses it.

### `packages/eventstore/eventStore/eventStoreFactory.ts`

- `EventStoreInstance.getCollectionBySubject` and `getCollectionByEntity`
  return `Collection<StoredEventStream<...>>`. This is a public type change:
  anyone using these collections directly must filter on `_id`.
- `processStreamInTransaction` works in the stored shape throughout and
  converts exactly once, at the return:
  - Create path: `const doc = toDocument(createEventStream(events))`, insert
    `doc` directly. The copy-to-avoid-mutation and its comment go away; the
    driver has nothing to add because `_id` is set. `result = doc`.
  - Append path: filter `{ _id: streamSubject }` or
    `{ _id: streamSubject, version: expectedVersion }`. In `$setOnInsert`
    drop `streamId` and `streamSubject`; keep `metadata.createdAt`. An upsert
    with an equality filter on `_id` sets `_id` on insert by itself. Remove
    `projection: { _id: 0 }` so the returned document is the full stored
    shape.
  - Version mismatch read: `findOne({ _id: streamSubject }, { projection: { version: 1 } })`.
  - Projection read-back: filter `{ _id: streamSubject }`. Keep the
    `findOneAndUpdate` with `returnDocument: 'after'` for now; it returns the
    stored shape like the other two paths. See the optional step below.
  - Last line: `return fromDocument(result)`.
- Delete `ensureCollectionReady`, `ensuredCollections`, the loop that calls
  it in `appendOrCreateStream`, and `retryTransient` with
  `TRANSIENT_WRITE_CODES` if index creation was their only caller (it is,
  today).
- `getEventStreamBySubject`: filter `{ _id: streamSubject }`. The
  `projection: { _id: 0 }` can go; the function only reads `events` and
  `version`. Optionally narrow the projection to those two fields.
- Update the two comments that mention the unique index on `streamSubject`
  (create path catch block, and the deleted bootstrap).

### `packages/eventstore/utils/utilsProjections.ts`

- `findOneProjection`: subject filter becomes `{ _id: { $eq: streamSubject } }`.
  The `matchAll` branch splices index 0, which is still the subject filter,
  so its behaviour is unchanged. Remove `projection: { _id: 0 }` and return
  `fromDocument(result)` instead of the raw cast.
- `findMultipleProjections` and `countProjections` do not filter on the
  subject. Their `find<{ projections?: ... }>` call sites compile against
  the stored collection type unchanged.

### `packages/eventstore/index.ts`

- Nothing new to wire if `StoredEventStream` is exported from the types
  file and `eventStreamDocument.ts` is exported from the event store index
  (or left internal; only the type needs to be public).

### Tests: `packages/eventstore/eventStore/eventStoreFactory.test.ts`

- Raw inserts at the four `collection.insertOne(eventStream, ...)` sites
  (around lines 65, 94, 635, 661) insert `toDocument(eventStream)`. The
  driver type will refuse the public shape because `_id` is required.
- The unique index test (around line 120) inverts: assert that the only
  index on the collection is `_id_`.
- Remove the two `expect(stream.streamId).toBeDefined()` assertions
  (around lines 86 and 113).
- The raw document read at line 397 filters on `{ _id: streamSubject }`.
- Add: the raw document's `_id` equals the stream subject.
- Add, as the regression test for the review finding: the returned stream
  has `streamSubject` and no `_id` on every path. Cover the create path
  without a fold, the create path with a fold, and the append path with a
  fold. The three-row table from the review is the test matrix.
- The existing concurrent-create test that expects `ConcurrencyError` is
  now exercised through the `_id` index. It must still pass unchanged.

### Tests: new `eventStreamDocument.test.ts`

- Round trip, and the two absence assertions described above.

### `README.md`

- Add a short "Storage layout" paragraph: one document per stream, in a
  collection named after the entity, keyed by the stream subject as `_id`.
  Say that `getCollectionBySubject` and `getCollectionByEntity` hand out the
  stored shape, so direct queries filter on `_id`.
- Remove `streamId` from any example output. The current README does not
  show it, so this is a check rather than an edit.

### Changeset: `.changeset/subject-as-document-id.md`

Proposed text, `minor`:

- The stream subject is now the document `_id`. A stream document no longer
  carries a `streamSubject` field or a `streamId`. The unique index on
  `streamSubject` and its bootstrap before each append are removed; the
  `_id` index is the unique index and a concurrent create still fails with
  `ConcurrencyError`.
- Incompatible with collections written by earlier versions, which are keyed
  by ObjectId. There is no migration.
- `getCollectionBySubject` and `getCollectionByEntity` return the stored
  shape (`StoredEventStream`, new export). Direct queries filter on `_id`.
- `EventStream.streamId` and `FindMultipleProjectionQuery.streamIds` are
  removed.
- Returned streams never carry `_id`, on any append path.

## Order of work

Each step leaves the suite green.

1. Types: add `StoredEventStream`, remove `streamId`. Add the mapper module
   with its unit test.
2. `createEventStream` drops `streamId`. Fix the two `streamId` test
   assertions.
3. `processStreamInTransaction`: switch filters and `$setOnInsert`, insert
   the mapped document, return through the mapper. Fix the four raw-insert
   test sites and the raw-document read.
4. Delete the index bootstrap and the retry helper. Invert the index test.
5. `getEventStreamBySubject` and `findOneProjection`: switch filters, route
   through the mapper.
6. Add the `_id`-absence regression tests and the `_id`-equals-subject test.
7. README paragraph and changeset.

## Optional follow-up, not part of this change

Replace the projection read-back with `updateOne` and merge the folded
states into the local document. It saves one full-document transfer per
append and removes the third origin of the result. It also changes what a
caller gets back for a projection state: the object `evolve` returned
rather than its BSON round trip, which differs for keys set to `undefined`
and for non-plain values. That nuance is why it is not folded in here.

## Verification

- `pnpm --filter vorfall build:types` or `tsc --noEmit`, `pnpm lint`,
  `pnpm test`.
- Against a running replica set, append to a fresh database and inspect one
  document in `mongosh`: it must read `_id: 'user/123'` with no
  `streamSubject`, no `streamId`, and `db.user.getIndexes()` must list only
  `_id_`.
- Run two concurrent creates of the same new stream and confirm exactly one
  succeeds and the other rejects with `ConcurrencyError`.

## Risks and open questions

- **Implicit collection creation inside a transaction.** With the bootstrap
  gone, the first append to a new entity creates the collection inside the
  transaction. MongoDB allows this from 4.4. The code did exactly this
  before the index bootstrap was added in 0.3.0, so the test server is
  known to accept it, but the README's server requirement should state 4.4
  or later. If a deployment turns out to need it, a minimal
  `db.createCollection` guard can return without the index.
- **Stale index on reused databases.** A database that already has the old
  `streamSubject` unique index will keep it; new documents have no such
  field, so every insert writes `null` into that index and the second
  stream in a collection fails with a duplicate key error. Since old data
  is not supported anyway, the verification step above must use a fresh
  database, and the changeset should say so.
- **`FindMultipleProjectionQuery`.** Removing an exported type is a visible
  change even if nothing consumed it. Confirm it goes, or leave it minus
  `streamIds`.
- **Driver typing of `_id`.** `Collection<StoredEventStream>` with a
  branded string `_id` should type-check for `insertOne`, `findOne` and
  `findOneAndUpdate`; if `WithId` widening gets in the way, the mapper is
  the one place to absorb a cast.
