# Vorfall

> Type-safe event sourcing with MongoDB and projections

[![npm version](https://badge.fury.io/js/vorfall.svg)](https://badge.fury.io/js/vorfall)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

A modern, type-safe event sourcing library for Node.js applications using MongoDB as the event store. Built with TypeScript for maximum developer experience and safety.

## Why This Package?

Most event sourcing solutions are either too complex for simple use cases or lack proper TypeScript support. Vorfall bridges this gap by providing:

- **Full TypeScript support** — End-to-end type safety from events to projections
- **MongoDB integration** — Leverages MongoDB's document model
- **Built-in projections** — Create inline read models automatically from events
- **CQRS pattern support** — Helper functions to handle commands and events with type safety

## Installation

```bash
npm install vorfall
# or
pnpm add vorfall
```

## Table of Contents

- [Events](#events)
- [Subjects](#subjects)
- [Event Store](#event-store)
- [Aggregating State](#aggregating-state)
- [Commands & CQRS](#commands--cqrs)
- [Projections](#projections)
- [Utility Functions](#utility-functions)
- [Development Setup](#development-setup)

---

## Events

Events are the core building block. Use `createDomainEvent` to create typed, immutable CloudEvents:

```typescript
import { createDomainEvent, createStreamSubject } from 'vorfall'

type UserRegisteredEvent = DomainEvent<'user.registered', {
  email: string
  name: string
}>

const streamSubject = createStreamSubject('user/abc-123')

const event: UserRegisteredEvent = createDomainEvent({
  type: 'user.registered',
  subject: streamSubject,
  data: { email: 'jane@example.com', name: 'Jane' },
})
```

Events are typed CloudEvents with a mandatory `subject` field. Each event gets a unique `id` and a timestamp automatically.

---

## Subjects

Subjects identify event streams. The format is `entity/id`:

```typescript
import { createStreamSubject } from 'vorfall'

const userSubject = createStreamSubject('user/abc-123')
const orderSubject = createStreamSubject('order/xyz-456')
```

TypeScript enforces the `entity/id` format at compile time — invalid subjects are caught before runtime.

---

## Event Store

Create an event store connected to MongoDB. Pass projection definitions to maintain read models automatically:

```typescript
import { createEventStore, createProjectionDefinition } from 'vorfall'

type UserEvent = UserRegisteredEvent | UserNameUpdatedEvent

const userProfileProjection = createProjectionDefinition({
  name: 'userProfile',
  canHandle: (event): event is UserEvent =>
    ['user.registered', 'user.nameUpdated'].includes(event.type),
  initialState: () => null as UserProfile | null,
  evolve: (state, event) => {
    if (event.type === 'user.registered') {
      return { userId: event.data.userId, email: event.data.email, name: event.data.name }
    }
    if (event.type === 'user.nameUpdated') {
      return { ...state!, name: event.data.name }
    }
    return state
  },
})

const eventStore = await createEventStore({
  mongoUrl: 'mongodb://localhost:27017',
  databaseName: 'myapp',
  projections: [userProfileProjection],
})
```

---

## Aggregating State

Reconstruct the current state of a stream by replaying its events through an `evolve` function:

```typescript
interface UserState {
  email: string
  name: string
  isActive: boolean
}

function evolve(state: UserState, event: UserEvent): UserState {
  if (event.type === 'user.registered') {
    return { email: event.data.email, name: event.data.name, isActive: true }
  }
  if (event.type === 'user.deactivated') {
    return { ...state, isActive: false }
  }
  return state
}

const initialState = (): UserState => ({ email: '', name: '', isActive: false })

const currentState = await eventStore.aggregateStream(
  createStreamSubject('user/abc-123'),
  { evolve, initialState },
)
```

---

## Commands & CQRS

### Creating Commands

Use `createCommand` to produce typed command objects:

```typescript
import { createCommand } from 'vorfall'

type RegisterUserCommand = Command<'RegisterUser', { email: string, name: string }>

const command: RegisterUserCommand = createCommand({
  type: 'RegisterUser',
  data: { email: 'jane@example.com', name: 'Jane' },
})
```

---

### Handling Commands

Define a stream once per aggregate module with `createStreamDefinition`, then reference it by ID at each call site. Pass the same ref to both `streams` and `states.get()` — TypeScript infers the state type automatically:

```typescript
import { createStreamDefinition, handleCommand } from 'vorfall'

// user/stream.ts — defined once per aggregate module
export const userStream = createStreamDefinition('user', { evolve, initialState })

// Single-stream command:
const userRef = { definition: userStream, id: 'abc-123' }

await handleCommand({
  eventStore,
  streams: [userRef],
  command: registerCommand,
  commandHandlerFunction: ({ command, states }) => {
    const state = states.get(userRef) // typed as UserState

    if (state?.isActive) {
      throw new Error('User already registered')
    }

    return createDomainEvent({
      type: 'user.registered',
      subject: createStreamSubject(`user/${command.data.userId}`),
      data: { email: command.data.email, name: command.data.name },
    })
  },
})
```

### Multi-stream commands

When a command must atomically touch multiple aggregates, add multiple refs to `streams`:

```typescript
// streams.ts
export const userStream = createStreamDefinition('user', { evolve: userEvolve, initialState: userInitialState })
export const emailListStream = createStreamDefinition('emailList', { evolve: emailListEvolve, initialState: emailListInitialState })

const userRef = { definition: userStream, id: userId }
const emailListRef = { definition: emailListStream, id: emailListId }

await handleCommand({
  eventStore,
  streams: [userRef, emailListRef],
  command: subscribeCommand,
  commandHandlerFunction: ({ command, states }) => {
    const userState = states.get(userRef) // typed as UserState
    const emailListState = states.get(emailListRef) // typed as EmailListState

    if (emailListState.subscribers.length >= emailListState.maxSubscribers) {
      throw new Error('Email list is full')
    }

    return [
      createDomainEvent({ type: 'user.subscribed', subject: createStreamSubject(`user/${command.data.userId}`), data: { emailListId: command.data.emailListId } }),
      createDomainEvent({ type: 'emailList.subscriptionAdded', subject: createStreamSubject(`emailList/${command.data.emailListId}`), data: { userId: command.data.userId } }),
    ]
  },
})
```

---

## Projections

### Find a single projection

```typescript
import { findOneProjection } from 'vorfall'

const stream = await findOneProjection(
  eventStore,
  createStreamSubject('user/abc-123'),
  { projectionName: 'userProfile' },
)

const profile = stream?.projections.userProfile
// → { userId, email, name } | null
```

Filter within the projection using `projectionQuery`:

```typescript
const stream = await findOneProjection(
  eventStore,
  createStreamSubject('user/abc-123'),
  {
    projectionName: 'userProfile',
    projectionQuery: { isActive: true },
  },
)
```

### Find multiple projections

Query across all streams of an entity type:

```typescript
import { findMultipleProjections } from 'vorfall'

const profiles = await findMultipleProjections(
  eventStore,
  'user', // entity name (first segment of the subject)
  {
    projectionName: 'userProfile',
    projectionQuery: { isActive: true },
  },
  { skip: 0, limit: 20, sort: { name: 1 } },
)
```

### Count projections

```typescript
import { countProjections } from 'vorfall'

const total = await countProjections(
  eventStore,
  'user',
  { projectionName: 'userProfile', projectionQuery: { isActive: true } },
)
```

---

## Utility Functions

### `groupEventsByStreamSubject`

Groups a mixed array of events by their stream subject — useful when a command handler returns events for multiple streams:

```typescript
import { groupEventsByStreamSubject } from 'vorfall'

const events = [userEvent, emailListEvent, anotherUserEvent]
const grouped = groupEventsByStreamSubject(events)

const userEvents = grouped.get(userStreamSubject)
const emailListEvents = grouped.get(emailListStreamSubject)
```

### `eventsHaveSameStreamSubject`

Guards against accidentally mixing events from different streams:

```typescript
import { eventsHaveSameStreamSubject } from 'vorfall'

if (!eventsHaveSameStreamSubject(events)) {
  throw new Error('All events must belong to the same stream')
}
```

### `createEventStream`

Wraps a list of events into an `EventStream` object — primarily useful in tests:

```typescript
import { createEventStream } from 'vorfall'

const stream = createEventStream([event1, event2])
// → { streamId, streamSubject, events, metadata, projections }
```

---

## Development Setup

```bash
# Clone and install
git clone https://github.com/lennartzellmer/vorfall.git
cd vorfall
pnpm install

# Run tests
pnpm test

# Lint
pnpm lint

# Build
pnpm build
```

The project uses Vitest with MongoDB Memory Server for integration tests. On first run, MongoDB Memory Server downloads its binary automatically — subsequent runs use the cache.

---

## Contributing

We welcome contributions!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Publishing

This package is automatically published to NPM under the name `vorfall` using GitHub Actions.

### Automatic Publishing

- **On Release**: When you create a new release on GitHub, the package will be automatically published to NPM with the version specified in the release.

### Manual Publishing

You can also manually trigger a publish by going to the "Actions" tab in the GitHub repository and running the "Publish to NPM" workflow. You can specify:

- `patch` - Increments the patch version (1.0.0 → 1.0.1)
- `minor` - Increments the minor version (1.0.0 → 1.1.0)
- `major` - Increments the major version (1.0.0 → 2.0.0)
- Or specify an exact version like `1.2.3`

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Built with ❤️ using TypeScript, MongoDB, and CloudEvents.
