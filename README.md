# Vorfall

> Type-safe event sourcing with MongoDB and projections

[![npm version](https://badge.fury.io/js/vorfall.svg)](https://badge.fury.io/js/vorfall)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

A modern, type-safe event sourcing library for Node.js applications using MongoDB as the event store. Events are stored as [CloudEvents](https://cloudevents.io/), grouped into streams by subject, with inline projections maintained on every append.

## Why This Package?

Most event sourcing solutions are either too complex for simple use cases or lack proper TypeScript support. Vorfall bridges this gap by providing:

- **Full TypeScript support** - End-to-end type safety from events to projections
- **MongoDB integration** - Leverages MongoDB's document model
- **Built-in projections** - Create inline read models automatically from events
- **CQRS pattern support** - Helper functions to handle commands and events with type safety

## Requirements

- Node.js >= 20 (the package is ESM-only)
- MongoDB running as a **replica set** — appends use multi-document transactions, which are not available on standalone servers

## Quick Start

```typescript
import type { DomainEvent, Subject } from 'vorfall'
import {
  createDomainEvent,
  createEventStore,
  createProjectionDefinition,
  createSubject,
  findOneProjection,
} from 'vorfall'

// Define your domain events
type UserRegistered = DomainEvent<
  'user.registered',
  { userId: string, email: string, name: string },
  undefined,
  Subject<'user'>
>

type UserProfileUpdated = DomainEvent<
  'user.profileUpdated',
  { userId: string, name?: string, email?: string },
  undefined,
  Subject<'user'>
>

type UserEvent = UserRegistered | UserProfileUpdated

interface UserProfile {
  userId: string
  email: string
  name: string
}

// Create a projection for user profiles.
// canHandle is a list of event types; evolve only ever receives those.
// Returning null deletes the projection from the stream document.
const userProfileProjection = createProjectionDefinition({
  name: 'userProfile',
  canHandle: ['user.registered', 'user.profileUpdated'],
  evolve: (state: UserProfile | null, event: UserEvent): UserProfile | null => {
    switch (event.type) {
      case 'user.registered':
        return { ...event.data }
      case 'user.profileUpdated': {
        if (!state)
          return state
        const { userId, ...changes } = event.data
        return { ...state, ...changes }
      }
    }
  },
  initialState: () => null,
})

// Setup event store (synchronous — the connection is established lazily)
const eventStore = createEventStore({
  connectionString: 'mongodb://localhost:27017',
  databaseName: 'myapp',
  projections: [userProfileProjection],
})

// Append events. The stream is derived from the event subject:
// "user/123/registered" belongs to the stream "user/123" in collection "user".
async function registerUser(userId: string, email: string, name: string) {
  const event = createDomainEvent({
    type: 'user.registered' as const,
    subject: createSubject(`user/${userId}/registered`),
    data: { userId, email, name },
  })

  await eventStore.appendOrCreateStream([event])
}

// Query the projection maintained for a stream
async function getUserProfile(userId: string) {
  const stream = await findOneProjection(
    eventStore,
    createSubject(`user/${userId}`),
    { projectionName: 'userProfile' },
  )
  return stream?.projections.userProfile ?? null
}

// Or rebuild state directly from the events
async function getUserState(userId: string) {
  const { state, version, streamExists } = await eventStore.aggregateStream<UserProfile | null, UserEvent>(
    createSubject(`user/${userId}`),
    {
      initialState: () => null,
      evolve: (state, event) => userProfileProjection.evolve(state, event),
    },
  )
  return state
}
```

## Optimistic Concurrency Control

Every stream document carries a `version` (the number of events in the stream). `aggregateStream` and `getEventStreamBySubject` return the version seen at read time; pass it back on append to make the write fail if the stream changed in between:

```typescript
import { ConcurrencyError } from 'vorfall'

const { state, version } = await eventStore.aggregateStream(streamSubject, { evolve, initialState })

try {
  await eventStore.appendOrCreateStream([event], {
    expectedVersions: new Map([[streamSubject, version]]),
  })
}
catch (error) {
  if (error instanceof ConcurrencyError) {
    // Someone else appended first: error.expectedVersion vs. error.actualVersion.
    // Re-read, re-decide, retry — or surface e.g. HTTP 409.
  }
  throw error
}
```

Expected versions per stream subject can be a number (exact event count, `0` means the stream must not exist yet), `'no-stream'` (append must create the stream) or `'any'` (no check — the default for streams not listed). On a mismatch the whole append is rolled back, including all other streams in the same call.

`handleCommand` wires this automatically: the versions observed while aggregating the configured streams are enforced on append, so a concurrent command on the same stream fails with a `ConcurrencyError` instead of silently interleaving.

## Installation

```bash
# Using npm
npm install vorfall

# Using pnpm
pnpm add vorfall

# Using yarn
yarn add vorfall
```

## Core Concepts

- **Events** - Immutable facts about what happened in your domain, stored as CloudEvents (`createDomainEvent`)
- **Subjects** - Hierarchical identifiers in the form `entity/id[/...]` (e.g. `user/123`, `user/123/registered`). The first segment is the MongoDB collection, the first two segments identify the stream (`createSubject`, `createStreamSubject`)
- **Event Store** - One document per stream, holding its events and projection states (`createEventStore`, `appendOrCreateStream`, `getEventStreamBySubject`, `aggregateStream`)
- **Projections** - Read models folded from events and persisted on the stream document on every append (`createProjectionDefinition`, `findOneProjection`, `findMultipleProjections`, `countProjections`)
- **Commands** - Operations that may produce events (`createCommand`, `handleCommand`)

## CQRS Pattern Support

`handleCommand` aggregates the current state of one or more streams, runs your command handler to produce new events, and appends them:

```typescript
import { createCommand, handleCommand } from 'vorfall'

const command = createCommand({
  type: 'registerUser',
  data: { userId: '123', email: 'alice@example.com', name: 'Alice' },
})

await handleCommand({
  eventStore,
  command,
  streams: [
    {
      streamSubject: createSubject('user/123'),
      initialState: () => null,
      evolve: (state: UserProfile | null, event: UserEvent) => state, // fold events into state
    },
  ],
  commandHandlerFunction: ({ command, states }) => {
    // Decide based on current state, return the event(s) to append
    return createDomainEvent({
      type: 'user.registered' as const,
      subject: createSubject(`user/${command.data.userId}/registered`),
      data: command.data,
    })
  },
})
```

## Development Setup

To contribute to this project:

```bash
# Clone the repository
git clone https://github.com/lennartzellmer/vorfall.git
cd vorfall

# Install dependencies
pnpm install

# Run tests
pnpm test

# Run linting
pnpm lint

# Build packages
pnpm build
```

### Running Tests

The project uses Vitest for testing with MongoDB Memory Server for integration tests:

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests for the eventstore package only
pnpm --filter vorfall test
```

## Contributing

We welcome contributions!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Publishing

Releases are managed with [Changesets](https://github.com/changesets/changesets). Every user-facing change ships with a changeset; `pnpm release` versions the packages, and the "Publish Package to npmjs" GitHub Actions workflow publishes to npm on a GitHub release (or via manual dispatch).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Built with ❤️ using TypeScript, MongoDB, and CloudEvents.
