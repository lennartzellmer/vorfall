---
"vorfall": patch
---

Fix the type of an event without metadata. `DomainEvent<Type, Data>` added `Record<string, never>`, which made every attribute `never` for writing: a copy such as `{ ...event, time }` or `{ ...event, data }` did not compile. It now adds `{ metadata?: undefined }`, so such copies compile, and metadata on an event typed without it is still rejected.
