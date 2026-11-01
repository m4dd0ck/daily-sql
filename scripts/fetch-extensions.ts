/**
 * Download the DuckDB extensions the page loads, into public/extensions/ (gitignored).
 *
 * Usage: npm run fetch-extensions   (also runs before every build)
 *
 * The browser build of DuckDB-WASM does not link Parquet in; it loads it as an extension.
 * Serving the official, signed extension file with the site keeps the page free of
 * third-party requests. Files are checked against the hashes below, so a changed upstream
 * file fails the build instead of shipping. When upgrading @duckdb/duckdb-wasm, update
 * DUCKDB_VERSION (tests/engine-version.test.ts checks it) and the hashes.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const DUCKDB_VERSION = 'v1.5.4';

const FILES: Record<string, string> = {
  'wasm_mvp/parquet.duckdb_extension.wasm':
    'b64c255a7f7d06cc234535b2f0ecab345fda91bffff5509d3179004bc13aa19a',
  'wasm_eh/parquet.duckdb_extension.wasm':
    '4845705bbd69fc9ad52878d96a505c73cae4a6c509822079cc2413e5eb437f95',
};

const root = path.resolve(import.meta.dirname, '..', 'public', 'extensions', DUCKDB_VERSION);

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fetchOne(relative: string, expected: string): Promise<void> {
  const target = path.join(root, relative);
  if (fs.existsSync(target) && sha256(fs.readFileSync(target)) === expected) {
    console.log(`cached   ${relative}`);
    return;
  }
  const url = `https://extensions.duckdb.org/${DUCKDB_VERSION}/${relative}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status} from ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = sha256(bytes);
  if (actual !== expected) {
    throw new Error(`Hash mismatch for ${relative}: expected ${expected}, got ${actual}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
  console.log(`fetched  ${relative}`);
}

if (import.meta.main) {
  await Promise.all(Object.entries(FILES).map(([relative, hash]) => fetchOne(relative, hash)));
}
