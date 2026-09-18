---
"vorfall": minor
---

Aggregate definitions, projections selected by entity and a guard for unlisted streams.

- `createProjectionDefinition` accepts `entity` instead of `canHandle`: the projection then folds every event of every stream under `<entity>/`. Aggregate projections no longer keep an event type list that can drift from `evolve`. `canHandle` stays for projections that observe a chosen subset of events. `ProjectionDefinition` is now a union of the two selections (`EventTypeSelection | EntitySelection`), and `selectEventsForProjection` is exported.
- A projection's `evolve` returning `undefined` for an event now fails the append with the new exported `UnhandledProjectionEventError`. An entity-selected projection receives every event of its streams, so an event type missing from `evolve` would otherwise leave the projection silently stale.
- `defineAggregate({ name, evolve, initialState })` bundles what callers need for one aggregate: `subject(id)`, `stream(id)` for `handleCommand` and `projection` for `createEventStore`.
- `handleCommand` now throws the new exported `StreamNotLoadedError` when the command handler reads a stream state that was not listed in `streams`. Previously the read returned `undefined`, indistinguishable from a stream that does not exist yet.
- `StreamConfig`, `CommandHandlerOptions`, `CommandHandlerFunction` and `InferDomainEventFromCommandHandler` are exported from the package root.
- Fix: an append that none of the configured projections folds no longer fails with `MongoInvalidArgumentError` (empty update); the stream document is left as written.
