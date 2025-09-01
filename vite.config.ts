import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',

    include: [
      'packages/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'packages/**/__tests__/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
    ],

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

    setupFiles: [],

    reporters: ['verbose'],
  },

  esbuild: {
    target: 'esnext',
  },

  optimizeDeps: {
    exclude: ['mongodb', 'cloudevents'],
  },
})
