import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { parse } from 'yaml';

/** Compile puzzles/*.yaml to JSON modules so the browser bundle needs no YAML parser. */
function yamlPuzzles(): Plugin {
  return {
    name: 'daily-sql-yaml',
    transform(code, id) {
      if (!id.endsWith('.yaml')) return null;
      return { code: `export default ${JSON.stringify(parse(code))};`, map: null };
    },
  };
}

export default defineConfig({
  // Reason: relative asset paths work under any GitHub Pages project path (/daily-sql/).
  base: './',
  plugins: [yamlPuzzles()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
