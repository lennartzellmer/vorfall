# vorfall

## 0.1.0

### Minor Changes

- Introduced `createStreamDefinition` factory that binds `evolve` and `initialState` once per aggregate module
- `CommandHandlerOptions.streams` now accepts `StreamRef` (`{ definition, id }`) alongside the existing `StreamConfig` form — fully backwards compatible
- Exported `createStreamDefinition`, `StreamDefinition`, `StreamRef`, `StreamEntry` from the package root
- `StreamConfig`, `CommandHandlerOptions` continue to be exported for backwards compatibility

## 0.0.25

### Patch Changes

- e3d3b02: Initial changeset release
