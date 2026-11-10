---
"vorfall": minor
---

New `deriveEvents` option on `createEventStore`: a pure, synchronous function that returns further events for an append. They are written in the same transaction as the caller's events. Streams that only derived events write to need no entry in `expectedVersions`, and `streams` and `streamSubjects` in the append result only report the caller's streams.

Breaking changes:

- `totalEventsAppended` on the append result is replaced by `eventsWritten: { total, direct, derived }`. `total` counts every written event, `direct` the events passed to `appendOrCreateStream` and `derived` the events returned by `deriveEvents`. `handleCommand` returns the same shape, with all three at `0` for a no-op.
