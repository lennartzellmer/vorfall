import { describe, expect, it } from 'vitest'
import { createStreamSubject, createSubject, getCollectionNameFromSubject, getStreamSubjectFromSubject } from './utilsSubject'

describe('getStreamSubjectFromSubject', () => {
  it('should return root for valid multi-part subject', () => {
    const validSubject = createSubject('user/123/created')
    const result = getStreamSubjectFromSubject(validSubject)
    expect(result).toBe('user/123')
  })

  it('should return the same string if only two parts exist', () => {
    const validSubject = createSubject('user/123')
    const result = getStreamSubjectFromSubject(validSubject)
    expect(result).toBe('user/123')
  })
})

describe('getCollectionNameFromSubject', () => {
  it('should return root for valid multi-part subject', () => {
    const validSubject = createSubject('user/123/created')
    const result = getCollectionNameFromSubject(validSubject)
    expect(result).toBe('user')
  })

  it('should return root if only two parts exist', () => {
    const validSubject = createSubject('user/123')
    const result = getCollectionNameFromSubject(validSubject)
    expect(result).toBe('user')
  })

  it('should return the root for multi-part subjects', () => {
    const validSubject = createSubject('user/123')
    const result = getCollectionNameFromSubject(validSubject)
    expect(result).toBe('user')
  })
})

describe('createSubject', () => {
  it('should handle multi part subjects', () => {
    const result = createSubject('user/123/created')
    expect(result).toBe('user/123/created')
  })

  it('should handle multi word parts', () => {
    const result = createSubject('multi-word/123/created-at')
    expect(result).toBe('multi-word/123/created-at')
  })

  it('should throw error for single part subjects', () => {
    // @ts-expect-error - the function is expected to throw a type error for single part subjects
    expect(() => createSubject('user')).toThrow('Invalid subject format: "user". Expected format: entity/id or entity/id/event (multi-part subjects only)')
  })

  it('should throw error for empty subject', () => {
    // @ts-expect-error - the function is expected to throw a type error for empty subject
    expect(() => createSubject('')).toThrow('Invalid subject format')
  })

  it('should throw error for disallowed characters', () => {
    // @ts-expect-error - the function is expected to throw a type error for "user_test"
    expect(() => createSubject('user_test')).toThrow('Invalid subject format')
  })

  it('should throw error for empty parts', () => {
    // @ts-expect-error - the function is expected to throw a type error for "user//test"
    expect(() => createSubject('user//test')).toThrow('Invalid subject format')
  })
})

describe('createStreamSubject', () => {
  it('should throw error for single part subjects', () => {
    // @ts-expect-error - the function is expected to throw a type error for single part subjects
    expect(() => createStreamSubject('user')).toThrow('Invalid subject format')
  })

  it('should throw error for more than 2 parts', () => {
    // @ts-expect-error - the function is expected to throw a type error for more than 2 parts
    expect(() => createStreamSubject('user/123/created')).toThrow('Invalid subject format')
  })

  it('should throw error for empty subject', () => {
    // @ts-expect-error - the function is expected to throw a type error for empty subject
    expect(() => createStreamSubject('')).toThrow('Invalid subject format')
  })

  it('should throw error for disallowed characters', () => {
    // @ts-expect-error - the function is expected to throw a type error for "user_test"
    expect(() => createStreamSubject('user_test')).toThrow('Invalid subject format')
  })

  it('should throw error for empty parts', () => {
    // @ts-expect-error - the function is expected to throw a type error for "user//test"
    expect(() => createStreamSubject('user//test')).toThrow('Invalid subject format')
  })

  it('should return the stream subject for a valid subject', () => {
    const result = createStreamSubject('user/123')
    expect(result).toBe('user/123')
  })
})
