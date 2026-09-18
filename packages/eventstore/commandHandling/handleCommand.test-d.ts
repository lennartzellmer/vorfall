import type { EventStoreInstance } from '../eventStore/eventStoreFactory'
import type { Command, DomainEvent, Subject } from '../types/index'
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

test('infers the event type from a handler returning a single event', async () => {
  const result = await handleCommand({
    eventStore,
    command,
    streams,
    commandHandlerFunction: () => counterEvent,
  })
  expectTypeOf(result.streams[0]!.events[0]!).toEqualTypeOf<CounterIncremented>()
})

test('infers the element type from a handler returning an array', async () => {
  const result = await handleCommand({
    eventStore,
    command,
    streams,
    commandHandlerFunction: () => [counterEvent],
  })
  expectTypeOf(result.streams[0]!.events[0]!).toEqualTypeOf<CounterIncremented>()
})

test('infers through a Promise return', async () => {
  const result = await handleCommand({
    eventStore,
    command,
    streams,
    commandHandlerFunction: async () => counterEvent,
  })
  expectTypeOf(result.streams[0]!.events[0]!).toEqualTypeOf<CounterIncremented>()
})

test('infers the union when the handler emits to multiple streams', async () => {
  const result = await handleCommand({
    eventStore,
    command,
    streams,
    commandHandlerFunction: () => [counterEvent, auditEvent],
  })
  expectTypeOf(result.streams[0]!.events[0]!).toEqualTypeOf<CounterIncremented | AuditLogged>()
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

test('infers from a handler declared outside the call', async () => {
  const externalHandler: CommandHandlerFunction<
    typeof streams,
    'IncrementCounter',
    { by: number },
    undefined,
    CounterIncremented
  > = () => counterEvent

  const result = await handleCommand({
    eventStore,
    command,
    streams,
    commandHandlerFunction: externalHandler,
  })
  expectTypeOf(result.streams[0]!.events[0]!).toEqualTypeOf<CounterIncremented>()
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
