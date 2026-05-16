export interface StreamHandler<TState, TEvent> {
  streamName: string
  evolve: (state: TState, event: TEvent) => TState
  initialState: () => TState
}

export interface StreamHandlerRef<TState = any, TEvent = any> {
  handler: StreamHandler<TState, TEvent>
  id: string
}
