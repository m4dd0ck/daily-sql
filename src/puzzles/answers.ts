import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createTableSql, TABLE_NAMES, type TableName } from '../datasets.ts';
import { openDataDb, type NodeDuckDB } from '../engine/node.ts';
import { canonicalText, type Fingerprint } from '../grading/fingerprint.ts';
import { runForGrading, type ResultSet } from '../grading/result.ts';
import type { Puzzle } from './schema.ts';
import { PUZZLE_DIR } from './load-node.ts';

/** Reference results larger than this are a puzzle design problem: nobody can compare them. */
export const MAX_REFERENCE_ROWS = 500;

export const FINGERPRINT_FILE = path.join(PUZZLE_DIR, 'fingerprints.json');

/** An engine with every table loaded, for computing reference answers in Node. */
export function openAnswerDb(): Promise<NodeDuckDB> {
  return openDataDb(TABLE_NAMES, (table) => createTableSql(table as TableName));
}

/** Run a puzzle's reference SQL the way the page does. */
export function referenceResult(db: NodeDuckDB, puzzle: Puzzle): Promise<ResultSet> {
  return runForGrading(db, puzzle.referenceSql, MAX_REFERENCE_ROWS + 1);
}

/** The stored fingerprint of a reference result. */
export function fingerprintOf(result: ResultSet, isOrdered: boolean): Fingerprint {
  return {
    rows: result.rowCount,
    columns: result.columns.length,
    sha256: createHash('sha256').update(canonicalText(result, isOrdered)).digest('hex'),
  };
}

/** Fingerprints keyed by puzzle slug, as committed. */
export function readFingerprints(): Record<string, Fingerprint> {
  if (!fs.existsSync(FINGERPRINT_FILE)) return {};
  return JSON.parse(fs.readFileSync(FINGERPRINT_FILE, 'utf8')) as Record<string, Fingerprint>;
}
