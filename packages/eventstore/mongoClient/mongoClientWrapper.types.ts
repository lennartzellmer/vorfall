import type { MongoClientOptions } from 'mongodb'

export interface MongoClientWrapperOptions {
  connectionString: string
  options?: MongoClientOptions
  maxRetries?: number
  retryDelayMs?: number
  databaseName?: string
}
