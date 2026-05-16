import type { StreamHandler } from './streamHandler.types'

export function createStreamHandler<TState, TEvent>(
  streamName: string,
  { evolve, initialState }: {
    evolve: (state: TState, event: TEvent) => TState
    initialState: () => TState
  },
): StreamHandler<TState, TEvent> {
  return { streamName, evolve, initialState }
}
