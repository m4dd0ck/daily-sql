import { beforeAll, describe, expect, it } from 'vitest';
import { grade } from '../src/grading/compare.ts';
import { runForGrading } from '../src/grading/result.ts';
import type { NodeDuckDB } from '../src/engine/node.ts';
import { openAnswerDb, referenceResult } from '../src/puzzles/answers.ts';
import { loadPuzzlesFromDisk } from '../src/puzzles/load-node.ts';

let db: NodeDuckDB;
beforeAll(async () => {
  db = await openAnswerDb();
});

describe('runForGrading on DuckDB-WASM', () => {
  it('reduces DECIMAL, BIGINT and DOUBLE to the same number', async () => {
    const result = await runForGrading(
      db,
      'SELECT 3.00::DECIMAL(10,2) a, 3::BIGINT b, 3.0::DOUBLE c',
      10,
    );
    expect(result.rows).toEqual([[3, 3, 3]]);
  });

  it('reads DATE as text and a midnight TIMESTAMP grades equal to it', async () => {
    const asDate = await runForGrading(db, "SELECT DATE '2024-01-15' d", 10);
    const asTimestamp = await runForGrading(db, "SELECT TIMESTAMP '2024-01-15 00:00:00' d", 10);
    expect(asDate.rows).toEqual([['2024-01-15']]);
    expect(
      grade(asDate, asTimestamp, { isOrdered: true, tolerance: 0, columnNames: 'ignore' }),
    ).toEqual({ kind: 'solved' });
  });

  it('keeps NULL and booleans', async () => {
    const result = await runForGrading(db, 'SELECT NULL::INTEGER a, true b', 10);
    expect(result.rows).toEqual([[null, true]]);
  });

  it('keeps ORDER BY through the stored copy', async () => {
    const result = await runForGrading(db, 'SELECT * FROM range(5) t(i) ORDER BY i DESC', 10);
    expect(result.rows.map((row) => row[0])).toEqual([4, 3, 2, 1, 0]);
  });

  it('handles repeated column names', async () => {
    const result = await runForGrading(db, 'SELECT 1 AS n, 2 AS n', 10);
    expect(result.rows).toEqual([[1, 2]]);
  });

  it('reports the full row count when reading back fewer rows', async () => {
    const result = await runForGrading(db, 'SELECT * FROM range(1000)', 10);
    expect(result).toMatchObject({ rowCount: 1000, isTruncated: true });
    expect(result.rows).toHaveLength(10);
  });

  it('runs DESCRIBE by wrapping it in a SELECT', async () => {
    const result = await runForGrading(db, 'DESCRIBE emissions', 50);
    expect(result.rows.map((row) => row[0])).toContain('co2_per_capita');
  });

  it('refuses statements that change data', async () => {
    await expect(runForGrading(db, 'DROP TABLE emissions', 10)).rejects.toThrow();
    const [row] = await db.query('SELECT count(*) AS n FROM emissions');
    expect(Number(row?.n)).toBeGreaterThan(0);
  });

  it('does not run a hidden second statement', async () => {
    await expect(runForGrading(db, 'SELECT 1; DROP TABLE emissions', 10)).rejects.toThrow(
      'one statement',
    );
    const [row] = await db.query('SELECT count(*) AS n FROM emissions');
    expect(Number(row?.n)).toBeGreaterThan(0);
  });
});

describe('grading real mistakes', () => {
  const bank = loadPuzzlesFromDisk();
  const puzzle = (slug: string) => {
    const found = bank.find((p) => p.slug === slug);
    if (!found) throw new Error(slug);
    return found;
  };

  it('catches the fan-out average as wrong values with the right shape', async () => {
    const target = puzzle('average-score-without-fan-out');
    const expected = await referenceResult(db, target);
    const naive = await runForGrading(
      db,
      "SELECT boro, round(avg(score), 2) FROM inspections WHERE boro <> '0' GROUP BY boro",
      100,
    );
    expect(grade(expected, naive, target.grading).kind).toBe('values');
  });

  it('catches NOT IN over a column with NULLs as a row count mismatch', async () => {
    const target = puzzle('zip-codes-without-restaurants');
    const expected = await referenceResult(db, target);
    const notIn = await runForGrading(
      db,
      'SELECT incident_zip, count(*) FROM service_requests WHERE incident_zip IS NOT NULL ' +
        'AND incident_zip NOT IN (SELECT zipcode FROM inspections) GROUP BY 1',
      100,
    );
    expect(grade(expected, notIn, target.grading)).toMatchObject({ kind: 'rows', actual: 0 });
  });

  it('accepts a different but correct query (NOT IN with the NULLs filtered)', async () => {
    const target = puzzle('zip-codes-without-restaurants');
    const expected = await referenceResult(db, target);
    const fixed = await runForGrading(
      db,
      'SELECT incident_zip AS zip, count(*) AS n FROM service_requests WHERE incident_zip NOT IN ' +
        '(SELECT zipcode FROM inspections WHERE zipcode IS NOT NULL) GROUP BY zip ORDER BY n',
      100,
    );
    expect(grade(expected, fixed, target.grading)).toEqual({ kind: 'solved' });
  });
});
