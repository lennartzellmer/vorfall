export * from './command.types'
export * from './domainEvent.types'

export type Brand<K, T> = K & { readonly __brand: T }

export type DefaultRecord = Record<string, unknown>

export type AnyRecord = Record<string, any>

export type NonNullable<T> = T extends null | undefined ? never : T

export type MaybeAwait<T> = T | Promise<T>
