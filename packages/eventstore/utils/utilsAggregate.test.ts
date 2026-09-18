import type { DomainEvent, Subject } from '../types/index'
import { describe, expect, it } from 'vitest'
import { defineAggregate } from './utilsAggregate'

type CounterSubject = Subject<'counter'>
type CounterCreated = DomainEvent<'counter.created', { id: string, value: number }, undefined, CounterSubject>
type CounterIncremented = DomainEvent<'counter.incremented', { by: number }, undefined, CounterSubject>
type CounterEvent = CounterCreated | CounterIncremented

interface Counter {
  id: string
  value: number
}

function evolve(state: Counter | null, event: CounterEvent): Counter | null {
  switch (event.type) {
    case 'counter.created':
      return event.data
    case 'counter.incremented':
      return state ? { ...state, value: state.value + event.data.by } : null
  }
}
const counter = defineAggregate({
  name: 'counter',
  evolve,
})

describe('defineAggregate', () => {
  it('derives a projection that folds every event of the aggregate entity', () => {
    expect(counter.projection.name).toBe('counter')
    expect(counter.projection.entity).toBe('counter')
    expect(counter.projection.canHandle).toBeUndefined()
    expect(counter.projection.evolve).toBe(evolve)
  })

  it('starts the aggregate from null on both the command side and the projection', () => {
    expect(counter.projection.initialState()).toBeNull()
    expect(counter.stream('42').initialState()).toBeNull()
  })

  it('builds the stream subject as <name>/<id>', () => {
    expect(counter.subject('42')).toBe('counter/42')
  })

  it('rejects an id that would break the entity/id shape', () => {
    expect(() => counter.subject('4/2')).toThrow()
  })

  it('provides the stream configuration for handleCommand', () => {
    expect(counter.stream('42')).toMatchObject({ evolve, streamSubject: 'counter/42' })
  })
})
