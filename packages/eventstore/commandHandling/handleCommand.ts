import type { MultiStreamAppendResult } from '../eventStore/eventStoreFactory.types'
import type { StreamSubject } from '../types'
import type { CommandHandlerOptions, DefaultRecord, InferDomainEventFromCommandHandler } from './handleCommand.types'

export async function handleCommand<
  State,
  CommandType extends string,
  CommandData extends DefaultRecord | undefined,
  CommandMetadata extends DefaultRecord | undefined = undefined,
  TCommandHandlerFunction extends (params: { command: any, states?: Map<StreamSubject, State> }) => any = (params: { command: any, states?: Map<StreamSubject, State> }) => any,
>(
  options: CommandHandlerOptions<State, CommandType, CommandData, CommandMetadata, TCommandHandlerFunction>,
): Promise<MultiStreamAppendResult<InferDomainEventFromCommandHandler<TCommandHandlerFunction>, any>> {
  const {
    eventStore,
    streams,
    commandHandlerFunction,
    command,
  } = options

  /**
   * Aggregate the state of the streams
   * using the provided evolve function and initial state
   */
  const aggregatedStreamStates: Map<StreamSubject, State> = new Map()
  for (const stream of streams) {
    const aggregatedStreamState = await eventStore.aggregateStream<State, InferDomainEventFromCommandHandler<TCommandHandlerFunction>>(stream.streamSubject, {
      evolve: stream.evolve,
      initialState: stream.initialState,
    })
    aggregatedStreamStates.set(stream.streamSubject, aggregatedStreamState)
  }

  /**
   * Run the command handler in order to execute the business logic
   * and return the events to append to the stream
   */
  const result = await commandHandlerFunction({ command, states: aggregatedStreamStates })
  const eventsToAppend = Array.isArray(result) ? result : [result]

  const newState = await eventStore.appendOrCreateStream<InferDomainEventFromCommandHandler<TCommandHandlerFunction>>(
    eventsToAppend,
  )

  return newState
}
