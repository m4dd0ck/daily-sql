/**
 * Run SQL against the committed data, for writing puzzles.
 *
 * Usage: npm run try-sql -- "SELECT ..."   or   npm run try-sql < query.sql
 * Prints the normalized result the grader would see (first 40 rows) and the row count.
 */
import fs from 'node:fs';
import { createTableSql, TABLE_NAMES, type TableName } from '../src/datasets.ts';
import { openDataDb } from '../src/engine/node.ts';
import { runForGrading } from '../src/grading/result.ts';

const sql = process.argv[2] ?? fs.readFileSync(0, 'utf8');
const db = await openDataDb(TABLE_NAMES, (table) => createTableSql(table as TableName));
const started = performance.now();
const result = await runForGrading(db, sql, 40).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
const elapsed = Math.round(performance.now() - started);
console.table(
  result.rows.map((row) => Object.fromEntries(result.columns.map((name, i) => [name, row[i]]))),
);
console.log(`${result.rowCount} rows, ${result.columns.length} columns, ${elapsed} ms`);
console.log(result.columns.map((name, i) => `${name}: ${result.types[i] ?? ''}`).join(', '));
