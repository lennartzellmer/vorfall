---
"vorfall": patch
---

Projections no longer receive events outside their `canHandle` list. Previously, when a batch contained at least one applicable event, `evolve` was called with every event in the batch — including types the projection never declared — forcing every evolve implementation to defensively ignore unknown types. Events are now filtered per projection before folding.
