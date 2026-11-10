---
"vorfall": minor
---

Add typed event derivations for the `deriveEvents` option. `createEventDerivation` reacts to the event types listed in `canHandle` and hands `derive` events of exactly those types; `combineEventDerivations` turns derivations into the option. A plain `deriveEvents` function still works, and its type is now exported as `DeriveEvents`.

Breaking changes (types only, no runtime change):

- `MultiStreamAppendResult` has lost its event type parameter: `MultiStreamAppendResult<TDomainEvent, P>` is now `MultiStreamAppendResult<P>`.
- The events in `result.streams` of `appendOrCreateStream` and `handleCommand` are typed as `AnyDomainEvent` instead of the appended event type. A returned stream holds its earlier events and any derived events, so the narrower type did not match what it contains.
