import type { EventStoreInstance } from '../eventStore/eventStoreFactory'
import type { AnyDomainEvent, Command, Subject } from '../types/index'

// Utility types to extract domain event type from command handler function return type
export type ExtractDomainEventFromReturnType<T>
  = T extends AnyDomainEvent ? T
    : T extends AnyDomainEvent[] ? T[number]
      : T extends Promise<infer U> ? ExtractDomainEventFromReturnType<U>
        : never

export type InferDomainEventFromCommandHandler<TCommandHandler>
  = TCommandHandler extends (...args: any[]) => infer ReturnType
    ? ExtractDomainEventFromReturnType<ReturnType>
    : never

export interface StreamConfig<State, TDomainEvent> {
  initialState: () => State
  streamSubject: Subject
  evolve: (state: State, event: TDomainEvent) => State
}

export interface CommandHandlerOptions<
  Streams extends readonly StreamConfig<any, any>[],
  CommandType extends string,
  CommandData extends DefaultRecord | undefined,
  CommandMetadata extends DefaultRecord | undefined = undefined,
  TCommandHandlerFunction extends CommandHandlerFunction<Streams, CommandType, CommandData, CommandMetadata, any> = CommandHandlerFunction<Streams, CommandType, CommandData, CommandMetadata, any>,
> {
  eventStore: EventStoreInstance<any>
  streams: Streams
  command: Command<CommandType, CommandData, CommandMetadata>
  commandHandlerFunction: TCommandHandlerFunction
}

// Helper type to extract state types from streams array
type StreamStatesMap<Streams extends readonly StreamConfig<any, any>[]> = {
  [K in keyof Streams]: Streams[K] extends StreamConfig<infer State, any> ? [Streams[K]['streamSubject'], State] : never
}[number]

type CreateStatesMap<Streams extends readonly StreamConfig<any, any>[]>
  = Map<Subject, any> & {
    [K in StreamStatesMap<Streams> as K extends readonly [infer Subject, any] ? Subject : never]:
    K extends readonly [any, infer State] ? State : never
  }

export type CommandHandlerFunction<
  Streams extends readonly StreamConfig<any, any>[],
  CommandType extends string = string,
  CommandData extends DefaultRecord | undefined = undefined,
  CommandMetadata extends DefaultRecord | undefined = undefined,
  TDomainEvent extends AnyDomainEvent = AnyDomainEvent,
> = (params: {
  command: Command<CommandType, CommandData, CommandMetadata>
  states?: CreateStatesMap<Streams>
}) =>
  | TDomainEvent
  | TDomainEvent[]
  | Promise<TDomainEvent>
  | Promise<TDomainEvent[]>

export type DefaultRecord = Record<string, unknown>
