import type { MockedObject } from 'vitest'
import type { EventStoreInstance } from '../eventStore/eventStoreFactory'
import type { Command, DomainEvent } from '../types/index'
import { describe, expect, it, vi } from 'vitest'
import { createDomainEvent, createEventStream } from '../utils/utilsEventStore'
import { createStreamSubject } from '../utils/utilsSubject'
import { handleCommand } from './handleCommand'
import { createCommand } from './utilsCommand'

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

    const evolve = (state: AggregatedState) => ({ ...state, counter: state.counter + 1 })
    const initialState = () => ({ test: 0, counter: 0 })

    const mockedAggregatedState: AggregatedState = { counter: 42 }
    const mockedNewState = {
      streams: [createEventStream([counterIncrementedEvent])],
      totalEventsAppended: 1,
      streamSubjects: [streamSubject],
    }

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
      streams: [{
        evolve,
        initialState,
        streamSubject,
      }],
      eventStore: mockEventStore,
      commandHandlerFunction,
      command: incrementCounterCommand,
    })

    expect(mockEventStore.aggregateStream).toHaveBeenCalledWith(streamSubject, {
      evolve,
      initialState,
    })
    expect(commandHandlerFunction).toHaveBeenCalledWith({ command: incrementCounterCommand, states: new Map([[streamSubject, mockedAggregatedState]]) })
    expect(mockEventStore.appendOrCreateStream).toHaveBeenCalledWith([counterIncrementedEvent])
    expect(result).toBe(mockedNewState)
  })

  it('should handle async command handler function', async () => {
    const mockEventStore = {
      aggregateStream: vi.fn(),
      appendOrCreateStream: vi.fn(),
    } as MockedObject<EventStoreInstance>

    const streamSubject = createStreamSubject('test/stream/456')

    type CounterIncrementedEvent = DomainEvent<'counter.incremented', { incrementedBy: number }>
    const counterIncrementedEvent: CounterIncrementedEvent = createDomainEvent({
      type: 'counter.incremented',
      subject: streamSubject,
      data: { incrementedBy: 10 },
    })

    interface AggregatedState {
      counter: number
    }

    const evolve = (state: AggregatedState) => ({ ...state, counter: state.counter + 1 })
    const initialState = () => ({ test: 0, counter: 0 })

    const mockedAggregatedState: AggregatedState = { counter: 10 }
    const mockedNewState = {
      streams: [createEventStream([counterIncrementedEvent])],
      totalEventsAppended: 1,
      streamSubjects: [streamSubject],
    }

    mockEventStore.aggregateStream.mockResolvedValue(mockedAggregatedState)
    mockEventStore.appendOrCreateStream.mockResolvedValue(mockedNewState)

    type IncrementCounterCommand = Command<'IncrementCounter', { incrementBy: number }>
    const incrementCounterCommand: IncrementCounterCommand = createCommand({
      type: 'IncrementCounter',
      data: { incrementBy: 10 },
    })

    // Async command handler function
    const commandHandlerFunction = vi.fn(
      async ({ command }: {
        command: IncrementCounterCommand
      }): Promise<CounterIncrementedEvent> => {
        // Simulate some async operation
        await new Promise(resolve => setTimeout(resolve, 10))
        return createDomainEvent({
          ...counterIncrementedEvent,
          data: { incrementedBy: command.data.incrementBy },
        })
      },
    )

    const result = await handleCommand({
      streams: [{
        evolve,
        initialState,
        streamSubject,
      }],
      eventStore: mockEventStore,
      commandHandlerFunction,
      command: incrementCounterCommand,
    })

    expect(mockEventStore.aggregateStream).toHaveBeenCalledWith(streamSubject, {
      evolve,
      initialState,
    })
    expect(commandHandlerFunction).toHaveBeenCalledWith({ command: incrementCounterCommand, states: new Map([[streamSubject, mockedAggregatedState]]) })
    expect(mockEventStore.appendOrCreateStream).toHaveBeenCalledWith([counterIncrementedEvent])
    expect(result).toBe(mockedNewState)
  })

  it('should handle async command handler function returning multiple events', async () => {
    const mockEventStore = {
      aggregateStream: vi.fn(),
      appendOrCreateStream: vi.fn(),
    } as MockedObject<EventStoreInstance>

    const streamSubject = createStreamSubject('test/stream/789')

    type CounterIncrementedEvent = DomainEvent<'counter.incremented', { incrementedBy: number }>

    const counterIncrementedEvent1: CounterIncrementedEvent = createDomainEvent({
      type: 'counter.incremented',
      subject: streamSubject,
      data: { incrementedBy: 5 },
    })

    const counterIncrementedEvent2: CounterIncrementedEvent = createDomainEvent({
      type: 'counter.incremented',
      subject: streamSubject,
      data: { incrementedBy: 10 },
    })

    interface AggregatedState {
      counter: number
    }

    const evolve = (state: AggregatedState, event: CounterIncrementedEvent) => ({
      ...state,
      counter: state.counter + event.data.incrementedBy,
    })
    const initialState = () => ({ test: 0, counter: 0 })

    const mockedAggregatedState: AggregatedState = { counter: 5 }
    const mockedNewState = {
      streams: [createEventStream([counterIncrementedEvent1, counterIncrementedEvent2])],
      totalEventsAppended: 2,
      streamSubjects: [streamSubject],
    }

    mockEventStore.aggregateStream.mockResolvedValue(mockedAggregatedState)
    mockEventStore.appendOrCreateStream.mockResolvedValue(mockedNewState)

    type IncrementTwiceCommand = Command<'IncrementTwice', { incrementBy: number }>
    const incrementTwiceCommand: IncrementTwiceCommand = createCommand({
      type: 'IncrementTwice',
      data: { incrementBy: 5 },
    })

    // Async command handler function returning array of events
    const commandHandlerFunction = vi.fn(
      async ({ command }: {
        command: IncrementTwiceCommand
      }): Promise<CounterIncrementedEvent[]> => {
        // Simulate some async operation
        await new Promise(resolve => setTimeout(resolve, 10))
        return [
          createDomainEvent({
            ...counterIncrementedEvent1,
            data: { incrementedBy: command.data.incrementBy },
          }),
          createDomainEvent({
            ...counterIncrementedEvent2,
            data: { incrementedBy: command.data.incrementBy * 2 },
          }),
        ]
      },
    )

    const result = await handleCommand({
      streams: [{
        evolve,
        initialState,
        streamSubject,
      }],
      eventStore: mockEventStore,
      commandHandlerFunction,
      command: incrementTwiceCommand,
    })

    expect(mockEventStore.aggregateStream).toHaveBeenCalledWith(streamSubject, {
      evolve,
      initialState,
    })
    expect(commandHandlerFunction).toHaveBeenCalledWith({ command: incrementTwiceCommand, states: new Map([[streamSubject, mockedAggregatedState]]) })
    expect(mockEventStore.appendOrCreateStream).toHaveBeenCalledWith([counterIncrementedEvent1, counterIncrementedEvent2])
    expect(result).toBe(mockedNewState)
  })

  it('should handle command handler function when provided with multiple streams', async () => {
    const mockEventStore = {
      aggregateStream: vi.fn(),
      appendOrCreateStream: vi.fn(),
    } as MockedObject<EventStoreInstance>

    const streamSubject1 = createStreamSubject('test/stream/123')
    const streamSubject2 = createStreamSubject('test/stream/456')

    type CounterIncrementedEvent = DomainEvent<'counter.incremented', { incrementedBy: number }>

    const counterIncrementedEvent1: CounterIncrementedEvent = createDomainEvent({
      type: 'counter.incremented',
      subject: streamSubject1,
      data: { incrementedBy: 5 },
    })

    const counterIncrementedEvent2: CounterIncrementedEvent = createDomainEvent({
      type: 'counter.incremented',
      subject: streamSubject2,
      data: { incrementedBy: 10 },
    })

    interface AggregatedState {
      counter: number
    }

    const evolve = (state: AggregatedState, event: CounterIncrementedEvent) => ({
      ...state,
      counter: state.counter + event.data.incrementedBy,
    })

    const mockedAggregatedState: AggregatedState = { counter: 5 }

    const mockedNewState = {
      streams: [createEventStream([counterIncrementedEvent1, counterIncrementedEvent2])],
      totalEventsAppended: 2,
      streamSubjects: [streamSubject1, streamSubject2],
    }
  })
})
