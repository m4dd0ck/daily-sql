import { describe, expect, it } from 'vitest';
import { normalizationSelect, singleStatement, SqlInputError } from '../src/grading/result.ts';

describe('singleStatement', () => {
  it('strips trailing semicolons and whitespace', () => {
    expect(singleStatement('  SELECT 1;  \n;')).toBe('SELECT 1');
  });

  it('removes line and block comments', () => {
    expect(singleStatement('SELECT 1 -- note; here\n/* also; this */')).toBe('SELECT 1');
  });

  it('keeps semicolons inside strings, identifiers and dollar quotes', () => {
    const sql = `SELECT 'a;b' AS "c;d", $$e;f$$ AS g, 'it''s;'`;
    expect(singleStatement(sql)).toBe(sql);
  });

  it('refuses a second statement', () => {
    expect(() => singleStatement('SELECT 1; DROP TABLE inspections')).toThrow(SqlInputError);
  });

  it('refuses empty input', () => {
    expect(() => singleStatement('  -- nothing\n')).toThrow('Write a query first.');
  });
});

describe('normalizationSelect', () => {
  it('casts numbers to DOUBLE, keeps booleans, casts the rest to text, aliases by position', () => {
    const sql = normalizationSelect(
      't',
      [
        { name: 'n', type: 'DECIMAL(18,3)' },
        { name: 'ok', type: 'BOOLEAN' },
        { name: 'day', type: 'DATE' },
        { name: 'say "hi"', type: 'VARCHAR' },
      ],
      10,
    );
    expect(sql).toBe(
      'SELECT CAST("n" AS DOUBLE) AS c0, "ok" AS c1, CAST("day" AS VARCHAR) AS c2, ' +
        'CAST("say ""hi""" AS VARCHAR) AS c3 FROM t LIMIT 10',
    );
  });
});
