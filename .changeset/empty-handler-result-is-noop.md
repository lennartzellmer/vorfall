---
"vorfall": minor
---

An empty result from a command handler is a no-op.

- `handleCommand` returns `{ streams: [], totalEventsAppended: 0, streamSubjects: [] }` when the command handler returns an empty array, without calling `appendOrCreateStream`. A handler can now say "the command is already satisfied by the current state" by returning `[]` instead of throwing a sentinel error for the caller to catch. No version is checked in that case, since no stream is touched.
- `appendOrCreateStream` itself still rejects an empty array: a direct caller with nothing to append is a wiring mistake, not a decision.
