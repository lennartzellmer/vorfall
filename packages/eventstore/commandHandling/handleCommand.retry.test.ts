import type { EventStoreInstance } from '../eventStore/eventStoreFactory'
import type { Command, DomainEvent, Subject } from '../types/index'
import type { CommandRetryInfo } from './handleCommand.types'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ConcurrencyError } from '../eventStore/concurrencyError'
import { createEventStore } from '../eventStore/eventStoreFactory'
import { createDomainEvent } from '../utils/utilsEventStore'
import { createStreamSubject } from '../utils/utilsSubject'
import { handleCommand } from './handleCommand'
import { createCommand } from './utilsCommand'

type CounterIncremented = DomainEvent<'counter.incremented', { by: number }>
type IncrementCommand = Command<'IncrementCounter', { by: number }>
type SetCommand = Command<'SetCounter', { to: number }>

interface CounterState { counter: number }

const streamSubject = createStreamSubject('counter/1')

const counterStream = {
  streamSubject,
  initialState: (): CounterState => ({ counter: 0 }),
  evolve: (state: CounterState, event: CounterIncremented): CounterState => ({ counter: state.counter + event.data.by }),
}

function incremented(by: number): CounterIncremented {
  return createDomainEvent({ type: 'counter.incremented', subject: streamSubject, data: { by } })
}

function setCounter(to: number): SetCommand {
  return createCommand({ type: 'SetCounter', data: { to } })
}

function incrementCounter(by: number): IncrementCommand {
  return createCommand({ type: 'IncrementCounter', data: { by } })
}

function counterState(states: Map<Subject, CounterState> | undefined): CounterState {
  return states!.get(streamSubject)!
}

// Keeps the tests fast; the delay itself is covered separately.
const noDelay = { baseDelayMs: 0 }

