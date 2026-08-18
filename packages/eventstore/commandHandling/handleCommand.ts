import type { ExpectedStreamVersion } from '../eventStore/concurrencyError'
import type { MultiStreamAppendResult } from '../eventStore/eventStoreFactory.types'
import type { Subject } from '../types/domainEvent.types'
import type { CommandHandlerOptions, DefaultRecord, InferDomainEventFromCommandHandler, StreamConfig } from './handleCommand.types'

export async function handleCommand<
  Streams extends ReadonlyArray<StreamConfig<any, any>>,
  CommandType extends string,
  CommandData extends DefaultRecord | undefined,
  CommandMetadata extends DefaultRecord | undefined = undefined,
  TCommandHandlerFunction extends (params: { command: any, states?: Map<Subject, any> }) => any = (params: { command: any, states?: Map<Subject, any> }) => any,
>(
  options: CommandHandlerOptions<Streams, CommandType, CommandData, CommandMetadata, TCommandHandlerFunction>,
): Promise<MultiStreamAppendResult<InferDomainEventFromCommandHandler<TCommandHandlerFunction>, any>> {
  const {
    eventStore,
    streams,
    commandHandlerFunction,
    command,
  } = options

  /**
   * Aggregate the state of the streams
   * using the provided evolve functions and initial states.
   * The version seen at read time is remembered per stream so the append
   * below fails with a ConcurrencyError if a stream changed in between.
   */
  const aggregatedStreamStates: Map<Subject, any> = new Map()
  const expectedVersions: Map<Subject, ExpectedStreamVersion> = new Map()
  for (const stream of streams) {
    const { state, version } = await eventStore.aggregateStream<any, InferDomainEventFromCommandHandler<TCommandHandlerFunction>>(stream.streamSubject, {
      evolve: stream.evolve,
      initialState: stream.initialState,
    })
    aggregatedStreamStates.set(stream.streamSubject, state)
    expectedVersions.set(stream.streamSubject, version)
  }

  /**
   * Run the command handler in order to execute the business logic
   * and return the events to append to the stream
   */
  const result = await commandHandlerFunction({ command, states: aggregatedStreamStates })
  const eventsToAppend = Array.isArray(result) ? result : [result]

  const newState = await eventStore.appendOrCreateStream<InferDomainEventFromCommandHandler<TCommandHandlerFunction>>(
    eventsToAppend,
    { expectedVersions },
  )

  return newState
}
