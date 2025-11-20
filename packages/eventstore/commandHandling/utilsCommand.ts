import type { Command } from '../types/index'
import type { DefaultRecord } from './handleCommand.types'

// Overload 1: Only type (no data, no metadata)
export function createCommand<
  CommandType extends string,
>(
  params: {
    type: CommandType
  },
): Command<CommandType, undefined>

// Overload 2: Type + metadata (no data)
export function createCommand<
  CommandType extends string,
  CommandMetadata extends DefaultRecord,
>(
  params: {
    type: CommandType
    metadata: CommandMetadata
  },
): Command<CommandType, undefined, CommandMetadata>

// Overload 4: Type + data
export function createCommand<
  CommandType extends string,
  CommandData extends DefaultRecord,
>(
  params: {
    type: CommandType
    data: CommandData
  },
): Command<CommandType, CommandData>

// Overload 5: Type + data + metadata
export function createCommand<
  CommandType extends string,
  CommandData extends DefaultRecord,
  CommandMetadata extends DefaultRecord,
>(
  params: {
    type: CommandType
    data: CommandData
    metadata: CommandMetadata
  },
): Command<CommandType, CommandData, CommandMetadata>

// Implementation
export function createCommand<
  CommandType extends string,
  CommandData extends DefaultRecord | undefined,
  CommandMetadata extends DefaultRecord | undefined,
>(
  params: {
    type: CommandType
    data?: CommandData
    metadata?: CommandMetadata
  },
): Command<CommandType, CommandData, CommandMetadata> {
  const { type, data, metadata } = params

  if (metadata !== undefined) {
    if (data === undefined) {
      return { type, metadata } as Command<CommandType, CommandData, CommandMetadata>
    }
    else {
      return { type, data, metadata } as Command<CommandType, CommandData, CommandMetadata>
    }
  }
  else {
    if (data === undefined) {
      return { type } as Command<CommandType, CommandData, CommandMetadata>
    }
    else {
      return { type, data } as Command<CommandType, CommandData, CommandMetadata>
    }
  }
}
