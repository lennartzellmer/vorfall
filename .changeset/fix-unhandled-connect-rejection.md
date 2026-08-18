---
"vorfall": patch
---

Fix a crash on startup when MongoDB is unreachable: the fire-and-forget connect in the `MongoClientWrapper` constructor produced an unhandled promise rejection once all retries were exhausted, which terminates the process on Node >= 15. The rejection is now consumed; connection errors still surface via `waitForConnection()` or the first database operation.
