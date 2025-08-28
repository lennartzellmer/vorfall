import type { DefaultRecord } from './index.js'

export type Command<
  CommandType extends string = string,
  CommandData extends DefaultRecord | undefined = undefined,
  CommandMetadata extends DefaultRecord | undefined = undefined,
> = CommandMetadata extends DefaultRecord
  ? CommandData extends undefined
    ? {
        type: CommandType
        metadata: CommandMetadata
      }
    : {
        type: CommandType
        data: CommandData
        metadata: CommandMetadata
      }
  : CommandData extends undefined
    ? {
        type: CommandType
      }
    : {
        type: CommandType
        data: CommandData
      }
