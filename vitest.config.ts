import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// @group Configuration : Backend regression tests with isolated Kafka doubles
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 15000,
  },
});
