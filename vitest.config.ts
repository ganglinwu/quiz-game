import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Unit tests run in Node (not the Expo/RN runtime), so the only native module we
// touch — expo-sqlite — is aliased to a better-sqlite3-backed shim that opens the
// real bundled assets/quiz.db read-only. This lets the data-access layer's query
// logic be tested against the genuine data. `*.vitest.ts` is the unit-test suffix
// (vitest only); jest-expo smoke tests use the default `*.test.tsx` suffix, so the
// two runners never pick up each other's files.
export default defineConfig({
  test: {
    include: ['**/*.vitest.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      'expo-sqlite': fileURLToPath(
        new URL('./test/expo-sqlite.mock.ts', import.meta.url),
      ),
    },
  },
});
