import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./tests/setup-env.ts'],
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 10000,
  },
})
