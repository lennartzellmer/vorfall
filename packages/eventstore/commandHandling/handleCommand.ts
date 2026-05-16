import type { MultiStreamAppendResult } from '../eventStore/eventStoreFactory.types'
import type { Subject } from '../types/domainEvent.types'
import type { Command, DefaultRecord } from '../types/index'
import type { CommandHandlerOptions, InferDomainEventFromCommandHandler } from './handleCommand.types'
import { createStreamSubject } from '../utils/utilsSubject'

export async function handleCommand<
  CommandType extends string,
  CommandData extends DefaultRecord | undefined,
  CommandMetadata extends DefaultRecord | undefined = undefined,
  TCommandHandlerFunction extends (params: { command: Command<CommandType, CommandData, CommandMetadata>, states?: Map<Subject, any> }) => any = (params: { command: Command<CommandType, CommandData, CommandMetadata>, states?: Map<Subject, any> }) => any,
>(
  options: CommandHandlerOptions<CommandType, CommandData, CommandMetadata, TCommandHandlerFunction>,
): Promise<MultiStreamAppendResult<InferDomainEventFromCommandHandler<TCommandHandlerFunction>, any>> {
  const { eventStore, streams, command, commandHandlerFunction } = options

  const aggregatedStreamStates: Map<Subject, any> = new Map()
  for (const stream of streams) {
    const { streamSubject, evolve, initialState } = 'handler' in stream
      ? {
          streamSubject: createStreamSubject(`${stream.handler.streamName}/${stream.id}`),
          evolve: stream.handler.evolve,
          initialState: stream.handler.initialState,
        }
      : stream

    const state = await eventStore.aggregateStream<any, InferDomainEventFromCommandHandler<TCommandHandlerFunction>>(streamSubject, { evolve, initialState })
    aggregatedStreamStates.set(streamSubject, state)
  }

  const result = await commandHandlerFunction({ command, states: aggregatedStreamStates })
  const eventsToAppend = Array.isArray(result) ? result : [result]

  return eventStore.appendOrCreateStream<InferDomainEventFromCommandHandler<TCommandHandlerFunction>>(eventsToAppend)
}
