import type { ExpectedStreamVersion } from '../eventStore/concurrencyError'
import type { MultiStreamAppendResult } from '../eventStore/eventStoreFactory.types'
import type { AnyDomainEvent, Subject } from '../types/domainEvent.types'
import type { DefaultRecord } from '../types/index'
import type { CommandHandlerOptions, CommandRetryOptions, CreateStatesMap, StreamConfig } from './handleCommand.types'
import { ConcurrencyError } from '../eventStore/concurrencyError'
import { getStreamSubjectFromSubject } from '../utils/utilsSubject'

/**
 * Thrown when a command handler reads a stream state that was not listed in
 * `streams`. Without this guard the missing entry would look exactly like a
 * stream that does not exist yet, and a wiring mistake in the caller would be
 * reported as a domain-level "not found".
 */
export class StreamNotLoadedError extends Error {
  constructor(public readonly streamSubject: Subject) {
    super(`Stream "${streamSubject}" was read by the command handler but is not listed in streams`)
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

interface RetryPolicy {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  onRetry: CommandRetryOptions['onRetry'] | undefined
}

/**
 * Conflicts resolve within milliseconds here, so the delays stay small;
 * a handful of retries covers bursts of commands on the same stream.
 */
const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 20,
  maxDelayMs: 200,
  onRetry: undefined,
}

/**
 * Fills missing fields with the defaults. `retry: false` is simply a policy
 * with zero retries, so the loop in handleCommand needs no special case.
 */
function resolveRetryPolicy(retry: false | CommandRetryOptions = {}): RetryPolicy {
  const policy: RetryPolicy = retry === false
    ? { ...DEFAULT_RETRY_POLICY, maxRetries: 0 }
    : {
        maxRetries: retry.maxRetries ?? DEFAULT_RETRY_POLICY.maxRetries,
        baseDelayMs: retry.baseDelayMs ?? DEFAULT_RETRY_POLICY.baseDelayMs,
        maxDelayMs: retry.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs,
        onRetry: retry.onRetry,
      }
  for (const key of ['maxRetries', 'baseDelayMs', 'maxDelayMs'] as const) {
    if (!Number.isInteger(policy[key]) || policy[key] < 0) {
      throw new RangeError(`retry.${key} must be a non-negative integer, got ${policy[key]}`)
    }
  }
  return policy
}

/**
 * Runs the command and appends its events. A `ConcurrencyError` from the
 * append is retried by running the whole cycle again (see `retry`): the
 * expected versions come only from this function's own reads, so a conflict
 * can only mean another writer got in between, and a new attempt decides
 * against the current state as if the command had arrived a moment later.
 */
export async function handleCommand<
  Streams extends ReadonlyArray<StreamConfig<any, any>>,
  CommandType extends string,
  CommandData extends DefaultRecord | undefined,
  CommandMetadata extends DefaultRecord | undefined = undefined,
  TDomainEvent extends AnyDomainEvent = AnyDomainEvent,
>(
  options: CommandHandlerOptions<Streams, CommandType, CommandData, CommandMetadata, TDomainEvent>,
): Promise<MultiStreamAppendResult<TDomainEvent, any>> {
  const { maxRetries, baseDelayMs, maxDelayMs, onRetry } = resolveRetryPolicy(options.retry)

  for (let attempt = 1; ; attempt++) {
    const outcome = await attemptCommand(options)
    if (!('conflict' in outcome)) {
      return outcome.result
    }
    if (attempt > maxRetries) {
      throw outcome.conflict
    }
    // Full jitter: a random delay up to an exponentially growing bound, so
    // two colliding commands do not collide again in lockstep.
    const delayMs = Math.floor(Math.random() * Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)))
    onRetry?.({ error: outcome.conflict, attempt, delayMs })
    await new Promise(resolve => setTimeout(resolve, delayMs))
  }
}

/**
 * A conflict on append is reported as an outcome rather than thrown, so
 * that only the append's own ConcurrencyError is retried: one thrown by the
 * handler is a handler error like any other and rejects immediately.
 */
type AttemptOutcome<TDomainEvent extends AnyDomainEvent>
  = | { result: MultiStreamAppendResult<TDomainEvent, any> }
    | { conflict: ConcurrencyError }

async function attemptCommand<
  Streams extends ReadonlyArray<StreamConfig<any, any>>,
  CommandType extends string,
  CommandData extends DefaultRecord | undefined,
  CommandMetadata extends DefaultRecord | undefined,
  TDomainEvent extends AnyDomainEvent,
>(
  options: CommandHandlerOptions<Streams, CommandType, CommandData, CommandMetadata, TDomainEvent>,
): Promise<AttemptOutcome<TDomainEvent>> {
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
   * An empty result means the handler decided there is nothing to record:
   * the command is already satisfied by the current state. Nothing is
   * appended and no version is checked, since no stream is touched.
   */
  if (eventsToAppend.length === 0) {
    return { result: { streams: [], totalEventsAppended: 0, streamSubjects: [] } }
  }

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

  try {
    return { result: await eventStore.appendOrCreateStream<TDomainEvent>(eventsToAppend, { expectedVersions }) }
  }
  catch (error) {
    if (error instanceof ConcurrencyError) {
      return { conflict: error }
    }
    throw error
  }
}
