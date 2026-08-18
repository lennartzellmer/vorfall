---
"vorfall": patch
---

`appendOrCreateStream` now ensures a unique index on `streamSubject` (once per collection, before the transaction starts). Without it, concurrent upserts for the same new stream could insert duplicate stream documents, and every stream lookup was a collection scan. Note for existing databases: if a collection already contains duplicate `streamSubject` documents, index creation — and therefore the append — will fail until the duplicates are resolved.
