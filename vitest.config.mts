import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { '@': root },
  },
  oxc: {
    // Vite 8 / Vitest 5 use Oxc; keep JSX on React's automatic runtime.
    jsx: { runtime: 'automatic' },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.{ts,tsx}', 'components/**/*.test.{js,jsx}', 'app/**/*.test.{ts,tsx,js,jsx}'],
  },
});
