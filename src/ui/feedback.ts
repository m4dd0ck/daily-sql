import type { GradeOutcome } from '../grading/compare.ts';
import type { AttemptKind } from '../share.ts';
import { formatRow } from './text.ts';

/** The share-string square an outcome earns. */
export function attemptKindOf(outcome: GradeOutcome): AttemptKind {
  switch (outcome.kind) {
    case 'solved':
      return 'solved';
    case 'values':
      return 'values';
    case 'columns':
    case 'column-names':
    case 'rows':
      return 'shape';
  }
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * One or two sentences telling the visitor what to fix.
 *
 * Args:
 *   outcome: the grader's verdict.
 *   isOrdered: whether the puzzle grades row order (changes how "row N" is meant).
 *   attempts: submissions so far including this one, for the solved message.
 */
export function describeOutcome(
  outcome: GradeOutcome,
  isOrdered: boolean,
  attempts: number,
): string {
  switch (outcome.kind) {
    case 'solved':
      return `Solved in ${plural(attempts, 'attempt')}.`;
    case 'columns':
      return `Expected ${plural(outcome.expected, 'column')}, got ${outcome.actual}.`;
    case 'column-names': {
      const extra = outcome.extra.length > 0 ? ` Not expected: ${outcome.extra.join(', ')}.` : '';
      return `Column names count for this puzzle. Missing: ${outcome.missing.join(', ')}.${extra}`;
    }
    case 'rows':
      return `Right number of columns, but expected ${plural(outcome.expected, 'row')} and got ${outcome.actual}.`;
    case 'values': {
      const where = isOrdered
        ? `Row ${outcome.rowIndex + 1} differs`
        : `Order does not matter here; comparing sorted rows, row ${outcome.rowIndex + 1} differs`;
      const got = outcome.actual ? formatRow(outcome.actual) : 'nothing';
      return `Right shape, wrong values. ${where}: expected ${formatRow(outcome.expected)}, got ${got}.`;
    }
  }
}
