import type { MockedObject } from 'vitest'
import type { EventStoreInstance } from '../eventStore/eventStoreFactory'
import type { Command, DomainEvent } from '../types/index'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { createDomainEvent, createEventStream } from '../utils/utilsEventStore'
import { createStreamSubject } from '../utils/utilsSubject'
import { handleCommand } from './handleCommand'
import { createStreamHandler } from './streamHandler'
import { createCommand } from './utilsCommand'

describe('handleCommand', () => {
  it('should aggregate stream, execute command handler, and append events', async () => {
    const mockEventStore = {
      aggregateStream: vi.fn(),
      appendOrCreateStream: vi.fn(),
    } as MockedObject<EventStoreInstance>

    const streamSubject = createStreamSubject('test/123')

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

    const testHandler = createStreamHandler('test', { evolve, initialState })

    const result = await handleCommand({
      eventStore: mockEventStore,
      streams: [{ handler: testHandler, id: '123' }],
      command: incrementCounterCommand,
      commandHandlerFunction,
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

    const streamSubject = createStreamSubject('test/456')

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

    const commandHandlerFunction = vi.fn(
      async ({ command }: {
        command: IncrementCounterCommand
      }): Promise<CounterIncrementedEvent> => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return createDomainEvent({
          ...counterIncrementedEvent,
          data: { incrementedBy: command.data.incrementBy },
        })
      },
    )

    const testHandler = createStreamHandler('test', { evolve, initialState })

    const result = await handleCommand({
      eventStore: mockEventStore,
      streams: [{ handler: testHandler, id: '456' }],
      command: incrementCounterCommand,
      commandHandlerFunction,
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

    const streamSubject = createStreamSubject('test/789')

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

    const commandHandlerFunction = vi.fn(
      async ({ command }: {
        command: IncrementTwiceCommand
      }): Promise<CounterIncrementedEvent[]> => {
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

    const testHandler = createStreamHandler('test', { evolve, initialState })

    const result = await handleCommand({
      eventStore: mockEventStore,
      streams: [{ handler: testHandler, id: '789' }],
      command: incrementTwiceCommand,
      commandHandlerFunction,
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

    const userStreamSubject = createStreamSubject('user/123')
    const emailListStreamSubject = createStreamSubject('emailList/123')

    type UserSubscribedEvent = DomainEvent<'user.subscribed', { emailListId: string }>
    type EmailListSubscriptionAddedEvent = DomainEvent<'emailList.subscriptionAdded', { userId: string }>

    const userSubscribedEvent: UserSubscribedEvent = createDomainEvent({
      type: 'user.subscribed',
      subject: userStreamSubject,
      data: { emailListId: '123' },
    })

    const emailListSubscriptionAddedEvent: EmailListSubscriptionAddedEvent = createDomainEvent({
      type: 'emailList.subscriptionAdded',
      subject: emailListStreamSubject,
      data: { userId: '123' },
    })

    interface UserState {
      subscriptions: string[]
    }

    interface EmailListState {
      subscribers: string[]
      maxSubscribers: number
    }

    const userEvolve = (state: UserState, event: UserSubscribedEvent): UserState => ({
      subscriptions: [...state.subscriptions, event.data.emailListId],
    })
    const userInitialState = (): UserState => ({ subscriptions: [] })

    const emailListEvolve = (state: EmailListState, event: EmailListSubscriptionAddedEvent): EmailListState => ({
      ...state,
      subscribers: [...state.subscribers, event.data.userId],
    })

    const emailListInitialState = (): EmailListState => ({
      subscribers: ['user1', 'user2', 'user3', 'user4', 'user5'],
      maxSubscribers: 10,
    })

    const mockedUserState: UserState = { subscriptions: [] }
    const mockedEmailListState: EmailListState = {
      subscribers: ['user1', 'user2', 'user3', 'user4', 'user5'],
      maxSubscribers: 10,
    }

    const mockedNewState = {
      streams: [
        createEventStream([userSubscribedEvent]),
        createEventStream([emailListSubscriptionAddedEvent]),
      ],
      totalEventsAppended: 2,
      streamSubjects: [userStreamSubject, emailListStreamSubject],
    }

    mockEventStore.aggregateStream
      .mockImplementation(async (streamSubject: string) => {
        if (streamSubject === userStreamSubject)
          return mockedUserState
        if (streamSubject === emailListStreamSubject)
          return mockedEmailListState
        throw new Error(`Unexpected stream subject: ${streamSubject}`)
      })

    mockEventStore.appendOrCreateStream.mockResolvedValue(mockedNewState)

    type SubscribeToEmailListCommand = Command<'SubscribeToEmailList', {
      userId: string
      emailListId: string
    }>
    const subscribeCommand: SubscribeToEmailListCommand = createCommand({
      type: 'SubscribeToEmailList',
      data: { userId: '123', emailListId: '123' },
    })

    const commandHandlerFunction = vi.fn(
      ({ command, states }: {
        command: SubscribeToEmailListCommand
        states?: Map<string, any>
      }): [UserSubscribedEvent, EmailListSubscriptionAddedEvent] => {
        const userState = states?.get(userStreamSubject)
        const emailListState = states?.get(emailListStreamSubject) as EmailListState

        if (emailListState.subscribers.length >= emailListState.maxSubscribers) {
          throw new Error('Email list is full')
        }

        if (userState.subscriptions.includes(command.data.emailListId)) {
          throw new Error('User already subscribed to this email list')
        }

        return [
          createDomainEvent({
            type: 'user.subscribed',
            subject: userStreamSubject,
            data: { emailListId: command.data.emailListId },
          }),
          createDomainEvent({
            type: 'emailList.subscriptionAdded',
            subject: emailListStreamSubject,
            data: { userId: command.data.userId },
          }),
        ]
      },
    )

    const userHandler = createStreamHandler('user', { evolve: userEvolve, initialState: userInitialState })
    const emailListHandler = createStreamHandler('emailList', { evolve: emailListEvolve, initialState: emailListInitialState })

    const result = await handleCommand({
      eventStore: mockEventStore,
      streams: [
        { handler: userHandler, id: '123' },
        { handler: emailListHandler, id: '123' },
      ],
      command: subscribeCommand,
      commandHandlerFunction,
    })

    expect(mockEventStore.aggregateStream).toHaveBeenCalledWith(userStreamSubject, {
      evolve: userEvolve,
      initialState: userInitialState,
    })
    expect(mockEventStore.aggregateStream).toHaveBeenCalledWith(emailListStreamSubject, {
      evolve: emailListEvolve,
      initialState: emailListInitialState,
    })

    const expectedStatesMap = new Map<string, any>([
      [userStreamSubject, mockedUserState],
      [emailListStreamSubject, mockedEmailListState],
    ])
    expect(commandHandlerFunction).toHaveBeenCalledWith({
      command: subscribeCommand,
      states: expectedStatesMap,
    })

    expect(mockEventStore.appendOrCreateStream).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ type: 'user.subscribed', subject: userStreamSubject, data: { emailListId: '123' } }),
        expect.objectContaining({ type: 'emailList.subscriptionAdded', subject: emailListStreamSubject, data: { userId: '123' } }),
      ]),
    )

    expect(result).toBe(mockedNewState)
  })

  it('should carry the inferred domain event type through to the return value', async () => {
    const mockEventStore = {
      aggregateStream: vi.fn().mockResolvedValue({ counter: 0 }),
      appendOrCreateStream: vi.fn().mockResolvedValue({
        streams: [],
        totalEventsAppended: 0,
        streamSubjects: [],
      }),
    } as MockedObject<EventStoreInstance>

    type CounterIncrementedEvent = DomainEvent<'counter.incremented', { incrementedBy: number }>

    const streamSubject = createStreamSubject('test/type-check')
    const testHandler = createStreamHandler('test', {
      evolve: (state: { counter: number }) => state,
      initialState: () => ({ counter: 0 }),
    })

    const commandHandlerFunction = (_params: unknown): CounterIncrementedEvent =>
      createDomainEvent({ type: 'counter.incremented', subject: streamSubject, data: { incrementedBy: 1 } })

    const result = await handleCommand({
      eventStore: mockEventStore,
      streams: [{ handler: testHandler, id: 'type-check' }],
      command: createCommand({ type: 'Increment' }),
      commandHandlerFunction,
    })

    expectTypeOf(result).not.toBeAny()
    expectTypeOf(result).toExtend<{
      streams: ReadonlyArray<{ events: CounterIncrementedEvent[] }>
    }>()
  })
})
