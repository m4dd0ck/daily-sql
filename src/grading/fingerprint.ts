import { rowKey } from './compare.ts';
import type { ResultSet } from './result.ts';

/** Stored per puzzle so a change in data or reference SQL shows up in the tests. */
export interface Fingerprint {
  rows: number;
  columns: number;
  sha256: string;
}

/**
 * The text a fingerprint hashes: one rowKey per line, sorted unless order is graded.
 *
 * Numbers are rounded to 6 significant digits by rowKey, so a fingerprint survives harmless
 * float noise but not a real change in an answer.
 */
export function canonicalText(result: ResultSet, isOrdered: boolean): string {
  const lines = result.rows.map(rowKey);
  if (!isOrdered) lines.sort();
  return `${result.columns.length}\n${lines.join('\n')}`;
}
