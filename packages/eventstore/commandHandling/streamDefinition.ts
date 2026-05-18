import type { StreamDefinition } from './streamDefinition.types'

export function createStreamDefinition<TState, TEvent>(
  streamName: string,
  { evolve, initialState }: {
    evolve: (state: TState, event: TEvent) => TState
    initialState: () => TState
  },
): StreamDefinition<TState, TEvent> {
  return { streamName, evolve, initialState }
}
