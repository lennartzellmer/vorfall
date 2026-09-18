---
"vorfall": minor
---

Aggregate definitions, projections selected by entity and a guard for unlisted streams.

- `createProjectionDefinition` accepts `entity` instead of `canHandle`: the projection then folds every event of every stream under `<entity>/`. Aggregate projections no longer keep an event type list that can drift from `evolve`. `canHandle` stays for projections that observe a chosen subset of events. `ProjectionDefinition` is now a union of the two selections (`EventTypeSelection | EntitySelection`), and `selectEventsForProjection` is exported.
- A projection's `evolve` returning `undefined` for an event now fails the append with the new exported `UnhandledProjectionEventError`. An entity-selected projection receives every event of its streams, so an event type missing from `evolve` would otherwise leave the projection silently stale.
- `defineAggregate({ name, evolve })` bundles what callers need for one aggregate: `subject(id)`, `stream(id)` for `handleCommand` and `projection` for `createEventStore`. An aggregate has no state until its first event and none again after `evolve` returns `null`; the command-side fold and the projection both start from `null`.
- After `evolve` returns `null`, the next event starts again from `initialState()`, in the projection fold and in `aggregateStream` alike. Previously a null was passed on to the next event within the same append but replaced by `initialState()` in a later append, so a projection's state could depend on how events were batched.
- The state type of `createProjectionDefinition` and `defineAggregate` is constrained to `object` instead of `Record<string, unknown>`, so a state declared as an `interface` is accepted.
- Fix: a stream returned after a projection fold no longer carries the storage `_id`.
- `handleCommand` now throws the new exported `StreamNotLoadedError` (carrying `streamSubject`) when the command handler reads a stream state that was not listed in `streams`. Previously the read returned `undefined`, indistinguishable from a stream that does not exist yet.
- `StreamConfig`, `CommandHandlerOptions`, `CommandHandlerFunction` and `InferDomainEventFromCommandHandler` are exported from the package root.
- Fix: an append that none of the configured projections folds no longer fails with `MongoInvalidArgumentError` (empty update); the stream document is left as written.
