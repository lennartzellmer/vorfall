# vorfall

## 0.4.0

### Minor Changes

- b8c1c29: Aggregate definitions, projections selected by entity and a guard for unlisted streams.

  - `createProjectionDefinition` accepts `entity` instead of `canHandle`: the projection then folds every event of every stream under `<entity>/`. Aggregate projections no longer keep an event type list that can drift from `evolve`. `canHandle` stays for projections that observe a chosen subset of events. `ProjectionDefinition` is now a union of the two selections (`EventTypeSelection | EntitySelection`), and `selectEventsForProjection` is exported.
  - A projection's `evolve` returning `undefined` for an event now fails the append with the new exported `UnhandledProjectionEventError`. An entity-selected projection receives every event of its streams, so an event type missing from `evolve` would otherwise leave the projection silently stale.
  - `defineAggregate({ name, evolve })` bundles what callers need for one aggregate: `subject(id)`, `stream(id)` for `handleCommand` and `projection` for `createEventStore`. An aggregate has no state until its first event and none again after `evolve` returns `null`; the command-side fold and the projection both start from `null`.
  - After `evolve` returns `null`, the next event starts again from `initialState()`, in the projection fold and in `aggregateStream` alike. Previously a null was passed on to the next event within the same append but replaced by `initialState()` in a later append, so a projection's state could depend on how events were batched.
  - The state type of `createProjectionDefinition` and `defineAggregate` is constrained to `object` instead of `Record<string, unknown>`, so a state declared as an `interface` is accepted.
  - Fix: a stream returned after a projection fold no longer carries the storage `_id`.
  - `handleCommand` now throws the new exported `StreamNotLoadedError` (carrying `streamSubject`) when the command handler reads a stream state that was not listed in `streams`. Previously the read returned `undefined`, indistinguishable from a stream that does not exist yet.
  - `StreamConfig`, `CommandHandlerOptions`, `CommandHandlerFunction` and `InferDomainEventFromCommandHandler` are exported from the package root.
  - Fix: an append that none of the configured projections folds no longer fails with `MongoInvalidArgumentError` (empty update); the stream document is left as written.

- 391d7a6: Optimistic concurrency control, checked by default. Stream documents now carry a `version` field (number of events); appends state an expectation per stream subject (`number`, `'no-stream'` or `'any'`) and fail with the new exported `ConcurrencyError` when the stream changed since it was read — rolling back the whole append across all streams in the call. `handleCommand` enforces the versions observed while aggregating automatically, closing the read-decide-append race.

  Breaking changes:

  - `appendOrCreateStream` requires an options argument with `expectedVersions`: a map covering every stream in the append (a missing entry throws the new exported `MissingExpectedVersionError`) or `'any'` to explicitly opt out of the check for the whole append.
  - `aggregateStream` now returns `{ state, version, streamExists }` instead of the bare state.
  - `CommandHandlerOptions`' fifth type parameter is now the domain event union (`TDomainEvent`) instead of the command handler function type; `handleCommand` infers it directly from the handler's return. Only callers who explicitly instantiate these generics are affected — inference-based usage is unchanged.
  - `ReadStreamResult` gains a required `version` field.
  - `EventStream` gains a required `version` field. There is no migration for stream documents written by earlier versions — they lack the field and cannot be appended to with an exact expected version. Start from an empty database.

- 565ba56: The stream subject is the document `_id`.

  - A stream document is keyed by its subject: `_id: 'user/123'`. It no longer carries a `streamSubject` field or a `streamId`. The unique index on `streamSubject` and its bootstrap before each append are gone; the `_id` index is the unique index, and a concurrent create of the same subject still fails with `ConcurrencyError`.
  - **Incompatible with collections written by earlier versions**, which are keyed by ObjectId. There is no migration. Point the new version at a fresh database; a reused one still carries the old unique index on a field new documents do not have, and the second stream in each collection would fail with a duplicate key error.
  - `getCollectionBySubject` and `getCollectionByEntity` return the stored shape, `StoredEventStream` (new export). Direct queries filter on `_id`. `toDocument` and `fromDocument` (new exports) translate between the stored shape and `EventStream`.
  - `EventStream.streamId` and `FindMultipleProjectionQuery.streamIds` are removed.
  - Returned streams never carry `_id`, on any append path. Previously the document returned after a projection fold included it.
  - Requires MongoDB 4.4 or later: the first append to a new entity creates the collection inside the transaction.

