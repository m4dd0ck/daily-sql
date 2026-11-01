import type { Cell, ResultSet } from './result.ts';

/** How a puzzle's answer is compared. */
export interface GradingRules {
  isOrdered: boolean;
  tolerance: number;
  columnNames: 'ignore' | 'match';
}

/** The first problem found, or solved. */
export type GradeOutcome =
  | { kind: 'solved' }
  | { kind: 'columns'; expected: number; actual: number }
  | { kind: 'column-names'; missing: string[]; extra: string[] }
  | { kind: 'rows'; expected: number; actual: number }
  | { kind: 'values'; rowIndex: number; expected: Cell[]; actual: Cell[] | null };

const MIDNIGHT = /^(\d{4}-\d{2}-\d{2})[ T]00:00:00(\.0+)?$/;
// Reason: unordered grading pairs rows greedily when sorted keys disagree; quadratic, so capped.
const GREEDY_MATCH_LIMIT = 3000;

/** Reduce a cell to the form both sides are compared in. */
export function normalizeCell(cell: Cell): Cell {
  if (typeof cell === 'string') {
    const midnight = MIDNIGHT.exec(cell);
    return midnight?.[1] ?? cell;
  }
  if (typeof cell === 'number' && Object.is(cell, -0)) return 0;
  return cell;
}

// Reason: float sums differ in the last bits with evaluation order; this absorbs that on large
// values without loosening the puzzle's own (absolute) tolerance.
const RELATIVE_FLOAT_NOISE = 1e-9;

/** True when two cells hold the same value; numbers match within the absolute tolerance. */
export function cellsEqual(left: Cell, right: Cell, tolerance: number): boolean {
  const a = normalizeCell(left);
  const b = normalizeCell(right);
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) && Number.isNaN(b);
    if (a === b) return true;
    const difference = Math.abs(a - b);
    return (
      difference <= tolerance ||
      difference <= RELATIVE_FLOAT_NOISE * Math.max(Math.abs(a), Math.abs(b))
    );
  }
  return a === b;
}

function rowsEqual(left: readonly Cell[], right: readonly Cell[], tolerance: number): boolean {
  return (
    left.length === right.length &&
    left.every((cell, i) => cellsEqual(cell, right[i] ?? null, tolerance))
  );
}

/** A sortable text key for a row: numbers to 6 significant digits so near-equal floats sort together. */
export function rowKey(row: readonly Cell[]): string {
  return JSON.stringify(
    row.map((cell) => {
      const value = normalizeCell(cell);
      return typeof value === 'number' && Number.isFinite(value)
        ? Number(value.toPrecision(6))
        : value;
    }),
  );
}

function sortedRows(rows: readonly Cell[][]): Cell[][] {
  return rows
    .map((row) => ({ row, key: rowKey(row) }))
    .sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0))
    .map(({ row }) => row);
}

function compareColumnNames(
  expected: readonly string[],
  actual: readonly string[],
): { outcome: GradeOutcome | null; order: number[] } {
  const wanted = expected.map((name) => name.toLowerCase());
  const given = actual.map((name) => name.toLowerCase());
  const used = new Set<number>();
  const order: number[] = [];
  const missing: string[] = [];
  wanted.forEach((name, i) => {
    const position = given.findIndex((candidate, j) => candidate === name && !used.has(j));
    if (position === -1) {
      missing.push(expected[i] ?? name);
    } else {
      used.add(position);
      order.push(position);
    }
  });
  if (missing.length === 0) return { outcome: null, order };
  const extra = actual.filter((_, j) => !used.has(j));
  return { outcome: { kind: 'column-names', missing, extra }, order };
}

function firstUnorderedDifference(
  expected: readonly Cell[][],
  actual: readonly Cell[][],
  tolerance: number,
): GradeOutcome {
  const left = sortedRows(expected);
  const right = sortedRows(actual);
  const pairwise = left.findIndex((row, i) => !rowsEqual(row, right[i] ?? [], tolerance));
  if (pairwise === -1) return { kind: 'solved' };
  if (left.length > GREEDY_MATCH_LIMIT) {
    return {
      kind: 'values',
      rowIndex: pairwise,
      expected: left[pairwise] ?? [],
      actual: right[pairwise] ?? null,
    };
  }
  const unused = new Set(right.map((_, i) => i));
  for (const [i, row] of left.entries()) {
    const match = [...unused].find((j) => rowsEqual(row, right[j] ?? [], tolerance));
    if (match === undefined) {
      return { kind: 'values', rowIndex: i, expected: row, actual: right[i] ?? null };
    }
    unused.delete(match);
  }
  return { kind: 'solved' };
}

/**
 * Grade a result against the reference by value.
 *
 * Checks run cheapest first and the first failure is returned, so the feedback names one
 * concrete thing to fix: column count, column names (when the puzzle asks for them), row
 * count, then the first row that differs. With isOrdered false both sides are sorted first.
 *
 * Args:
 *   expected: the reference result (must not be truncated).
 *   actual: the visitor's result, read back with at least expected.rowCount + 1 rows.
 *   rules: the puzzle's grading rules.
 *
 * Returns:
 *   The first problem found, or { kind: 'solved' }.
 */
export function grade(expected: ResultSet, actual: ResultSet, rules: GradingRules): GradeOutcome {
  if (expected.columns.length !== actual.columns.length) {
    return { kind: 'columns', expected: expected.columns.length, actual: actual.columns.length };
  }
  let actualRows = actual.rows;
  if (rules.columnNames === 'match') {
    const { outcome, order } = compareColumnNames(expected.columns, actual.columns);
    if (outcome) return outcome;
    actualRows = actual.rows.map((row) => order.map((position) => row[position] ?? null));
  }
  if (expected.rowCount !== actual.rowCount) {
    return { kind: 'rows', expected: expected.rowCount, actual: actual.rowCount };
  }
  if (!rules.isOrdered) return firstUnorderedDifference(expected.rows, actualRows, rules.tolerance);
  const index = expected.rows.findIndex(
    (row, i) => !rowsEqual(row, actualRows[i] ?? [], rules.tolerance),
  );
  if (index === -1) return { kind: 'solved' };
  return {
    kind: 'values',
    rowIndex: index,
    expected: expected.rows[index] ?? [],
    actual: actualRows[index] ?? null,
  };
}
