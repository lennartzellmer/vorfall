---
"vorfall": minor
---

`handleCommand` retries on `ConcurrencyError` by default.

- When the append fails with a `ConcurrencyError`, the whole cycle runs again: every listed stream is aggregated anew, the handler decides against the fresh states and its new result is appended. Defaults: 3 retries with full-jitter exponential backoff (`baseDelayMs` 20, `maxDelayMs` 200). Only conflicts are retried; after the last attempt the last `ConcurrencyError` is rethrown unchanged.
- New option `retry?: false | CommandRetryOptions` with `maxRetries`, `baseDelayMs`, `maxDelayMs` and an `onRetry({ error, attempt, delayMs })` callback. `retry: false` restores the previous fail-on-first-conflict behaviour.
- **Behaviour change:** the command handler may now run more than once per `handleCommand` call. It must be free of side effects; values that must stay stable across attempts (IDs, timestamps) belong in the command data.
