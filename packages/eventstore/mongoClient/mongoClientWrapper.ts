import type { Db } from 'mongodb'
import type { MongoClientWrapperOptions } from './mongoClientWrapper.types'
import { MongoClient } from 'mongodb'

export class MongoClientWrapper {
  private client: MongoClient
  private isConnecting = false
  private connectionPromise: Promise<void> | null = null
  private readonly maxRetries: number
  private readonly retryDelayMs: number
  private readonly databaseName: string
  private retryCount = 0

  constructor(private readonly config: MongoClientWrapperOptions) {
    this.maxRetries = config.maxRetries ?? 3
    this.retryDelayMs = config.retryDelayMs ?? 1000
    this.databaseName = config.databaseName ?? 'default'

    // Create client with bufferMaxEntries to enable buffering
    this.client = new MongoClient(config.connectionString, {
      ...config.options,
    })

    // Start connection immediately but don't await it
    this.connect()
  }

  /**
   * Returns the MongoDB client synchronously.
   * Operations will be buffered until connection is established.
   */
  public getClient(): MongoClient {
    return this.client
  }

  /**
   * Returns a database instance synchronously.
   * Operations will be buffered until connection is established.
   */
  public getDatabase(): Db {
    return this.client.db(this.databaseName)
  }

  /**
   * Explicitly wait for connection to be established.
   * This is optional since operations are buffered.
   */
  public async waitForConnection(): Promise<void> {
    if (this.connectionPromise) {
      await this.connectionPromise
    }
  }

  public async close(): Promise<void> {
    try {
      await this.client.close()
    }
    catch (error) {
      console.error('Error closing MongoDB connection:', error)
      throw error
    }
    finally {
      this.connectionPromise = null
      this.isConnecting = false
      this.retryCount = 0
    }
  }

  private async connect(): Promise<void> {
    if (this.isConnecting) {
      return this.connectionPromise || Promise.resolve()
    }

    // Check if already connected
    try {
      await this.client.db('admin').admin().ping()
      return // Already connected
    }
    catch {
      // Not connected, proceed with connection attempt
    }

    this.isConnecting = true
    this.connectionPromise = this.attemptConnection()

    try {
      await this.connectionPromise
    }
    finally {
      this.isConnecting = false
    }
  }

  private async attemptConnection(): Promise<void> {
    while (this.retryCount < this.maxRetries) {
      try {
        await this.client.connect()
        this.retryCount = 0 // Reset on successful connection
        return
      }
      catch (error) {
        this.retryCount++
        console.error(`MongoDB connection attempt ${this.retryCount} failed:`, error)

        if (this.retryCount >= this.maxRetries) {
          throw new Error(`Failed to connect to MongoDB after ${this.maxRetries} attempts: ${error}`)
        }

        await this.delay(this.retryDelayMs * this.retryCount) // Exponential backoff
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
