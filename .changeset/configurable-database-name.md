---
"vorfall": minor
---

`createEventStore` now accepts all `MongoClientWrapperOptions` (`databaseName`, `options`, `maxRetries`, `retryDelayMs`) in addition to `connectionString`. Previously only the connection string was forwarded, so all data always landed in the database named `default`. `MongoClientWrapperOptions` is now exported from the package root.
