# vorfall

## 0.2.0

### Minor Changes

- Fix the typing of inline projections when they are read back.

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
