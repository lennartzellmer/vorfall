import type { Subject } from '../types/domainEvent.types'

const SUBJECT_REGEX = /^[a-z0-9-]+(?:\/[a-z0-9-]+)+$/i
const STREAM_SUBJECT_REGEX = /^[a-z0-9-]+\/[a-z0-9-]+$/i

export class InvalidSubjectFormatError extends Error {
  constructor(subject: string, expectedFormat?: string) {
    const format = expectedFormat || 'entity/id or entity/id/event (multi-part subjects only)'
    super(`Invalid subject format: "${subject}". Expected format: ${format}`)
    this.name = 'InvalidSubjectFormatError'
  }
}

// Type-level validation for better error messages
type ValidSubjectError<T>
  = T extends '' ? 'Subject cannot be empty'
    : T extends `/${string}` ? 'Subject cannot start with "/"'
      : T extends `${string}/` ? 'Subject cannot end with "/"'
        : T extends `${string}//${string}` ? 'Subject cannot contain empty parts (consecutive slashes)'
          : T extends `${string}/${string}` ? never // Valid case
            : 'Subject must have multiple parts separated by "/" (entity/id or entity/id/event format)'

/**
 * Create a subject from a string
 * The subject must not contain colons or spaces
 * This is to ensure that the subject can be used as a MongoDB collection name.
 * If the subject conatins empty parts, it will throw an error.
 * @param subject The subject string to create the subject from
 * @returns The subject
 * @throws Error if the subject is invalid
 */
export function createSubject<T extends string>(
  subject: ValidSubjectError<T> extends never ? T : ValidSubjectError<T>,
): Subject {
  if (!subject || !SUBJECT_REGEX.test(subject)) {
    throw new InvalidSubjectFormatError(subject)
  }
  return subject as unknown as Subject
}

// Type-level validation for better error messages
type ValidStreamSubjectError<T>
  = T extends '' ? 'StreamSubject cannot be empty'
    : T extends `${string}/${string}/${string}` ? 'StreamSubject must have exactly 2 parts, not 3 or more'
      : T extends `/${string}` ? 'StreamSubject cannot start with "/"'
        : T extends `${string}/` ? 'StreamSubject cannot end with "/"'
          : T extends `${string}//${string}` ? 'StreamSubject cannot contain empty parts (consecutive slashes)'
            : T extends `${string}/${string}` ? never // Valid case
              : 'StreamSubject must have exactly 2 parts separated by "/" (entity/id format)'

/**
 * Create a stream subject from a string
 * The stream subject must be exactly 2 parts separated by '/' (entity/id format)
 * The subject must not contain colons or spaces
 * This is to ensure that the subject can be used as a MongoDB collection name.
 * If the subject conatins empty parts, it will throw an error.
 * @param subject The subject string to create the stream subject from
 * @returns The stream subject
 * @throws Error if the subject is invalid
 */
export function createStreamSubject<T extends string>(
  subject: ValidStreamSubjectError<T> extends never ? T : ValidStreamSubjectError<T>,
): Subject {
  if (!subject || !STREAM_SUBJECT_REGEX.test(subject as string)) {
    throw new InvalidSubjectFormatError(subject as string, 'entity/id (exactly 2 parts separated by "/")')
  }
  return subject as unknown as Subject
}

/**
 * Get the first two parts of a subject
 * @param subject The subject to get the parts from
 * @returns The firt two parts of the subject as a new subject
 * @throws Error if the subject is invalid or does not have a root
 */
export function getStreamSubjectFromSubject(subject: Subject): Subject {
  const parts = subject.split('/')

  // Must have at least entity/id
  if (parts.length < 2) {
    throw new InvalidSubjectFormatError(subject)
  }

  // Return entity/id (first two parts)
  return parts.slice(0, 2).join('/') as Subject
}

/**
 * Get a collection name for a given subject
 * @param subject The subject to get the root from
 * @returns The root part of the subject
 * @throws Error if the subject is invalid or does not have a root
 */
export function getCollectionNameFromSubject(subject: Subject): string {
  const parts = subject.split('/')
  if (parts.length === 0 || !parts[0]) {
    throw new InvalidSubjectFormatError(subject)
  }
  return parts[0]
}
