import { describe, expect, it } from 'vitest';
import { cellsEqual, grade, normalizeCell, type GradingRules } from '../src/grading/compare.ts';
import type { Cell, ResultSet } from '../src/grading/result.ts';

function result(columns: string[], rows: Cell[][]): ResultSet {
  return {
    columns,
    types: columns.map(() => 'VARCHAR'),
    rows,
    rowCount: rows.length,
    isTruncated: false,
  };
}

const unordered: GradingRules = { isOrdered: false, tolerance: 1e-6, columnNames: 'ignore' };
const ordered: GradingRules = { ...unordered, isOrdered: true };

describe('cellsEqual', () => {
  it('treats two NULLs as equal and NULL as different from a value', () => {
    expect(cellsEqual(null, null, 0)).toBe(true);
    expect(cellsEqual(null, 0, 0)).toBe(false);
    expect(cellsEqual('', null, 0)).toBe(false);
  });

  it('accepts numbers within an absolute tolerance', () => {
    expect(cellsEqual(17.6, 17.604, 0.006)).toBe(true);
    expect(cellsEqual(17.6, 17.61, 0.006)).toBe(false);
  });

  it('absorbs float noise on large numbers', () => {
    expect(cellsEqual(26966016991166, 26966016991166 * (1 + 1e-12), 1e-6)).toBe(true);
    expect(cellsEqual(26966016991166, 26966016991166 * (1 + 1e-6), 1e-6)).toBe(false);
  });

  it('treats the tolerance as absolute, so it is no looser on large values', () => {
    expect(cellsEqual(1000, 1000.1, 0.051)).toBe(false);
  });

  it('treats NaN as equal only to NaN', () => {
    expect(cellsEqual(Number.NaN, Number.NaN, 0)).toBe(true);
    expect(cellsEqual(Number.NaN, 1, 0)).toBe(false);
  });

  it('does not equate a number with its text', () => {
    expect(cellsEqual(12, '12', 0)).toBe(false);
  });

  it('compares text case-sensitively', () => {
    expect(cellsEqual('Brooklyn', 'BROOKLYN', 0)).toBe(false);
  });
});

describe('normalizeCell', () => {
  it('reads a midnight timestamp as its date', () => {
    expect(normalizeCell('2024-01-15 00:00:00')).toBe('2024-01-15');
    expect(normalizeCell('2024-01-15 00:00:00.000')).toBe('2024-01-15');
  });

  it('keeps a timestamp with a time of day', () => {
    expect(normalizeCell('2024-01-15 10:30:00')).toBe('2024-01-15 10:30:00');
  });

  it('turns negative zero into zero', () => {
    expect(Object.is(normalizeCell(-0), 0)).toBe(true);
  });
});

describe('grade', () => {
  const expected = result(
    ['boro', 'n'],
    [
      ['Bronx', 1],
      ['Queens', 2],
    ],
  );

  it('solves an identical result', () => {
    expect(grade(expected, expected, ordered)).toEqual({ kind: 'solved' });
  });

  it('reports a column count mismatch first', () => {
    const actual = result(['boro'], [['Bronx'], ['Queens']]);
    expect(grade(expected, actual, unordered)).toEqual({ kind: 'columns', expected: 2, actual: 1 });
  });

  it('reports a row count mismatch', () => {
    const actual = result(['boro', 'n'], [['Bronx', 1]]);
    expect(grade(expected, actual, unordered)).toEqual({ kind: 'rows', expected: 2, actual: 1 });
  });

  it('ignores row order when the puzzle does', () => {
    const actual = result(
      ['b', 'c'],
      [
        ['Queens', 2],
        ['Bronx', 1],
      ],
    );
    expect(grade(expected, actual, unordered)).toEqual({ kind: 'solved' });
  });

  it('reports the first differing row when order matters', () => {
    const actual = result(
      ['b', 'c'],
      [
        ['Queens', 2],
        ['Bronx', 1],
      ],
    );
    expect(grade(expected, actual, ordered)).toEqual({
      kind: 'values',
      rowIndex: 0,
      expected: ['Bronx', 1],
      actual: ['Queens', 2],
    });
  });

  it('reports a wrong value in an unordered result', () => {
    const actual = result(
      ['b', 'c'],
      [
        ['Queens', 2],
        ['Bronx', 5],
      ],
    );
    const outcome = grade(expected, actual, unordered);
    expect(outcome).toMatchObject({ kind: 'values', expected: ['Bronx', 1] });
  });

  it('pairs near-equal floats that sort differently once rounded', () => {
    // 1.0000049 rounds to 1 and 1.0000051 to 1.00001, so the sorted orders disagree.
    const left = result(
      ['x', 'y'],
      [
        [1.0000049, 'z'],
        [1.0000051, 'a'],
      ],
    );
    const right = result(
      ['x', 'y'],
      [
        [1.0000051, 'z'],
        [1.0000049, 'a'],
      ],
    );
    expect(grade(left, right, { ...unordered, tolerance: 0.001 })).toEqual({ kind: 'solved' });
  });

  it('counts duplicate rows: two copies do not match one copy plus another row', () => {
    const left = result(['x'], [['a'], ['a']]);
    const right = result(['x'], [['a'], ['b']]);
    expect(grade(left, right, unordered).kind).toBe('values');
  });

  describe('with column names matched', () => {
    const rules: GradingRules = { ...unordered, columnNames: 'match' };

    it('accepts the right names in any order and any case', () => {
      const actual = result(
        ['N', 'Boro'],
        [
          [1, 'Bronx'],
          [2, 'Queens'],
        ],
      );
      expect(grade(expected, actual, rules)).toEqual({ kind: 'solved' });
    });

    it('names missing and extra columns', () => {
      const actual = result(
        ['boro', 'count'],
        [
          ['Bronx', 1],
          ['Queens', 2],
        ],
      );
      expect(grade(expected, actual, rules)).toEqual({
        kind: 'column-names',
        missing: ['n'],
        extra: ['count'],
      });
    });
  });
});
