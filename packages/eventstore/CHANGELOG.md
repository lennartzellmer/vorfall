# vorfall

## 0.1.0

### Minor Changes

- Introduced `createStreamHandler` factory that binds `evolve` and `initialState` once per aggregate module
- `handleCommand` now also accepts positional arguments `(eventStore, ref | refs[], command, handlerFn)` — single-stream and multi-stream via one unified function
- Old options-object signature `handleCommand({ eventStore, streams, command, commandHandlerFunction })` remains fully supported but is marked `@deprecated`
- Exported `createStreamHandler`, `StreamHandler`, `StreamHandlerRef` from the package root
- `StreamConfig`, `CommandHandlerOptions` continue to be exported for backwards compatibility

## 0.0.25

### Patch Changes

- e3d3b02: Initial changeset release
