import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'index.ts'),
      name: 'VorfallEventStore',
      fileName: 'vorfall-eventstore',
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['mongodb', 'cloudevents'],
      output: {
        globals: {
          mongodb: 'MongoDB',
          cloudevents: 'CloudEvents',
        },
      },
    },
    outDir: 'dist',
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
