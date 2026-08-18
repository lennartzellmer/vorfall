---
"vorfall": patch
---

Rewrite the README to match the actual API: `createEventStore` is synchronous and takes `connectionString`/`databaseName` (not `mongoUrl`), `canHandle` is a list of event types (not a type-guard function), events are created via `createDomainEvent`/`createSubject`, and appends go through `appendOrCreateStream`. Documents the replica-set requirement for transactions and the ESM-only build, and removes placeholder documentation links.
