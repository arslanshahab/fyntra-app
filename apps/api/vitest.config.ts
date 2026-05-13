import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./tests/setup-env.ts'],
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 10000,
    // All tests share one Postgres test database via truncateAll(); files must
    // not run concurrently or they truncate each other's data mid-test.
    fileParallelism: false,
    pool: 'forks',
    singleFork: true,
  },
})
