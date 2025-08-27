import type { MockedObject } from 'vitest'
import type { EventStoreInstance } from '../eventStore/eventStoreFactory.js'
import type { Command, DomainEvent } from '../types/index.js'
import { describe, expect, it, vi } from 'vitest'
import { createDomainEvent, createEventStream } from '../utils/utilsEventStore.js'
import { createStreamSubject } from '../utils/utilsSubject.js'
import { handleCommand } from './handleCommand.js'
import { createCommand } from './utilsCommand.js'

describe('handleCommand', () => {
  it('should aggregate stream, execute command handler, and append events', async () => {
    const mockEventStore = {
      aggregateStream: vi.fn(),
      appendOrCreateStream: vi.fn(),
    } as MockedObject<EventStoreInstance>

    const streamSubject = createStreamSubject('test/stream/123')

    type CounterIncrementedEvent = DomainEvent<'counter.incremented', { incrementedBy: number }>
    const counterIncrementedEvent: CounterIncrementedEvent = createDomainEvent({
      type: 'counter.incremented',
      subject: streamSubject,
      data: { incrementedBy: 42 },
    })

    interface AggregatedState {
      counter: number
    }

    const evolve = vi.fn(state => ({ ...state, counter: state.counter + 1 }))
    const initialState = vi.fn(() => ({ test: 0 }))

    const mockedAggregatedState: AggregatedState = { counter: 42 }
    const mockedNewState = createEventStream([counterIncrementedEvent])

    mockEventStore.aggregateStream.mockResolvedValue(mockedAggregatedState)
    mockEventStore.appendOrCreateStream.mockResolvedValue(mockedNewState)

    type IncrementCounterCommand = Command<'IncrementCounter', { incrementBy: number }>
    const incrementCounterCommand: IncrementCounterCommand = createCommand({
      type: 'IncrementCounter',
      data: { incrementBy: 42 },
    })

    const commandHandlerFunction = vi.fn(
      ({ command }: {
        command: IncrementCounterCommand
      }): CounterIncrementedEvent => createDomainEvent({
        ...counterIncrementedEvent,
        data: { incrementedBy: command.data.incrementBy },
      }),
    )

    const result = await handleCommand({
      evolve,
      initialState,
      eventStore: mockEventStore,
      streamSubject,
      commandHandlerFunction,
      command: incrementCounterCommand,
    })

    expect(mockEventStore.aggregateStream).toHaveBeenCalledWith(streamSubject, {
      evolve,
      initialState,
    })
    expect(commandHandlerFunction).toHaveBeenCalledWith({ command: incrementCounterCommand, state: mockedAggregatedState })
    expect(mockEventStore.appendOrCreateStream).toHaveBeenCalledWith([counterIncrementedEvent])
    expect(result).toBe(mockedNewState)
  })
})
