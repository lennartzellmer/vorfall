import { resolve } from 'node:path'
import dts from 'vite-plugin-dts'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      outDir: 'dist',
      exclude: ['**/*.test.ts', 'vite.config.ts'],
      rollupTypes: true,
    }),
  ],
  build: {
    target: 'node18',
    lib: {
      entry: resolve(__dirname, 'index.ts'),
      name: 'Vorfall',
      fileName: 'index',
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['mongodb', 'cloudevents', 'node:crypto'],
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
