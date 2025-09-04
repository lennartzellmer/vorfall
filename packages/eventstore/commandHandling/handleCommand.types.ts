import type { EventStoreInstance } from '../eventStore/eventStoreFactory'
import type { AnyDomainEvent, Command, StreamSubject } from '../types/index'

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

export interface CommandHandlerOptions<
  State,
  CommandType extends string,
  CommandData extends DefaultRecord | undefined,
  CommandMetadata extends DefaultRecord | undefined = undefined,
  TCommandHandlerFunction extends CommandHandlerFunction<State, CommandType, CommandData, CommandMetadata, any> = CommandHandlerFunction<State, CommandType, CommandData, CommandMetadata, any>,
> {
  eventStore: EventStoreInstance<any>
  initialState: () => State
  command: Command<CommandType, CommandData, CommandMetadata>
  commandHandlerFunction: TCommandHandlerFunction
  streamSubject: StreamSubject
  evolve: (state: State, event: InferDomainEventFromCommandHandler<TCommandHandlerFunction>) => State
}

export type CommandHandlerFunction<
  State,
  CommandType extends string = string,
  CommandData extends DefaultRecord | undefined = undefined,
  CommandMetadata extends DefaultRecord | undefined = undefined,
  TDomainEvent extends AnyDomainEvent = AnyDomainEvent,
> = (params: { command: Command<CommandType, CommandData, CommandMetadata>, state?: State }) =>
  | TDomainEvent
  | TDomainEvent[]
  | Promise<TDomainEvent>
  | Promise<TDomainEvent[]>

export type DefaultRecord = Record<string, unknown>
