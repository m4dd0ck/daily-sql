import type { RawRow, SqlRunner } from '../engine/runner.ts';

/** One normalized value: what every DuckDB type is reduced to before grading. */
export type Cell = number | string | boolean | null;

/** A query result reduced to primitives, ready to grade or display. */
export interface ResultSet {
  columns: string[];
  types: string[];
  rows: Cell[][];
  rowCount: number;
  isTruncated: boolean;
}

/** The visitor's SQL was rejected before it reached DuckDB. */
export class SqlInputError extends Error {
  override name = 'SqlInputError';
}

const RESULT_TABLE = '__daily_sql_result';
const NUMERIC_TYPE =
  /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT|FLOAT|REAL|DOUBLE|DECIMAL(\(\d+,\s*\d+\))?)$/i;
const NON_QUERY_STATEMENT = /^(describe|summarize|show)\b/i;

/**
 * Strip comments and trailing semicolons, and refuse more than one statement.
 *
 * DuckDB runs every statement in a multi-statement string and returns the last result, so a
 * second statement would run unseen. The scanner skips quoted strings, quoted identifiers,
 * dollar-quoted strings and comments so a ';' inside them is not counted.
 *
 * Args:
 *   sql: the text from the editor.
 *
 * Returns:
 *   The single statement, trimmed, with no trailing semicolon.
 *
 * Raises:
 *   SqlInputError: the text is empty or holds more than one statement.
 */
export function singleStatement(sql: string): string {
  let output = '';
  let index = 0;
  let sawTerminator = false;
  while (index < sql.length) {
    const char = sql[index] ?? '';
    const next = sql[index + 1] ?? '';
    let chunk: string;
    if (char === '-' && next === '-') {
      const end = sql.indexOf('\n', index);
      index = end === -1 ? sql.length : end;
      chunk = ' ';
    } else if (char === '/' && next === '*') {
      const end = sql.indexOf('*/', index + 2);
      index = end === -1 ? sql.length : end + 2;
      chunk = ' ';
    } else if (char === "'" || char === '"') {
      const end = closingQuote(sql, index, char);
      chunk = sql.slice(index, end);
      index = end;
    } else if (char === '$' && next === '$') {
      const end = sql.indexOf('$$', index + 2);
      const stop = end === -1 ? sql.length : end + 2;
      chunk = sql.slice(index, stop);
      index = stop;
    } else {
      chunk = char;
      index += 1;
    }
    if (chunk === ';') {
      sawTerminator = true;
      continue;
    }
    if (sawTerminator && chunk.trim() !== '') {
      throw new SqlInputError(
        'Run one statement at a time: remove everything after the first ";".',
      );
    }
    output += chunk;
  }
  const statement = output.trim();
  if (statement === '') throw new SqlInputError('Write a query first.');
  return statement;
}

function closingQuote(sql: string, start: number, quote: string): number {
  let index = start + 1;
  while (index < sql.length) {
    if (sql[index] === quote) {
      if (sql[index + 1] === quote) {
        index += 2;
        continue;
      }
      return index + 1;
    }
    index += 1;
  }
  return sql.length;
}

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/**
 * The SELECT that reads the stored result back as primitives.
 *
 * Numbers of every width become DOUBLE (so 3, 3.0 and DECIMAL 3.00 compare equal), BOOLEAN
 * stays, and everything else is cast to text: dates as YYYY-MM-DD, timestamps as
 * YYYY-MM-DD HH:MM:SS. Columns are aliased by position because a result may repeat a name.
 */
export function normalizationSelect(
  table: string,
  columns: readonly { name: string; type: string }[],
  rowLimit: number,
): string {
  const list = columns.map(({ name, type }, position) => {
    const column = quoteIdentifier(name);
    const alias = `c${position}`;
    if (NUMERIC_TYPE.test(type)) return `CAST(${column} AS DOUBLE) AS ${alias}`;
    if (type.toUpperCase() === 'BOOLEAN') return `${column} AS ${alias}`;
    return `CAST(${column} AS VARCHAR) AS ${alias}`;
  });
  return `SELECT ${list.join(', ')} FROM ${table} LIMIT ${rowLimit}`;
}

function toCell(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') return Number(value);
  // Reason: normalizationSelect casts every column to DOUBLE, BOOLEAN or VARCHAR, so anything
  // else means that contract broke; fail loudly rather than grade "[object Object]".
  throw new Error(`Unexpected ${typeof value} in a normalized result`);
}

function rowToCells(row: RawRow, width: number): Cell[] {
  return Array.from({ length: width }, (_, position) => toCell(row[`c${position}`]));
}

/**
 * Run one statement and return its result normalized for grading.
 *
 * The statement is stored with CREATE TEMP TABLE AS, which also refuses anything that is not
 * a query (DROP, INSERT, ...). DuckDB keeps insertion order, so ORDER BY survives the copy.
 *
 * Args:
 *   runner: the engine.
 *   sql: the visitor's text.
 *   rowLimit: how many rows to read back; rowCount still reports the full size.
 *
 * Returns:
 *   The normalized result.
 *
 * Raises:
 *   SqlInputError: from singleStatement.
 *   Error: whatever DuckDB raises for the query itself.
 */
export async function runForGrading(
  runner: SqlRunner,
  sql: string,
  rowLimit: number,
): Promise<ResultSet> {
  const statement = singleStatement(sql);
  const body = NON_QUERY_STATEMENT.test(statement) ? `SELECT * FROM (${statement})` : statement;
  await runner.query(`CREATE OR REPLACE TEMP TABLE ${RESULT_TABLE} AS ${body}\n`);
  try {
    const described = await runner.query(`DESCRIBE ${RESULT_TABLE}`);
    const columns = described.map((row) => ({
      name: String(row.column_name),
      type: String(row.column_type),
    }));
    const [countRow] = await runner.query(`SELECT count(*) AS n FROM ${RESULT_TABLE}`);
    const rowCount = Number(countRow?.n ?? 0);
    const rows = await runner.query(normalizationSelect(RESULT_TABLE, columns, rowLimit));
    return {
      columns: columns.map((column) => column.name),
      types: columns.map((column) => column.type),
      rows: rows.map((row) => rowToCells(row, columns.length)),
      rowCount,
      isTruncated: rowCount > rows.length,
    };
  } finally {
    await runner.query(`DROP TABLE IF EXISTS ${RESULT_TABLE}`);
  }
}
