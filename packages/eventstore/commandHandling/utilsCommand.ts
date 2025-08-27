import type { Command } from '../types/index.js'
import type { DefaultRecord } from './handleCommand.types.js'

export function createCommand<
  CommandType extends string,
  CommandData extends DefaultRecord | undefined,
>(
  params: {
    type: CommandType
    data: CommandData
  }
): Command<CommandType, CommandData>

export function createCommand<
  CommandType extends string,
  CommandData extends DefaultRecord | undefined,
  CommandMetadata extends DefaultRecord,
>(
  params: {
    type: CommandType
    data: CommandData
    metadata: CommandMetadata
  }
): Command<CommandType, CommandData, CommandMetadata>

export function createCommand<
  CommandType extends string,
  CommandData extends DefaultRecord | undefined,
  CommandMetadata extends DefaultRecord,
>(
  params: {
    type: CommandType
    data: CommandData
    metadata?: CommandMetadata
  },
): Command<CommandType, CommandData, CommandMetadata> | Command<CommandType, CommandData> {
  const { type, data, metadata } = params
  if (!metadata) {
    return {
      type,
      data,
    } as Command<CommandType, CommandData>
  }
  return {
    type,
    data,
    metadata,
  } as Command<CommandType, CommandData, CommandMetadata>
}
