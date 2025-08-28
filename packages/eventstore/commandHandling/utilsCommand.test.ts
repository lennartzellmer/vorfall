import { describe, expect, it } from 'vitest'
import { createCommand } from './utilsCommand.js'

describe('createCommand', () => {
  it('should create a command with type and data', () => {
    const type = 'TEST_COMMAND'
    const data = { value: 'test' }

    const command = createCommand({ type, data })

    expect(command).toEqual({
      type: 'TEST_COMMAND',
      data: { value: 'test' },
    })
  })

  it('should create a command with undefined data', () => {
    const type = 'SIMPLE_COMMAND'

    const command = createCommand({ type })

    expect(command).toEqual({
      type: 'SIMPLE_COMMAND',
    })
  })

  it('should create a command with metadata', () => {
    const type = 'TEST_COMMAND'
    const data = { value: 'test' }
    const metadata = { userId: '123' }

    const command = createCommand({ type, data, metadata })

    expect(command).toEqual({
      type: 'TEST_COMMAND',
      data: { value: 'test' },
      metadata: { userId: '123' },
    })
  })

  it('should create a command with metadata but no data property', () => {
    const type = 'SIMPLE_COMMAND'
    const metadata = { userId: '123' }

    const command = createCommand({ type, metadata })

    expect(command).toEqual({
      type: 'SIMPLE_COMMAND',
      metadata: { userId: '123' },
    })
  })
})
