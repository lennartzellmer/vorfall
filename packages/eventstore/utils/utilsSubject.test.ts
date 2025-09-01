import { describe, expect, it } from 'vitest'
import { createSubject, getCollectionNameFromSubject, getStreamSubjectFromSubject } from './utilsSubject'

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

  it('should error for single part subjects', () => {
    const validSubject = createSubject('user')
    expect(() => getStreamSubjectFromSubject(validSubject)).toThrow('Invalid subject format: "user". Expected format: entity/id or entity/id/event')
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

  it('should retrun the root for single part subjects', () => {
    const validSubject = createSubject('user')
    const result = getCollectionNameFromSubject(validSubject)
    expect(result).toBe('user')
  })
})

describe('createStreamSubject', () => {
  it('should handle single part subjects', () => {
    const result = createSubject('user')
    expect(result).toBe('user')
  })

  it('should handle multi part subjects', () => {
    const result = createSubject('user/123/created')
    expect(result).toBe('user/123/created')
  })

  it('should handle multi word parts', () => {
    const result = createSubject('multi-word/123/created-at')
    expect(result).toBe('multi-word/123/created-at')
  })

  it('should throw error for empty subject', () => {
    expect(() => createSubject('')).toThrow('Invalid subject format')
  })

  it('should throw error for disallowed characters', () => {
    expect(() => createSubject('user_test')).toThrow('Invalid subject format')
  })

  it('should throw error for empty parts', () => {
    expect(() => createSubject('user//test')).toThrow('Invalid subject format')
  })
})
