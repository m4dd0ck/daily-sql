import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import type * as DuckdbBlocking from '@duckdb/duckdb-wasm/blocking';
import type { RawRow, SqlRunner } from './runner.ts';

const require = createRequire(import.meta.url);
// Reason: the blocking build is CommonJS only; createRequire keeps this file runnable by plain Node.
const duckdb = require('@duckdb/duckdb-wasm/blocking') as typeof DuckdbBlocking;

/** DuckDB-WASM running synchronously inside Node: the same engine the page uses. */
export class NodeDuckDB implements SqlRunner {
  private readonly db: DuckdbBlocking.DuckDBBindings;
  private readonly conn: DuckdbBlocking.DuckDBConnection;

  private constructor(db: DuckdbBlocking.DuckDBBindings) {
    this.db = db;
    this.conn = db.connect();
  }

  /** Instantiate the engine from the installed package's wasm files. */
  static async create(): Promise<NodeDuckDB> {
    const dist = path.dirname(require.resolve('@duckdb/duckdb-wasm/dist/duckdb-eh.wasm'));
    const bundles = {
      mvp: {
        mainModule: path.join(dist, 'duckdb-mvp.wasm'),
        mainWorker: path.join(dist, 'duckdb-node-mvp.worker.cjs'),
      },
      eh: {
        mainModule: path.join(dist, 'duckdb-eh.wasm'),
        mainWorker: path.join(dist, 'duckdb-node-eh.worker.cjs'),
      },
    };
    const db = await duckdb.createDuckDB(bundles, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME);
    await db.instantiate(() => undefined);
    return new NodeDuckDB(db);
  }

  /** Make a local file readable from SQL under `name`. */
  registerFile(name: string, filePath: string): void {
    this.db.registerFileBuffer(name, new Uint8Array(fs.readFileSync(filePath)));
  }

  query(sql: string): Promise<RawRow[]> {
    return Promise.resolve(this.querySync(sql));
  }

  /** Run a statement and return plain objects. */
  querySync(sql: string): RawRow[] {
    return this.conn
      .query(sql)
      .toArray()
      .map((row: { toJSON(): RawRow }) => row.toJSON());
  }
}

/** The committed Parquet files, served to the page from the same folder. */
export const DATA_DIR = path.resolve(import.meta.dirname, '..', '..', 'public', 'data');

/**
 * An engine with every table loaded from public/data, the same way the page loads them.
 *
 * Args:
 *   tables: table names to load.
 *   createSql: builds the CREATE TABLE statement for one table.
 */
export async function openDataDb(
  tables: readonly string[],
  createSql: (table: string) => string,
): Promise<NodeDuckDB> {
  const db = await NodeDuckDB.create();
  for (const table of tables) {
    db.registerFile(`${table}.parquet`, path.join(DATA_DIR, `${table}.parquet`));
    db.querySync(createSql(table));
  }
  return db;
}
