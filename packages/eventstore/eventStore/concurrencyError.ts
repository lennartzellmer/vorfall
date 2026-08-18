import type { Subject } from '../types/index'

/**
 * The stream version a caller expects at append time:
 * - a number: the stream must have exactly this many events (0 behaves like 'no-stream')
 * - 'no-stream': the stream must not exist yet, the append creates it
 * - 'any': no check, append or create unconditionally
 */
export type ExpectedStreamVersion = number | 'any' | 'no-stream'

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
