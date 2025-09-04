import type { EventStoreInstance } from '../eventStore/eventStoreFactory'
import type { AnyDomainEvent, Command, StreamSubject } from '../types/index'

export interface CommandHandlerOptions<
  State,
  CommandType extends string,
  CommandData extends DefaultRecord | undefined,
  CommandMetadata extends DefaultRecord | undefined = undefined,
  TDomainEvent extends AnyDomainEvent = AnyDomainEvent,
> {
  eventStore: EventStoreInstance<any>
  initialState: () => State
  command: Command<CommandType, CommandData, CommandMetadata>
  commandHandlerFunction: CommandHandlerFunction<State, CommandType, CommandData, CommandMetadata, TDomainEvent>
  streamSubject: StreamSubject
  evolve: (state: State, event: TDomainEvent) => State
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
