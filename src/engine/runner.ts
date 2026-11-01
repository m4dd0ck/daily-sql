/** A row as DuckDB returns it, before normalization. */
export type RawRow = Record<string, unknown>;

/**
 * The one thing grading needs from an engine: run a statement, get rows back.
 *
 * The browser (async worker) and Node (blocking, for tests) both implement it, so the
 * grading pipeline is shared and runs the same engine in both places.
 */
export interface SqlRunner {
  query(sql: string): Promise<RawRow[]>;
}