## 0.3.0

### Minor Changes

- 9a095e0: `createEventStore` now accepts all `MongoClientWrapperOptions` (`databaseName`, `options`, `maxRetries`, `retryDelayMs`) in addition to `connectionString`. Previously only the connection string was forwarded, so all data always landed in the database named `default`. `MongoClientWrapperOptions` is now exported from the package root.
- 9a095e0: Ship ESM only. The `require` condition in `exports` pointed at the ESM build and was broken for CommonJS consumers; instead of fixing it, the CJS build is dropped entirely. The package now publishes a single ES module entry (`dist/index.js`).

### Patch Changes

- 9a095e0: `createDomainEvent` now sets the spec-compliant CloudEvents `time` attribute instead of a non-standard `date` extension attribute, and no longer emits the non-standard `version` attribute. Events created before this change carry `date`/`version` as extension attributes; newly created events carry `time`.
- 9a095e0: Fix a crash on startup when MongoDB is unreachable: the fire-and-forget connect in the `MongoClientWrapper` constructor produced an unhandled promise rejection once all retries were exhausted, which terminates the process on Node >= 15. The rejection is now consumed; connection errors still surface via `waitForConnection()` or the first database operation.
- 9a095e0: Projections no longer receive events outside their `canHandle` list. Previously, when a batch contained at least one applicable event, `evolve` was called with every event in the batch — including types the projection never declared — forcing every evolve implementation to defensively ignore unknown types. Events are now filtered per projection before folding.
- 9a095e0: Rewrite the README to match the actual API: `createEventStore` is synchronous and takes `connectionString`/`databaseName` (not `mongoUrl`), `canHandle` is a list of event types (not a type-guard function), events are created via `createDomainEvent`/`createSubject`, and appends go through `appendOrCreateStream`. Documents the replica-set requirement for transactions and the ESM-only build, and removes placeholder documentation links.
- 9a095e0: `appendOrCreateStream` now ensures a unique index on `streamSubject` (once per collection, before the transaction starts). Without it, concurrent upserts for the same new stream could insert duplicate stream documents, and every stream lookup was a collection scan. Note for existing databases: if a collection already contains duplicate `streamSubject` documents, index creation — and therefore the append — will fail until the duplicates are resolved.

## 0.2.0

### Minor Changes

- c68cdb7: Fix the typing of inline projections when they are read back.

  Projection queries now narrow on the projection name, and the persisted shape of the `projections` sub-document is modelled accurately:

  - `findMultipleProjections`, `countProjections` and `findOneProjection` declare `projectionName` as a `const` type parameter. Previously the literal was widened to `string`, which failed the `TProjections[number]['name']` constraint and fell back to the union of every projection name. On a store with more than one projection that made `findMultipleProjections` return the union of all projection states, and collapsed the `entity` parameter of `findMultipleProjections`/`countProjections` to `never` — the calls could not be made without a cast. Passing the query object `as const` is no longer required.
  - `null` is no longer part of a projection's state type. `evolve` returns `null` to signal deletion, in which case the event store `$unset`s the key, so a projection that is present on a document is never `null`.
  - Every key of `EventStream['projections']` is now optional, matching what is stored: a projection only materialises once it has handled an applicable event. `findOneProjection` narrows the projection it was queried for back to required, since the query filters on `$exists: true`.

  New exported types: `AnyProjectionDefinition`, `ProjectionNames`, `ProjectionStateOf`, `ProjectionStates`, `ProjectionStatesWith` and `EventStreamWithProjection`.

  This is a types-only change; runtime behaviour is unchanged. Code that relied on the previous, wider types may need to drop now-redundant casts, `as const` assertions or `null` checks.

## 0.1.0

### Minor Changes

- Allow projections to signal deletion by returning `null` from `evolve`. When an `evolve` call returns `null`, the event store removes the `projections.<name>` field from the stream document via `$unset` instead of persisting a null value. The `evolve` signature is widened accordingly — `state` may now be `null` (before the first applicable event or after a prior deletion in the same batch), and `evolve` may return `null`.

### Patch Changes

- 2d5a60d: Changes tests for eventStoreFactory.test.ts to use more common test cases

## 0.0.25

### Patch Changes

- e3d3b02: Initial changeset release
