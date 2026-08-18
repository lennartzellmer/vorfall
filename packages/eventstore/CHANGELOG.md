# vorfall

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
