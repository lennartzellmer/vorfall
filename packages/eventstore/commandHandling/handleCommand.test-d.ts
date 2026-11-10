import type { EventStoreInstance } from '../eventStore/eventStoreFactory'
import type { AnyDomainEvent, Command, DomainEvent, Subject } from '../types/index'
import type { CommandHandlerFunction } from './handleCommand.types'
import { expectTypeOf, test } from 'vitest'
import { handleCommand } from './handleCommand'

type CounterIncremented = DomainEvent<'counter.incremented', { by: number }>
type AuditLogged = DomainEvent<'audit.logged', { note: string }>
type IncrementCommand = Command<'IncrementCounter', { by: number }>

declare const eventStore: EventStoreInstance
declare const command: IncrementCommand
declare const counterEvent: CounterIncremented
declare const auditEvent: AuditLogged
declare const streamSubject: Subject

interface CounterState { counter: number }

const streams = [{
  streamSubject,
  initialState: (): CounterState => ({ counter: 0 }),
  evolve: (state: CounterState, _event: CounterIncremented): CounterState => state,
}]

test('accepts a handler returning an event, an array of events or a Promise of either', () => {
  void handleCommand({ eventStore, command, streams, commandHandlerFunction: () => counterEvent })
  void handleCommand({ eventStore, command, streams, commandHandlerFunction: () => [counterEvent, auditEvent] })
  void handleCommand({ eventStore, command, streams, commandHandlerFunction: async () => counterEvent })
  void handleCommand({ eventStore, command, streams, commandHandlerFunction: async () => [counterEvent] })
})

// A returned stream holds every event stored in it: its earlier events and
// derived events, not only the ones the handler returned.
test('types the result stream events as any stored event, not as the handler events', async () => {
  const result = await handleCommand({ eventStore, command, streams, commandHandlerFunction: () => counterEvent })

  expectTypeOf(result.streams[0]!.events[0]!).toEqualTypeOf<AnyDomainEvent>()
})

test('contextually types the command param of an inline handler', async () => {
  await handleCommand({
    eventStore,
    command,
    streams,
    commandHandlerFunction: (params) => {
      expectTypeOf(params.command).toEqualTypeOf<IncrementCommand>()
      return counterEvent
    },
  })
})

test('accepts a handler declared outside the call', () => {
  const externalHandler: CommandHandlerFunction<
    typeof streams,
    'IncrementCounter',
    { by: number },
    undefined,
    CounterIncremented
  > = () => counterEvent

  void handleCommand({ eventStore, command, streams, commandHandlerFunction: externalHandler })
})

test('rejects a handler that does not return domain events', () => {
  void handleCommand({
    eventStore,
    command,
    streams,
    // @ts-expect-error - a string is not a domain event
    commandHandlerFunction: () => 'not an event',
  })
})

test('accepts retry options or false, but not true', () => {
  void handleCommand({ eventStore, command, streams, commandHandlerFunction: () => counterEvent, retry: false })
  void handleCommand({
    eventStore,
    command,
    streams,
    commandHandlerFunction: () => counterEvent,
    retry: { maxRetries: 1, onRetry: ({ error, attempt, delayMs }) => void [error.streamSubject, attempt, delayMs] },
  })
  // @ts-expect-error - retrying is the default; only false or options are meaningful
  void handleCommand({ eventStore, command, streams, commandHandlerFunction: () => counterEvent, retry: true })
})
