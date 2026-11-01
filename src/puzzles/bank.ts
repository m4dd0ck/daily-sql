import { parseBank, type Puzzle } from './schema.ts';

// Reason: the Vite plugin in vite.config.ts turns each YAML file into JSON at build time, so
// the page ships no YAML parser and a malformed file fails the build, not the visitor.
const modules = import.meta.glob<unknown>('../../puzzles/*.yaml', { eager: true, import: 'default' });

/** Every puzzle in schedule order, validated when the page loads. */
export const PUZZLES: readonly Puzzle[] = parseBank(Object.entries(modules));
