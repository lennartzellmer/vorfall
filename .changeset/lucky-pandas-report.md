---
"vorfall": minor
---

Fix the typing of inline projections when they are read back.

Projection queries now narrow on the projection name, and the persisted shape of the `projections` sub-document is modelled accurately:

- `findMultipleProjections`, `countProjections` and `findOneProjection` declare `projectionName` as a `const` type parameter. Previously the literal was widened to `string`, which failed the `TProjections[number]['name']` constraint and fell back to the union of every projection name. On a store with more than one projection that made `findMultipleProjections` return the union of all projection states, and collapsed the `entity` parameter of `findMultipleProjections`/`countProjections` to `never` — the calls could not be made without a cast. Passing the query object `as const` is no longer required.
- `null` is no longer part of a projection's state type. `evolve` returns `null` to signal deletion, in which case the event store `$unset`s the key, so a projection that is present on a document is never `null`.
- Every key of `EventStream['projections']` is now optional, matching what is stored: a projection only materialises once it has handled an applicable event. `findOneProjection` narrows the projection it was queried for back to required, since the query filters on `$exists: true`.

New exported types: `AnyProjectionDefinition`, `ProjectionNames`, `ProjectionStateOf`, `ProjectionStates`, `ProjectionStatesWith` and `EventStreamWithProjection`.

This is a types-only change; runtime behaviour is unchanged. Code that relied on the previous, wider types may need to drop now-redundant casts, `as const` assertions or `null` checks.
