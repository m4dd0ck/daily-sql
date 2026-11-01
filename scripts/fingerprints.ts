/**
 * Recompute every puzzle's reference answer fingerprint.
 *
 * Usage: npm run fingerprints            show which puzzles changed (exit 1 if any)
 *        npm run fingerprints -- --write  rewrite puzzles/fingerprints.json
 *
 * Run --write after adding a puzzle or refetching data, and read the diff: a changed
 * fingerprint on an existing puzzle means its answer changed.
 */
import fs from 'node:fs';
import { loadPuzzlesFromDisk } from '../src/puzzles/load-node.ts';
import {
  FINGERPRINT_FILE,
  fingerprintOf,
  openAnswerDb,
  readFingerprints,
  referenceResult,
} from '../src/puzzles/answers.ts';
import type { Fingerprint } from '../src/grading/fingerprint.ts';

const shouldWrite = process.argv.includes('--write');
const puzzles = loadPuzzlesFromDisk();
const stored = readFingerprints();
const db = await openAnswerDb();
const computed: Record<string, Fingerprint> = {};
let changed = 0;
for (const puzzle of puzzles) {
  const result = await referenceResult(db, puzzle);
  const fingerprint = fingerprintOf(result, puzzle.grading.isOrdered);
  computed[puzzle.slug] = fingerprint;
  const before = stored[puzzle.slug];
  const status =
    before === undefined ? 'new' : before.sha256 === fingerprint.sha256 ? 'same' : 'CHANGED';
  if (status !== 'same') changed += 1;
  const label = `#${String(puzzle.id).padStart(2)} ${puzzle.slug}`.padEnd(40);
  console.log(`${label} ${String(fingerprint.rows).padStart(4)} rows  ${status}`);
}
if (shouldWrite) {
  fs.writeFileSync(FINGERPRINT_FILE, JSON.stringify(computed, null, 2) + '\n');
  console.log(`wrote ${FINGERPRINT_FILE}`);
} else if (changed > 0) {
  console.log(`${changed} puzzle(s) differ from fingerprints.json; rerun with --write if intended`);
  process.exitCode = 1;
}
