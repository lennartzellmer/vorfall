# Vorfall

> Type-safe event sourcing with MongoDB and projections

[![npm version](https://badge.fury.io/js/@vorfall%2Feventstore.svg)](https://badge.fury.io/js/@vorfall%2Feventstore)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

A modern, type-safe event sourcing library for Node.js applications using MongoDB as the event store. Built with TypeScript for maximum developer experience and runtime safety.

## Introduction

Vorfall is an event sourcing library that helps you build applications where every change to application state is captured as an event. This approach provides:

- **Complete audit trail** - Every change is recorded with full context
- **Time travel** - Query your application state at any point in time
- **Scalability** - Event streams can be processed independently
- **Debugging** - Replay events to understand how bugs occurred
- **Integration** - Events can trigger side effects in other systems

## Why This Package?

Most event sourcing solutions are either too complex for simple use cases or lack proper TypeScript support. Vorfall bridges this gap by providing:

- 🛡️ **Full TypeScript support** - End-to-end type safety from events to projections
- 🚀 **MongoDB integration** - Leverages MongoDB's document model and indexing
- 📊 **Built-in projections** - Create read models automatically from events
- 🎯 **Simple API** - Easy to understand and integrate
- ⚡ **High performance** - Optimized queries and efficient event processing
- 🧪 **Testing utilities** - Built-in testing helpers with memory server support

## Quick Start

Here's a simple example showing user registration and profile updates:

```typescript
import { createEventStore, createProjectionDefinition } from '@vorfall/eventstore'
import { CloudEvent } from 'cloudevents'

// Define your domain events
interface UserRegistered {
  type: 'UserRegistered'
  data: {
    userId: string
    email: string
    name: string
  }
}

interface UserProfileUpdated {
  type: 'UserProfileUpdated'
  data: {
    userId: string
    name?: string
    email?: string
  }
}

type UserEvent = UserRegistered | UserProfileUpdated

// Create a projection for user profiles
const userProfileProjection = createProjectionDefinition({
  name: 'userProfile',
  canHandle: (event: CloudEvent<UserEvent>): event is CloudEvent<UserEvent> =>
    event.type === 'UserRegistered' || event.type === 'UserProfileUpdated',
  evolve: (state: UserProfile | null, event: CloudEvent<UserEvent>) => {
    switch (event.type) {
      case 'UserRegistered':
        return {
          userId: event.data.userId,
          email: event.data.email,
          name: event.data.name,
          createdAt: event.time!,
          updatedAt: event.time!
        }
      case 'UserProfileUpdated':
        return {
          ...state!,
          ...event.data,
          updatedAt: event.time!
        }
    }
  },
  initialState: () => null
})

// Setup event store
const eventStore = await createEventStore({
  mongoUrl: 'mongodb://localhost:27017',
  databaseName: 'myapp',
  projections: [userProfileProjection]
})

// Handle user registration
async function registerUser(userId: string, email: string, name: string) {
  const event = new CloudEvent({
    type: 'UserRegistered',
    source: 'user-service',
    data: { userId, email, name }
  })

  await eventStore.appendEvent(`user/${userId}`, event)
}

// Query user profile
async function getUserProfile(userId: string) {
  return await findOneProjection(
    eventStore,
    `user/${userId}`,
    { projectionName: 'userProfile' }
  )
}
```

## Installation

```bash
# Using npm
npm install @vorfall/eventstore cloudevents mongodb

# Using pnpm
pnpm add @vorfall/eventstore cloudevents mongodb

# Using yarn
yarn add @vorfall/eventstore cloudevents mongodb
```

## Basic Setup

```typescript
import { createEventStore } from '@vorfall/eventstore'

const eventStore = await createEventStore({
  mongoUrl: 'mongodb://localhost:27017',
  databaseName: 'your-app',
  projections: [] // Add your projections here
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
pnpm test --watch

# Run tests for specific package
pnpm --filter @vorfall/eventstore test
```

## Core Concepts

- **Events** - Immutable facts about what happened in your domain
- **Event Store** - Persistent storage for events, implemented with MongoDB
- **Projections** - Read models built from events, automatically maintained
- **Subjects** - Hierarchical identifiers for event streams (e.g., `user/123`, `order/456/item/789`)
- **Commands** - Operations that may produce events

## Documentation

📚 **[Full Documentation](https://vorfall-docs.example.com)** _(Coming Soon)_

- [Getting Started Guide](https://vorfall-docs.example.com/getting-started)
- [API Reference](https://vorfall-docs.example.com/api)
- [Examples](https://github.com/lennartzellmer/vorfall-examples)
- [Best Practices](https://vorfall-docs.example.com/best-practices)

## Contributing

We welcome contributions!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Built with ❤️ using TypeScript, MongoDB, and CloudEvents.