describe('handleCommand retry on ConcurrencyError', () => {
  let replSet: MongoMemoryReplSet
  let eventStore: EventStoreInstance

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
    eventStore = createEventStore({ connectionString: replSet.getUri() })
    await eventStore.getInstanceMongoClientWrapper().waitForConnection()
  })

  afterEach(async () => {
    const db = eventStore.getInstanceMongoClientWrapper().getDatabase()
    for (const collection of await db.collections()) {
      await collection.drop()
    }
  })

  afterAll(async () => {
    await eventStore.getInstanceMongoClientWrapper().close()
    await replSet.stop()
  })

  /** Appends behind the back of the running command, invalidating its read. */
  async function competingAppend(by: number): Promise<void> {
    await eventStore.appendOrCreateStream([incremented(by)], { expectedVersions: 'any' })
  }

  it('should re-read and decide again when another writer got in between', async () => {
    await competingAppend(1)

    const seenCounters: Array<number> = []
    const commandHandlerFunction = vi.fn(async ({ command, states }: { command: SetCommand, states?: Map<Subject, CounterState> }) => {
      const { counter } = counterState(states)
      seenCounters.push(counter)
      if (seenCounters.length === 1) {
        await competingAppend(10)
      }
      return incremented(command.data.to - counter)
    })

    const result = await handleCommand({
      eventStore,
      streams: [counterStream],
      command: setCounter(100),
      commandHandlerFunction,
      retry: noDelay,
    })

    expect(commandHandlerFunction).toHaveBeenCalledTimes(2)
    expect(seenCounters).toEqual([1, 11])
    // The decision of the stale first attempt (+99) was discarded, not re-appended.
    expect(result.streams[0]!.events.map(event => event.data.by)).toEqual([1, 10, 89])
    expect(result.streams[0]!.version).toBe(3)
  })

  it('should end as a no-op when the retried decision finds nothing left to do', async () => {
    const commandHandlerFunction = vi.fn(async ({ command, states }: { command: SetCommand, states?: Map<Subject, CounterState> }) => {
      const { counter } = counterState(states)
      if (counter === command.data.to) {
        return []
      }
      if (commandHandlerFunction.mock.calls.length === 1) {
        // Someone else sets the counter to the same target first.
        await competingAppend(command.data.to)
      }
      return [incremented(command.data.to - counter)]
    })

    const result = await handleCommand({
      eventStore,
      streams: [counterStream],
      command: setCounter(5),
      commandHandlerFunction,
      retry: noDelay,
    })

    expect(commandHandlerFunction).toHaveBeenCalledTimes(2)
    expect(result.totalEventsAppended).toBe(0)
    const { version } = await eventStore.getEventStreamBySubject(streamSubject)
    expect(version).toBe(1)
  })

  it('should let concurrent commands on the same stream all succeed with the default retry', async () => {
    const increment = (by: number) => handleCommand({
      eventStore,
      streams: [counterStream],
      command: incrementCounter(by),
      commandHandlerFunction: ({ command }: { command: IncrementCommand }) => incremented(command.data.by),
    })

    // Every failed attempt means one of the other commands committed, so with
    // three commands no command can fail more than twice.
    await Promise.all([increment(1), increment(2), increment(3)])

    const { state, version } = await eventStore.aggregateStream(streamSubject, counterStream)
    expect(state).toEqual({ counter: 6 })
    expect(version).toBe(3)
  })

  it('should rethrow the last ConcurrencyError unchanged after maxRetries + 1 attempts', async () => {
    const retries: Array<CommandRetryInfo> = []
    const commandHandlerFunction = vi.fn(async () => {
      await competingAppend(1)
      return incremented(1)
    })

    const handled = handleCommand({
      eventStore,
      streams: [counterStream],
      command: incrementCounter(1),
      commandHandlerFunction,
      retry: { ...noDelay, maxRetries: 2, onRetry: info => retries.push(info) },
    })

    await expect(handled).rejects.toBeInstanceOf(ConcurrencyError)
    await expect(handled).rejects.toMatchObject({ streamSubject, expectedVersion: 2, actualVersion: 3 })
    expect(commandHandlerFunction).toHaveBeenCalledTimes(3)
    expect(retries.map(({ attempt }) => attempt)).toEqual([1, 2])
    expect(retries.every(({ error }) => error instanceof ConcurrencyError)).toBe(true)
  })

  it('should not retry an error thrown by the handler', async () => {
    const commandHandlerFunction = vi.fn(() => {
      throw new Error('Counter is locked')
    })

    const handled = handleCommand({
      eventStore,
      streams: [counterStream],
      command: incrementCounter(1),
      commandHandlerFunction,
    })

    await expect(handled).rejects.toThrowError('Counter is locked')
    expect(commandHandlerFunction).toHaveBeenCalledTimes(1)
  })

  it('should not retry with retry: false', async () => {
    const commandHandlerFunction = vi.fn(async () => {
      await competingAppend(1)
      return incremented(1)
    })

    const handled = handleCommand({
      eventStore,
      streams: [counterStream],
      command: incrementCounter(1),
      commandHandlerFunction,
      retry: false,
    })

    await expect(handled).rejects.toBeInstanceOf(ConcurrencyError)
    expect(commandHandlerFunction).toHaveBeenCalledTimes(1)
  })

  it('should wait a jittered delay below the exponentially growing, capped bound', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const delays: Array<number> = []

    const handled = handleCommand({
      eventStore,
      streams: [counterStream],
      command: incrementCounter(1),
      commandHandlerFunction: async () => {
        await competingAppend(1)
        return incremented(1)
      },
      retry: { maxRetries: 4, baseDelayMs: 10, maxDelayMs: 50, onRetry: ({ delayMs }) => delays.push(delayMs) },
    })

    await expect(handled).rejects.toBeInstanceOf(ConcurrencyError)
    // Bounds 10, 20, 40, 50 (capped), halved by the mocked random.
    expect(delays).toEqual([5, 10, 20, 25])
    vi.restoreAllMocks()
  })

  it('should reject invalid retry options before touching the store', async () => {
    const commandHandlerFunction = vi.fn(() => incremented(1))

    const handled = handleCommand({
      eventStore,
      streams: [counterStream],
      command: incrementCounter(1),
      commandHandlerFunction,
      retry: { maxRetries: -1 },
    })

    await expect(handled).rejects.toBeInstanceOf(RangeError)
    expect(commandHandlerFunction).not.toHaveBeenCalled()
  })
})
