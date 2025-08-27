import type { DefaultRecord } from './index.js'

export type Command<
  CommandType extends string = string,
  CommandData extends DefaultRecord | undefined = undefined,
  CommandMetadata extends DefaultRecord | undefined = undefined,
> = CommandMetadata extends DefaultRecord ? {
  type: CommandType
  data: CommandData
  metadata: CommandMetadata
} : {
  type: CommandType
  data: CommandData
}
