---
"vorfall": minor
---

Optimistic concurrency control. Stream documents now carry a `version` field (number of events); appends can pass `expectedVersions` per stream subject (`number`, `'no-stream'` or `'any'`) and fail with the new exported `ConcurrencyError` when the stream changed since it was read — rolling back the whole append across all streams in the call. `handleCommand` enforces the versions observed while aggregating automatically, closing the read-decide-append race.

Breaking changes:

- `aggregateStream` now returns `{ state, version, streamExists }` instead of the bare state.
- `ReadStreamResult` gains a required `version` field.
- `EventStream` gains a required `version` field. There is no migration for stream documents written by earlier versions — they lack the field and cannot be appended to with an exact expected version. Start from an empty database.
