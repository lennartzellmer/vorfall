import type { EventStoreInstance } from '../eventStore/eventStoreFactory'
import type { Command, DomainEvent, StreamSubject } from '../types/index'

export interface CommandHandlerOptions<
  State,
  CommandType extends string,
  CommandData extends DefaultRecord | undefined,
  CommandMetadata extends DefaultRecord | undefined = undefined,
  EventType extends string = string,
  EventData extends DefaultRecord = DefaultRecord,
  EventMetaData extends DefaultRecord | undefined = undefined,
> {
  eventStore: EventStoreInstance<any>
  initialState: () => State
  command: Command<CommandType, CommandData, CommandMetadata>
  commandHandlerFunction: CommandHandlerFunction<State, CommandType, CommandData, CommandMetadata, EventType, EventData, EventMetaData>
  streamSubject: StreamSubject
  evolve: (state: State, event: DomainEvent<EventType, EventData, EventMetaData>) => State
}

export type CommandHandlerFunction<
  State,
  CommandType extends string = string,
  CommandData extends DefaultRecord | undefined = undefined,
  CommandMetadata extends DefaultRecord | undefined = undefined,
  EventType extends string = string,
  EventData extends DefaultRecord = DefaultRecord,
  EventMetaData extends DefaultRecord | undefined = undefined,
> = (params: { command: Command<CommandType, CommandData, CommandMetadata>, state?: State }) =>
  | DomainEvent<EventType, EventData, EventMetaData>
  | DomainEvent<EventType, EventData, EventMetaData>[]
  | Promise<DomainEvent<EventType, EventData, EventMetaData>>
  | Promise<DomainEvent<EventType, EventData, EventMetaData>[]>

export type DefaultRecord = Record<string, unknown>
