import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    env: { LOG_LEVEL: 'silent', VIAJE_LOG_TO_FILE: 'false' },
    coverage: {
      provider: 'v8',
      include: ['src/normalize/**', 'src/query/**'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
