import type { ExpectedStreamVersion } from '../eventStore/concurrencyError'
import type { MultiStreamAppendResult } from '../eventStore/eventStoreFactory.types'
import type { AnyDomainEvent, Subject } from '../types/domainEvent.types'
import type { DefaultRecord } from '../types/index'
import type { CommandHandlerOptions, CreateStatesMap, StreamConfig } from './handleCommand.types'
import { getStreamSubjectFromSubject } from '../utils/utilsSubject'

/**
 * Thrown when a command handler reads a stream state that was not listed in
 * `streams`. Without this guard the missing entry would look exactly like a
 * stream that does not exist yet, and a wiring mistake in the caller would be
 * reported as a domain-level "not found".
 */
export class StreamNotLoadedError extends Error {
  constructor(subject: Subject) {
    super(`Stream "${subject}" was read by the command handler but is not listed in streams`)
    this.name = 'StreamNotLoadedError'
  }
}

/**
 * Every listed stream has an entry, even if the stream does not exist yet
 * (its value is then the initial state). A missing key can therefore only
 * mean that the stream was never listed.
 */
class LoadedStreamStates extends Map<Subject, any> {
  override get(subject: Subject): any {
    if (!this.has(subject)) {
      throw new StreamNotLoadedError(subject)
    }
    return super.get(subject)
  }
}

export async function handleCommand<
  Streams extends ReadonlyArray<StreamConfig<any, any>>,
  CommandType extends string,
  CommandData extends DefaultRecord | undefined,
  CommandMetadata extends DefaultRecord | undefined = undefined,
  TDomainEvent extends AnyDomainEvent = AnyDomainEvent,
>(
  options: CommandHandlerOptions<Streams, CommandType, CommandData, CommandMetadata, TDomainEvent>,
): Promise<MultiStreamAppendResult<TDomainEvent, any>> {
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
  // CreateStatesMap adds a type-level view of the per-subject states onto the
  // Map; at runtime it is a LoadedStreamStates Map, so the assertion is the
  // only way to construct it.
  const aggregatedStreamStates = new LoadedStreamStates() as CreateStatesMap<Streams>
  const expectedVersions: Map<Subject, ExpectedStreamVersion> = new Map()
  for (const stream of streams) {
    const { state, version } = await eventStore.aggregateStream<any, TDomainEvent>(stream.streamSubject, {
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
  const eventsToAppend: Array<TDomainEvent> = Array.isArray(result) ? result : [result]

  /**
   * Streams the handler emits to without having aggregated them carry no
   * version claim: the decision was not based on their state, so there is
   * no stale read to guard against.
   */
  for (const event of eventsToAppend) {
    const streamSubject = getStreamSubjectFromSubject(event.subject)
    if (!expectedVersions.has(streamSubject)) {
      expectedVersions.set(streamSubject, 'any')
    }
  }

  const newState = await eventStore.appendOrCreateStream<TDomainEvent>(
    eventsToAppend,
    { expectedVersions },
  )

  return newState
}
