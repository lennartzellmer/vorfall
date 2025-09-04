import type { AnyDomainEvent } from '../types/domainEvent.types'
import type { CommandHandlerOptions, DefaultRecord } from './handleCommand.types'

export async function handleCommand<
  State,
  CommandType extends string,
  CommandData extends DefaultRecord | undefined,
  CommandMetadata extends DefaultRecord | undefined = undefined,
  TDomainEvent extends AnyDomainEvent = AnyDomainEvent,
>(
  options: CommandHandlerOptions<State, CommandType, CommandData, CommandMetadata, TDomainEvent>,
): Promise<any> {
  const {
    evolve,
    initialState,
    eventStore,
    streamSubject,
    commandHandlerFunction,
    command,
  } = options

  /**
   * Interpret the currrent state of the stream
   * using the provided evolve function and initial state
   */
  const aggregatedStreamState = await eventStore.aggregateStream<State, TDomainEvent>(streamSubject, {
    evolve,
    initialState,
  })

  /**
   * Run the command handler in order to execute the business logic
   * and return the events to append to the stream
   */
  const result = await commandHandlerFunction({ command, state: aggregatedStreamState })
  const eventsToAppend = Array.isArray(result) ? result : [result]

  const newState = await eventStore.appendOrCreateStream<TDomainEvent>(
    eventsToAppend,
  )

  return newState
}
