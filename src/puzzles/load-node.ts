import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { parseBank, type Puzzle } from './schema.ts';

/** The puzzles directory at the repo root. */
export const PUZZLE_DIR = path.resolve(import.meta.dirname, '..', '..', 'puzzles');

/** Read and validate every puzzles/*.yaml file (for tests and scripts). */
export function loadPuzzlesFromDisk(directory: string = PUZZLE_DIR): Puzzle[] {
  const files = fs.readdirSync(directory).filter((name) => name.endsWith('.yaml'));
  return parseBank(
    files.map((name) => [name, parse(fs.readFileSync(path.join(directory, name), 'utf8'))] as const),
  );
}
