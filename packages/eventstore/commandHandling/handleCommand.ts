import type { MultiStreamAppendResult } from '../eventStore/eventStoreFactory.types'
import type { CommandHandlerOptions, DefaultRecord, InferDomainEventFromCommandHandler } from './handleCommand.types'

export async function handleCommand<
  State,
  CommandType extends string,
  CommandData extends DefaultRecord | undefined,
  CommandMetadata extends DefaultRecord | undefined = undefined,
  TCommandHandlerFunction extends (params: { command: any, state?: State }) => any = (params: { command: any, state?: State }) => any,
>(
  options: CommandHandlerOptions<State, CommandType, CommandData, CommandMetadata, TCommandHandlerFunction>,
): Promise<MultiStreamAppendResult<InferDomainEventFromCommandHandler<TCommandHandlerFunction>, any>> {
  const {
    eventStore,
    evolve,
    initialState,
    streamSubject,
    commandHandlerFunction,
    command,
  } = options

  /**
   * Interpret the currrent state of the stream
   * using the provided evolve function and initial state
   */
  const aggregatedStreamState = await eventStore.aggregateStream<State, InferDomainEventFromCommandHandler<TCommandHandlerFunction>>(streamSubject, {
    evolve,
    initialState,
  })

  /**
   * Run the command handler in order to execute the business logic
   * and return the events to append to the stream
   */
  const result = await commandHandlerFunction({ command, state: aggregatedStreamState })
  const eventsToAppend = Array.isArray(result) ? result : [result]

  const newState = await eventStore.appendOrCreateStream<InferDomainEventFromCommandHandler<TCommandHandlerFunction>>(
    eventsToAppend,
  )

  return newState
}
