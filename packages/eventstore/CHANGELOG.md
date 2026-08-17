# vorfall

## 0.1.0

### Minor Changes

- Allow projections to signal deletion by returning `null` from `evolve`. When an `evolve` call returns `null`, the event store removes the `projections.<name>` field from the stream document via `$unset` instead of persisting a null value. The `evolve` signature is widened accordingly — `state` may now be `null` (before the first applicable event or after a prior deletion in the same batch), and `evolve` may return `null`.

### Patch Changes

- 2d5a60d: Changes tests for eventStoreFactory.test.ts to use more common test cases

## 0.0.25

### Patch Changes

- e3d3b02: Initial changeset release
