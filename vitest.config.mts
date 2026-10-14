import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { '@': root },
  },
  esbuild: {
    // Components are plain JSX — the automatic runtime keeps them React-scope free.
    jsx: 'automatic',
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.{ts,tsx}', 'components/**/*.test.{js,jsx}'],
  },
});
