import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATASETS, TABLE_NAMES } from '../src/datasets.ts';
import { DATA_DIR } from '../src/engine/node.ts';

const MAX_DATA_BYTES = 20 * 1024 * 1024;

describe('committed data', () => {
  it('has a Parquet file for every table', () => {
    for (const table of TABLE_NAMES) {
      expect(fs.existsSync(path.join(DATA_DIR, `${table}.parquet`)), table).toBe(true);
    }
  });

  it('stays under 20 MB in total', () => {
    const total = fs
      .readdirSync(DATA_DIR)
      .reduce((sum, name) => sum + fs.statSync(path.join(DATA_DIR, name)).size, 0);
    expect(total).toBeLessThan(MAX_DATA_BYTES);
  });

  it('records a retrieval date and row count for every table', () => {
    const sources = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'sources.json'), 'utf8')) as {
      retrieved_at: string;
      tables: Record<string, { rows: number }>;
    };
    expect(sources.retrieved_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Object.keys(sources.tables).sort()).toEqual([...TABLE_NAMES].sort());
  });

  it('documents every table in DATA_SOURCES.md', () => {
    const doc = fs.readFileSync(path.resolve(DATA_DIR, '..', '..', 'DATA_SOURCES.md'), 'utf8');
    for (const table of TABLE_NAMES) expect(doc, table).toContain(`\`${table}\``);
  });

  it('labels the synthetic table as synthetic', () => {
    const synthetic = TABLE_NAMES.filter((table) => DATASETS[table].isSynthetic);
    expect(synthetic).toEqual(['synthetic_grade_feed']);
    expect(synthetic.every((table) => table.startsWith('synthetic_'))).toBe(true);
  });
});
