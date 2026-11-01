# Runbook

Procedures for Daily SQL. `README.md` describes what each command does; this file says when
to run it and in what order.

## On open

```bash
git status --short
git log -3 --oneline
```

## On close

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

## Add a puzzle

1. Try the query against the committed data: `npm run try-sql -- "SELECT ..."` shows what
   the grader will see (types, row count, first rows).
2. Copy the newest file in `puzzles/` to the next number (file name NNN-slug.yaml) with `id` equal to
   NNN. Write the prompt so one answer is right: say how to round, which placeholders to
   drop, how to break ties, and set `ordered: true` only when the prompt fixes an order.
3. `npm run fingerprints -- --write`, then `npm test`. Check the diff of
   `puzzles/fingerprints.json` adds one entry and changes none.
4. `npm run test:e2e` solves every puzzle in the browser, the new one included.

New puzzles go at the end. The bank cycles, so inserting one in the middle moves every later
day's puzzle.

## Refresh the data

1. `npm run fetch-data -- --refresh` downloads the sources again and rewrites
   `public/data/`. Update `DATA_SOURCES.md` if a source changed shape.
2. `npm run fingerprints` lists every puzzle whose answer moved. Read each one: a puzzle
   whose prompt names a number or a row that no longer exists needs its prose fixed.
3. `npm run fingerprints -- --write`, then the On close checks.

The sources change daily, so do this on purpose, not routinely: a refresh changes past
puzzles' answers for people who already solved them.

## Upgrade DuckDB-WASM

1. `npm view @duckdb/duckdb-wasm dist-tags` and install the new version with `-E`.
2. `npm test`: `tests/engine-version.test.ts` fails with the new DuckDB version. Set
   `DUCKDB_VERSION` in `scripts/fetch-extensions.ts` to it.
3. Download the two extension files for that version, take their SHA-256
   (`shasum -a 256`) and update the hashes in the same script. `npm run build`.
4. `npm run fingerprints` (any change means the engine changed an answer), then
   `npm run test:e2e`.

## Deploy

Nothing by hand once Pages is on. Every push to `main` runs the checks and deploys `dist/`.
`gh run list --limit 3` shows whether it landed.

## Things that bite

- Under Node, DuckDB-WASM writes `COPY ... TO` files straight to disk and cannot overwrite an
  existing file; `fetch-data` deletes the target first. Run it from the repo root.
- `npm run test:e2e` builds first and serves on port 4173; a leftover preview on that port
  makes it fail to start.
- Playwright needs its Chromium once per machine: `npx playwright install chromium`.

## Restore on a new machine

1. Install Node 24.2 or later. Clone `https://github.com/m4dd0ck/daily-sql.git`.
2. `npm ci`, `npx playwright install chromium`, then the On close checks. The data is
   committed; the build downloads the Parquet extension. There are no keys.
