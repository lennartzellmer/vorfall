---
"vorfall": minor
---

Ship ESM only. The `require` condition in `exports` pointed at the ESM build and was broken for CommonJS consumers; instead of fixing it, the CJS build is dropped entirely. The package now publishes a single ES module entry (`dist/index.js`).
