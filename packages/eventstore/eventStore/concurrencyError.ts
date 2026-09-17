import type { Subject } from '../types/index'

/**
 * The stream version a caller expects at append time:
 * - a number: the stream must have exactly this many events (0 behaves like 'no-stream')
 * - 'no-stream': the stream must not exist yet, the append creates it
 * - 'any': no check, append or create unconditionally
 */
export type ExpectedStreamVersion = number | 'any' | 'no-stream'

/**
 * Thrown when an append passes an expectedVersions map that has no entry for
 * one of the streams being appended to. Opting out of the concurrency check
 * must be explicit: list the stream with 'any'.
 */
export class MissingExpectedVersionError extends Error {
  constructor(public readonly streamSubject: Subject) {
    super(
      `No expected version given for stream "${streamSubject}". List it in expectedVersions — with 'any' to append without a concurrency check.`,
    )
    this.name = 'MissingExpectedVersionError'
  }
}

export class ConcurrencyError extends Error {
  constructor(
    public readonly streamSubject: Subject,
    public readonly expectedVersion: ExpectedStreamVersion,
    public readonly actualVersion?: number,
  ) {
    super(
      `Concurrency conflict on stream "${streamSubject}": expected version ${expectedVersion}, ${
        actualVersion === undefined ? 'but the stream state changed concurrently' : `actual version is ${actualVersion}`}`,
    )
    this.name = 'ConcurrencyError'
  }
}
