import type { MultiStreamAppendResult } from '../eventStore/eventStoreFactory.types'
import type { Command, DefaultRecord } from '../types/index'
import type { CommandHandlerOptions, InferDomainEventFromCommandHandler } from './handleCommand.types'
import type { States, StreamRef } from './streamDefinition.types'
import { createStreamSubject } from '../utils/utilsSubject'

function createStates(map: Map<string, any>): States {
  return {
    get<TState, TEvent>(ref: StreamRef<TState, TEvent>): TState | undefined {
      return map.get(createStreamSubject(`${ref.definition.streamName}/${ref.id}`))
    },
  }
}

export async function handleCommand<
  CommandType extends string,
  CommandData extends DefaultRecord | undefined,
  CommandMetadata extends DefaultRecord | undefined = undefined,
  TCommandHandlerFunction extends (params: { command: Command<CommandType, CommandData, CommandMetadata>, states?: States }) => any = (params: { command: Command<CommandType, CommandData, CommandMetadata>, states?: States }) => any,
>(
  options: CommandHandlerOptions<CommandType, CommandData, CommandMetadata, TCommandHandlerFunction>,
): Promise<MultiStreamAppendResult<InferDomainEventFromCommandHandler<TCommandHandlerFunction>, any>> {
  const { eventStore, streams, command, commandHandlerFunction } = options

  const statesMap = new Map<string, any>()
  for (const stream of streams) {
    const subject = createStreamSubject(`${stream.definition.streamName}/${stream.id}`)
    const state = await eventStore.aggregateStream<any, InferDomainEventFromCommandHandler<TCommandHandlerFunction>>(subject, {
      evolve: stream.definition.evolve,
      initialState: stream.definition.initialState,
    })
    statesMap.set(subject, state)
  }

  const result = await commandHandlerFunction({ command, states: createStates(statesMap) })
  const eventsToAppend = Array.isArray(result) ? result : [result]

  return eventStore.appendOrCreateStream<InferDomainEventFromCommandHandler<TCommandHandlerFunction>>(eventsToAppend)
}
