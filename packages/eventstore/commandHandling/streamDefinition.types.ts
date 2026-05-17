export interface StreamDefinition<TState, TEvent> {
  streamName: string
  evolve: (state: TState, event: TEvent) => TState
  initialState: () => TState
}

export interface StreamRef<TState = any, TEvent = any> {
  definition: StreamDefinition<TState, TEvent>
  id: string
}
