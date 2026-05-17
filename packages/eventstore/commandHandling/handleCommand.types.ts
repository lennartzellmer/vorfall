import type { EventStoreInstance } from '../eventStore/eventStoreFactory'
import type { AnyDomainEvent, Command, Subject } from '../types/index'
import type { StreamRef } from './streamDefinition.types'

export type ExtractDomainEventFromReturnType<T>
  = T extends AnyDomainEvent ? T
    : T extends AnyDomainEvent[] ? T[number]
      : T extends Promise<infer U> ? ExtractDomainEventFromReturnType<U>
        : never

export type InferDomainEventFromCommandHandler<TCommandHandler>
  = TCommandHandler extends (...args: any[]) => infer ReturnType
    ? ExtractDomainEventFromReturnType<ReturnType>
    : never

export type DefaultRecord = Record<string, unknown>

export interface StreamConfig<State, TDomainEvent> {
  initialState: () => State
  streamSubject: Subject
  evolve: (state: State, event: TDomainEvent) => State
}

export type StreamEntry = StreamConfig<any, any> | StreamRef

export type CommandHandlerFunction<
  CommandType extends string = string,
  CommandData extends DefaultRecord | undefined = undefined,
  CommandMetadata extends DefaultRecord | undefined = undefined,
  TDomainEvent extends AnyDomainEvent = AnyDomainEvent,
> = (params: {
  command: Command<CommandType, CommandData, CommandMetadata>
  states?: Map<Subject, any>
}) =>
  | TDomainEvent
  | TDomainEvent[]
  | Promise<TDomainEvent>
  | Promise<TDomainEvent[]>

export interface CommandHandlerOptions<
  CommandType extends string = string,
  CommandData extends DefaultRecord | undefined = undefined,
  CommandMetadata extends DefaultRecord | undefined = undefined,
  TCommandHandlerFunction extends (params: { command: Command<CommandType, CommandData, CommandMetadata>, states?: Map<Subject, any> }) => any = (params: { command: Command<CommandType, CommandData, CommandMetadata>, states?: Map<Subject, any> }) => any,
> {
  eventStore: EventStoreInstance<any>
  streams: ReadonlyArray<StreamEntry>
  command: Command<CommandType, CommandData, CommandMetadata>
  commandHandlerFunction: TCommandHandlerFunction
}
