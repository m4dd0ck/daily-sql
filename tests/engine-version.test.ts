import { expect, it } from 'vitest';
import { NodeDuckDB } from '../src/engine/node.ts';
import { DUCKDB_VERSION } from '../scripts/fetch-extensions.ts';

it('serves extensions built for the DuckDB version inside @duckdb/duckdb-wasm', async () => {
  const db = await NodeDuckDB.create();
  const [row] = await db.query('SELECT version() AS v');
  expect(row?.v).toBe(DUCKDB_VERSION);
});
