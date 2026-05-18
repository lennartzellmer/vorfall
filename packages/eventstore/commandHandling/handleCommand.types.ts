import type { EventStoreInstance } from '../eventStore/eventStoreFactory'
import type { AnyDomainEvent, Command, DefaultRecord } from '../types/index'
import type { States, StreamRef } from './streamDefinition.types'

export type ExtractDomainEventFromReturnType<T>
  = T extends AnyDomainEvent ? T
    : T extends AnyDomainEvent[] ? T[number]
      : T extends Promise<infer U> ? ExtractDomainEventFromReturnType<U>
        : never

export type InferDomainEventFromCommandHandler<TCommandHandler>
  = TCommandHandler extends (...args: any[]) => infer ReturnType
    ? ExtractDomainEventFromReturnType<ReturnType>
    : never

export type CommandHandlerFunction<
  CommandType extends string = string,
  CommandData extends DefaultRecord | undefined = undefined,
  CommandMetadata extends DefaultRecord | undefined = undefined,
  TDomainEvent extends AnyDomainEvent = AnyDomainEvent,
> = (params: {
  command: Command<CommandType, CommandData, CommandMetadata>
  states: States
}) =>
  | TDomainEvent
  | TDomainEvent[]
  | Promise<TDomainEvent>
  | Promise<TDomainEvent[]>

export interface CommandHandlerOptions<
  CommandType extends string = string,
  CommandData extends DefaultRecord | undefined = undefined,
  CommandMetadata extends DefaultRecord | undefined = undefined,
  TCommandHandlerFunction extends (params: { command: Command<CommandType, CommandData, CommandMetadata>, states: States }) => any = (params: { command: Command<CommandType, CommandData, CommandMetadata>, states: States }) => any,
> {
  eventStore: EventStoreInstance<any>
  streams: ReadonlyArray<StreamRef>
  command: Command<CommandType, CommandData, CommandMetadata>
  commandHandlerFunction: TCommandHandlerFunction
}
