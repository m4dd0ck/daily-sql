import { beforeAll, describe, expect, it } from 'vitest';
import type { NodeDuckDB } from '../src/engine/node.ts';
import { grade } from '../src/grading/compare.ts';
import type { ResultSet } from '../src/grading/result.ts';
import {
  fingerprintOf,
  MAX_REFERENCE_ROWS,
  openAnswerDb,
  readFingerprints,
  referenceResult,
} from '../src/puzzles/answers.ts';
import { loadPuzzlesFromDisk } from '../src/puzzles/load-node.ts';

// Runs every reference query on the committed Parquet with DuckDB-WASM, the engine the page
// uses. A failure here means the data or a reference query changed; see RUNBOOK.md.
const puzzles = loadPuzzlesFromDisk();
const fingerprints = readFingerprints();
let db: NodeDuckDB;
const results = new Map<string, ResultSet>();

beforeAll(async () => {
  db = await openAnswerDb();
  for (const puzzle of puzzles) results.set(puzzle.slug, await referenceResult(db, puzzle));
});

describe.each(puzzles.map((p) => [`#${p.id} ${p.slug}`, p] as const))('%s', (_, puzzle) => {
  const result = (): ResultSet => {
    const found = results.get(puzzle.slug);
    if (!found) throw new Error(`no result for ${puzzle.slug}`);
    return found;
  };

  it('returns rows, but not too many to compare', () => {
    expect(result().rowCount).toBeGreaterThan(0);
    expect(result().rowCount).toBeLessThanOrEqual(MAX_REFERENCE_ROWS);
  });

  it('matches its stored fingerprint', () => {
    expect(fingerprintOf(result(), puzzle.grading.isOrdered)).toEqual(fingerprints[puzzle.slug]);
  });

  it('grades as solved against itself', () => {
    expect(grade(result(), result(), puzzle.grading)).toEqual({ kind: 'solved' });
  });
});

it('has no stale fingerprints for puzzles that no longer exist', () => {
  expect(Object.keys(fingerprints).sort()).toEqual(puzzles.map((p) => p.slug).sort());
});
