import * as duckdb from '@duckdb/duckdb-wasm';
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import { createTableSql, type TableName } from '../datasets.ts';
import type { RawRow, SqlRunner } from './runner.ts';

// Reason: self-hosted bundles (copied into the build by Vite) so the page makes no
// third-party request; selectBundle picks the exception-handling build where supported.
const BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
  eh: { mainModule: ehWasm, mainWorker: ehWorker },
};

/** The visitor's query ran past the time limit and the engine was restarted. */
export class QueryTimeoutError extends Error {
  override name = 'QueryTimeoutError';
}

interface Engine {
  db: duckdb.AsyncDuckDB;
  conn: duckdb.AsyncDuckDBConnection;
  worker: Worker;
}

/**
 * DuckDB-WASM in a Web Worker, with tables loaded on first use and a hard time limit.
 *
 * A query cannot be interrupted from outside once DuckDB is busy, so on timeout the worker
 * is terminated and a fresh one is started on the next call. Tables are fetched again then,
 * which is cheap because the browser has the Parquet files cached.
 */
export class BrowserDuckDB implements SqlRunner {
  private engine: Promise<Engine> | null = null;
  private readonly loaded = new Map<TableName, Promise<void>>();
  private readonly dataUrl: (table: TableName) => string;
  private readonly timeoutMs: number;
  private readonly extensionRepository: string;

  /**
   * Args:
   *   dataUrl: where a table's Parquet file is served.
   *   extensionRepository: absolute URL of the self-hosted extension folder.
   *   timeoutMs: the time limit for one statement.
   */
  constructor(
    dataUrl: (table: TableName) => string,
    extensionRepository: string,
    timeoutMs: number,
  ) {
    this.dataUrl = dataUrl;
    this.extensionRepository = extensionRepository;
    this.timeoutMs = timeoutMs;
  }

  private start(): Promise<Engine> {
    this.engine ??= (async () => {
      const bundle = await duckdb.selectBundle(BUNDLES);
      if (!bundle.mainWorker) throw new Error('No DuckDB worker bundle for this browser');
      const worker = new Worker(bundle.mainWorker);
      const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      const conn = await db.connect();
      // Reason: the browser build does not link Parquet in. Load it from the copy served with
      // the site (scripts/fetch-extensions.ts), never from extensions.duckdb.org.
      await conn.query('SET autoinstall_known_extensions = false');
      await conn.query('SET autoload_known_extensions = false');
      await conn.query(`SET custom_extension_repository = '${this.extensionRepository}'`);
      await conn.query('LOAD parquet');
      return { db, conn, worker };
    })();
    return this.engine;
  }

  /** Start the engine early, so the first Run does not wait for the download. */
  async warmUp(): Promise<void> {
    await this.start();
  }

  /** Fetch and load the given tables (each only once per engine). */
  async ensureTables(tables: readonly TableName[]): Promise<void> {
    await Promise.all(tables.map((table) => this.loadTable(table)));
  }

  private loadTable(table: TableName): Promise<void> {
    let pending = this.loaded.get(table);
    if (!pending) {
      pending = (async () => {
        const { db, conn } = await this.start();
        const response = await fetch(this.dataUrl(table));
        if (!response.ok) throw new Error(`Could not load ${table}: HTTP ${response.status}`);
        await db.registerFileBuffer(
          `${table}.parquet`,
          new Uint8Array(await response.arrayBuffer()),
        );
        await conn.query(createTableSql(table));
      })();
      pending.catch(() => this.loaded.delete(table));
      this.loaded.set(table, pending);
    }
    return pending;
  }

  /** Column names per loaded table, for editor completion. */
  async columnsByTable(): Promise<Record<string, string[]>> {
    const rows = await this.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'main' " +
        "AND table_name NOT LIKE '\\_\\_%' ESCAPE '\\' ORDER BY table_name, ordinal_position",
    );
    const schema: Record<string, string[]> = {};
    for (const row of rows) {
      const table = String(row.table_name);
      (schema[table] ??= []).push(String(row.column_name));
    }
    return schema;
  }

  async query(sql: string): Promise<RawRow[]> {
    const { conn } = await this.start();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new QueryTimeoutError(`Query stopped after ${this.timeoutMs / 1000} s`));
      }, this.timeoutMs);
    });
    try {
      const table = await Promise.race([conn.query(sql), timeout]);
      return table.toArray().map((row: { toJSON(): RawRow }) => row.toJSON());
    } catch (error) {
      if (error instanceof QueryTimeoutError) await this.restart();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private async restart(): Promise<void> {
    const engine = this.engine;
    this.engine = null;
    this.loaded.clear();
    if (engine) {
      const { db, worker } = await engine;
      worker.terminate();
      void db.terminate().catch(() => undefined);
    }
  }
}
