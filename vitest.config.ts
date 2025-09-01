import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Global test settings
    globals: false, // Prefer explicit imports for better IDE support
    environment: 'node',

    // Test file patterns
    include: [
      'packages/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'packages/**/__tests__/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
    ],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/**/src/**/*.{js,ts}', 'packages/**/*.{js,ts}'],
      exclude: [
        'packages/**/node_modules/**',
        'packages/**/dist/**',
        'packages/**/*.test.{js,ts}',
        'packages/**/*.spec.{js,ts}',
        'packages/**/*.config.{js,ts}',
        'packages/**/*.d.ts',
        'packages/**/*.types.ts',
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },

    // Test timeout
    testTimeout: 10000,

    // Setup files for common test utilities
    setupFiles: [],

    // Reporter configuration
    reporters: ['verbose'],

    // Pool options for better performance in monorepo
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true,
      },
    },
  },

  // TypeScript support
  esbuild: {
    target: 'esnext',
  },
})
