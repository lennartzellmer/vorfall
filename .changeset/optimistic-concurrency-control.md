---
"vorfall": minor
---

Optimistic concurrency control, checked by default. Stream documents now carry a `version` field (number of events); appends state an expectation per stream subject (`number`, `'no-stream'` or `'any'`) and fail with the new exported `ConcurrencyError` when the stream changed since it was read — rolling back the whole append across all streams in the call. `handleCommand` enforces the versions observed while aggregating automatically, closing the read-decide-append race.

Breaking changes:

- `appendOrCreateStream` requires an options argument with `expectedVersions`: a map covering every stream in the append (a missing entry throws the new exported `MissingExpectedVersionError`) or `'any'` to explicitly opt out of the check for the whole append.
- `aggregateStream` now returns `{ state, version, streamExists }` instead of the bare state.
- `ReadStreamResult` gains a required `version` field.
- `EventStream` gains a required `version` field. There is no migration for stream documents written by earlier versions — they lack the field and cannot be appended to with an exact expected version. Start from an empty database.
