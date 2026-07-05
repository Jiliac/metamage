import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Scaffolding for WP1's stats snapshot test. Resolves the `@/` path alias so
// tests can import `@/lib/stats` etc. WP1 may extend `test` config as needed.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
