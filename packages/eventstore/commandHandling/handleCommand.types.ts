import type { ConcurrencyError } from '../eventStore/concurrencyError'
import type { EventStoreInstance } from '../eventStore/eventStoreFactory'
import type { AnyDomainEvent, Command, DefaultRecord, Subject } from '../types/index'

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
  TDomainEvent extends AnyDomainEvent = AnyDomainEvent,
> {
  eventStore: EventStoreInstance<any>
  streams: Streams
  command: Command<CommandType, CommandData, CommandMetadata>
  /**
   * Decides which events to record for the command. It may run more than
   * once (see `retry`), so it must be a pure function of `command` and
   * `states`: no side effects, and values that have to stay stable across
   * attempts (IDs, timestamps) belong in the command data.
   */
  commandHandlerFunction: CommandHandlerFunction<Streams, CommandType, CommandData, CommandMetadata, TDomainEvent>
  /**
   * Retries the whole cycle (aggregate, decide, append) when the append fails
   * with a `ConcurrencyError`. On by default; `false` disables it.
   */
  retry?: false | CommandRetryOptions
}

export interface CommandRetryInfo {
  /** The conflict that ended the attempt. */
  error: ConcurrencyError
  /** The attempt that just failed, starting at 1. */
  attempt: number
  /** How long `handleCommand` waits before the next attempt. */
  delayMs: number
}

export interface CommandRetryOptions {
  /** Retries after the first attempt. Default 3, i.e. up to 4 attempts. */
  maxRetries?: number
  /** Upper bound of the delay before the first retry; doubles per retry. Default 20 ms. */
  baseDelayMs?: number
  /** Cap for the delay bound. Default 200 ms. */
  maxDelayMs?: number
  /**
   * Called before each retry, e.g. for logging. An exception thrown here
   * rejects `handleCommand` with that exception instead of retrying.
   */
  onRetry?: (info: CommandRetryInfo) => void
}

// Helper type to extract state types from streams array
type StreamStatesMap<Streams extends readonly StreamConfig<any, any>[]> = {
  [K in keyof Streams]: Streams[K] extends StreamConfig<infer State, any> ? [Streams[K]['streamSubject'], State] : never
}[number]

export type CreateStatesMap<Streams extends readonly StreamConfig<any, any>[]>
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
