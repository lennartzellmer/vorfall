import type { StreamSubject, Subject } from '../types/index.js'

const STREAM_SUBJECT_REGEX = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/i

export class InvalidSubjectFormatError extends Error {
  constructor(subject: string) {
    super(`Invalid subject format: "${subject}". Expected format: entity/id or entity/id/event`)
    this.name = 'InvalidSubjectFormatError'
  }
}

/**
 * Create a subject from a string
 * The subject must not contain colons or spaces
 * This is to ensure that the subject can be used as a MongoDB collection name.
 * If the subject conatins empty parts, it will throw an error.
 * @param subject The subject string to create the subject from
 * @returns The subject
 * @throws Error if the subject is invalid
 */
export function createSubject(subject: string): Subject {
  if (!subject || !STREAM_SUBJECT_REGEX.test(subject)) {
    throw new InvalidSubjectFormatError(subject)
  }
  return subject as Subject
}

/**
 * Create a subject from a string
 * The subject must not contain colons or spaces
 * This is to ensure that the subject can be used as a MongoDB collection name.
 * If the subject conatins empty parts, it will throw an error.
 * @param subject The subject string to create the subject from
 * @returns The subject
 * @throws Error if the subject is invalid
 */
export function createStreamSubject(subject: string): StreamSubject {
  if (!subject || !STREAM_SUBJECT_REGEX.test(subject)) {
    throw new InvalidSubjectFormatError(subject)
  }
  return subject as StreamSubject
}

/**
 * Get the first two parts of a subject
 * @param subject The subject to get the parts from
 * @returns The firt two parts of the subject as a new subject
 * @throws Error if the subject is invalid or does not have a root
 */
export function getStreamSubjectFromSubject(subject: Subject): StreamSubject {
  const parts = subject.split('/')

  // Must have at least entity/id
  if (parts.length < 2) {
    throw new InvalidSubjectFormatError(subject)
  }

  // Return entity/id (first two parts)
  return parts.slice(0, 2).join('/') as StreamSubject
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
