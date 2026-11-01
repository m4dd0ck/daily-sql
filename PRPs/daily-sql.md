# Plan Review Protocol: Daily SQL

## Purpose

A static page with one SQL puzzle a day over real, messy public data. The visitor writes SQL in
the browser, DuckDB-WASM runs it in a worker, and the page grades the result set against the
reference answer by value. A Wordle-style share string, a streak kept in localStorage and an
archive of past puzzles make it something people come back to. For the owner it is a portfolio
piece that shows SQL against dirty data and a typed front end, in a portfolio that is otherwise
Python CLIs with static output.

## Core Principles

1. **Same engine everywhere**: tests, fingerprints and the browser all run DuckDB-WASM 1.33.1-dev57.0
   (DuckDB v1.5.4). A reference query that passes in CI passes in the page.
2. **Normalize in SQL, compare in TypeScript**: results are cast to plain numbers, strings and
   booleans inside DuckDB, so the grader is a pure function over primitives and easy to test.
3. **Real data, honest provenance**: every table is a reproducible subset of a public dataset
   with its license recorded; the one synthetic table is named `synthetic_*` and documented.

---

## Goal

`npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e` all pass on
a repo that serves 30+ graded puzzles over five Parquet tables, ready to deploy to GitHub Pages.

## Why

The owner is applying for Analytics Engineer / Data Engineer roles. Recruiters can open a link
and play; reviewers can read the puzzle bank, the grader and the data scripts. The dirty-data
angle (dedup, fan-out, placeholders, late rows, SCD) is the day job, and it is what generic SQL
practice sites skip.

## What

- [ ] `scripts/fetch-data.ts`: downloads the subsets, writes `public/data/*.parquet`, records retrieval date
- [ ] `DATA_SOURCES.md`: source URL, license, retrieval date, subsetting rule and dropped columns per table
- [ ] `puzzles/*.yaml`: 30+ puzzles, schema-checked with zod
- [ ] `puzzles/fingerprints.json`: generated expected-answer fingerprints, checked by a test
- [ ] `src/`: rotation, grading, share string, storage, engine wrapper, UI
- [ ] vitest unit tests + reference-answer test; Playwright smoke test
- [ ] `.github/workflows/deploy.yml` (Pages), not enabled
- [ ] README, RUNBOOK, CLAUDE.md, TASK.md (four-file skeleton)

---

## Success Criteria

### Functional Requirements
- [ ] Puzzle number derives from the calendar date in America/New_York; #1 is 2026-11-01; same date gives the same puzzle on every machine.
- [ ] Submit grades by value: NULLs equal NULLs, numbers within the puzzle's tolerance, DATE equal to a midnight TIMESTAMP, row order only when `ordered: true`, column names only when `column_names: match`.
- [ ] Feedback names the first problem: SQL error, column count, column names, row count, or the first differing row.
- [ ] Share string: puzzle number, difficulty, attempt count, one square per attempt, link; never the answer.
- [ ] Streak and history in localStorage behind try/catch; the page works when storage throws.
- [ ] Archive lists every puzzle up to today with solved/attempted state; any can be played.
- [ ] A runaway query is stopped after 15 s by terminating the worker; display is capped at 200 rows.

### Non-Functional Requirements
- [ ] Data folder < 20 MB (test asserts it).
- [ ] No runtime request leaves the site's origin (bundles self-hosted, no extension autoinstall).
- [ ] Untrusted text (puzzle prose, result values, error messages) only ever set via `textContent`.
- [ ] Usable at 360 px wide, keyboard only, in light and dark themes.

### Testing Requirements
- [ ] Unit tests: grading (each feedback kind, tolerance, ordering, NULLs), rotation (timezone edges, DST, before launch), share string, storage fallback, schema (every file parses, ids unique and contiguous, datasets exist).
- [ ] Integration: every reference SQL runs on the committed Parquet, returns ≥ 1 row, and matches `fingerprints.json`; each reference result grades as solved against itself.
- [ ] E2E: page loads, today's reference SQL typed into the editor, Submit, "Solved" visible.

---

## All Needed Context

### Relevant Documentation

| Document | Purpose | Link |
|----------|---------|------|
| DuckDB-WASM README | Vite manual bundles, registerFileBuffer, conn.query/send | https://github.com/duckdb/duckdb-wasm/blob/main/packages/duckdb-wasm/README.md |
| DuckDB-WASM docs | instantiation, ingestion, extensions | https://duckdb.org/docs/stable/clients/wasm/instantiation , https://duckdb.org/docs/stable/clients/wasm/extensions |
| DuckDB SQL | window functions, QUALIFY, PIVOT, strptime/try_strptime, generate_series | https://duckdb.org/docs/stable/sql/introduction |
| CodeMirror 6 | basicSetup, EditorView, keymaps, themes | https://codemirror.net/docs/guide/ , https://codemirror.net/examples/styling/ |
| @codemirror/lang-sql | `sql({ dialect, schema })` completion | https://github.com/codemirror/lang-sql |
| Vite | `?url` assets, `base`, `import.meta.glob`, plugins | https://vite.dev/guide/assets , https://vite.dev/guide/features#glob-import , https://vite.dev/guide/static-deploy#github-pages |
| Vitest | config, environment | https://vitest.dev/config/ |
| Playwright | webServer, headless | https://playwright.dev/docs/test-webserver |
| zod 4 | object schemas, `.default`, `z.infer` | https://zod.dev/api |
| typescript-eslint | flat config, peer range | https://typescript-eslint.io/getting-started/ |
| Socrata SODA | `$select/$where/$order/$limit` | https://dev.socrata.com/docs/queries/ |
| CFPB CCDB API | CSV export, filters | https://cfpb.github.io/api/ccdb/api.html |
| OWID CO2 | codebook, CC BY 4.0 | https://github.com/owid/co2-data |
| GitHub Pages actions | upload-pages-artifact v5, deploy-pages v5 | https://github.com/actions/deploy-pages |

### Codebase Structure

```
daily-sql/
├── index.html
├── vite.config.ts           # base './', YAML-to-JSON plugin, vitest config
├── puzzles/
│   ├── 001-*.yaml ...       # one puzzle per file, id = schedule position
│   └── fingerprints.json    # generated by npm run fingerprints
├── public/data/*.parquet    # committed subsets, served as static files
├── scripts/
│   ├── fetch-data.ts        # download + subset + write Parquet (node, type stripping)
│   └── fingerprints.ts      # recompute fingerprints (--check / --write)
├── src/
│   ├── main.ts              # wires UI
│   ├── puzzles/schema.ts    # zod schema + types
│   ├── puzzles/bank.ts      # browser loader (import.meta.glob)
│   ├── puzzles/load-node.ts # node loader (fs + yaml) for tests/scripts
│   ├── rotation.ts          # date -> puzzle number -> puzzle
│   ├── grading/result.ts    # ResultSet type, SQL normalization query builder
│   ├── grading/compare.ts   # pure grader
│   ├── grading/fingerprint.ts
│   ├── share.ts             # share string
│   ├── storage.ts           # safe localStorage + history/streak
│   ├── engine/runner.ts     # SqlRunner interface + runForGrading()
│   ├── engine/browser.ts    # AsyncDuckDB in a worker, lazy tables, timeout
│   ├── engine/node.ts       # blocking DuckDB-WASM for tests/scripts
│   ├── datasets.ts          # table registry (name, file, source, license)
│   └── ui/*.ts, style.css
├── tests/*.test.ts          # vitest
└── e2e/smoke.spec.ts        # Playwright
```

### Known Gotchas

1. **TypeScript 7 is `latest` on npm (Go port) but typescript-eslint 8.72 peers `typescript >=4.8.4 <6.1.0`.** Pin TypeScript 6.0.3.
2. **`@duckdb/duckdb-wasm` `latest` is a dev-tagged build (1.33.1-dev57.0, 2026-06-22, DuckDB v1.5.4).** Pin it exactly. It depends on `apache-arrow ^17`.
3. **Multiple statements run silently**: `conn.query("select 1; drop table x")` executes both and returns the last. Reject more than one statement: strip comments/trailing semicolons with a quote-aware scanner and refuse a remaining `;`, then run through `CREATE TEMP TABLE __result AS <sql>`, which is itself a parse error for non-queries.
4. **`CREATE TABLE AS DESCRIBE t` is a parser error.** For DESCRIBE/SUMMARIZE/SHOW, wrap as `SELECT * FROM (<sql>)`.
5. **Arrow JS values**: BIGINT → `bigint`, DECIMAL → `DecimalBigNum` Uint32Array, DATE/TIMESTAMP → epoch ms. Normalize in SQL: numeric types `CAST(x AS DOUBLE)`, BOOLEAN as is, everything else `CAST(x AS VARCHAR)`.
6. **Insertion order**: the grader relies on `SELECT * FROM __result` returning rows in CTAS order. DuckDB preserves insertion order by default (`preserve_insertion_order = true`) and the eh/mvp bundles are single-threaded.
7. **No TIMESTAMPTZ in data**: CFPB timestamps are UTC; store as naive TIMESTAMP so no ICU functions are needed.
8. **`registerFileBuffer` transfers the buffer to the worker** (detached afterwards). Re-fetch on worker restart.
9. **Extensions**: `autoinstall_known_extensions` is off in WASM; parquet is built in. Puzzles must not need json/icu/httpfs. The fingerprint test catches it because it runs the same engine.
10. **Open data moves**: Socrata datasets update daily and the inspections set is a rolling window. Refetching changes answers; the committed Parquet is the source of truth; `npm run fingerprints -- --check` shows what moved.
11. **zsh**: `echo =====` is a zsh error (`=` expansion); irrelevant to the app, relevant to shell scripts in RUNBOOK.
12. **Vite `?url` for workers**: import the worker script as `?url` and pass to `new Worker(url)`; do not use `?worker` for DuckDB's worker files.
13. **Node 26 type stripping** runs `scripts/*.ts` directly; no enums or parameter properties; relative imports need `.ts` extensions, so set `allowImportingTsExtensions` (with `noEmit`).

### Data (researched 2026-11-01)

| table | source | subset | rows | license |
|---|---|---|---|---|
| `inspections` | NYC DOHMH Restaurant Inspection Results (Socrata `43nn-pn8j`) | restaurants whose CAMIS ends in 7 (~10%), all their rows | ~29.5k | NYC Open Data Law (Admin Code §23-502): no license restrictions; source attribution |
| `service_requests` | NYC 311 Service Requests from 2020 (Socrata `erm2-nwe9`) | created in 2024, unique_key ends in 42 (~1%) | ~34.6k | same |
| `complaints` | CFPB Consumer Complaint Database | product = Student loan, received 2023-2024 | ~25.3k | CC0 / public domain (API `_meta.license`) |
| `emissions` | OWID CO2 dataset | year ≥ 1950, 11 columns | ~19k | CC BY 4.0 |
| `synthetic_grade_feed` | derived from `inspections` by a seeded SQL rule | graded inspections, re-delivered with mixed date formats, duplicates, corrections, late loads | few k | synthetic, labelled |

Mess observed in the real data: 31 exact duplicate rows in inspections; `boro = '0'`,
`inspection_date = 1900-01-01` and lat/long 0 placeholders; score repeated on every violation row
(fan-out); grades N/P/Z alongside A/B/C; chain names spelled many ways (`DUNKIN`, `Dunkin`,
`DUNKIN'`, `STARBUCKS COFFEE # 26528`); 311 `complaint_type` casing mixed (`HEAT/HOT WATER` vs
`Noise - Residential`), `borough = 'Unspecified'`, 9 requests closed before they were created,
neighbourhood names in `city`; CFPB uses the string `'None'` for missing; OWID mixes 36
aggregates (World, continents, income groups, "(GCP)" variants) with countries and Kosovo has
no ISO code. Dropped for privacy: addresses, coordinates, phone, consumer ZIP, tags, narratives.

### Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| @duckdb/duckdb-wasm | 1.33.1-dev57.0 | SQL engine (browser + Node tests) |
| apache-arrow | via duckdb-wasm | result tables |
| codemirror | 6.0.2 | basicSetup |
| @codemirror/lang-sql | 6.10.0 | SQL highlighting + schema completion |
| zod | 4.6.7 | puzzle schema |
| yaml | 2.9.1 | dev: parse puzzles at build/test time |
| vite | 8.3.5 | build/dev server |
| vitest | 5.0.5 | unit/integration tests |
| typescript | 6.0.3 | typecheck (see gotcha 1) |
| eslint / @eslint/js / typescript-eslint / globals | 10.14.0 / 10.0.1 / 8.72.1 / 17.14.0 | lint |
| prettier | 3.9.10 | format |
| @playwright/test | 1.64.1 | smoke test |
| @types/node | latest 26.x | scripts/tests |

---

## Implementation Blueprint

### Data Models

```
Puzzle (puzzles/*.yaml, zod):
  - id: int ≥ 1, unique, contiguous; schedule position
  - slug: kebab-case string (file name after the number)
  - title: string
  - difficulty: easy | medium | hard
  - datasets: TableName[] (≥ 1)
  - skills: Skill[] (window, dedup, date-bucketing, anti-join, gaps-islands, cohort,
            running-total, pivot, string-cleanup, null-handling, fan-out, scd, late-arriving,
            aggregation, top-n, date-parsing)
  - prompt: string (blank line = paragraph, `code` spans)
  - hints: string[] (≥ 1)
  - reference_sql: string
  - grading: { ordered: bool, tolerance: number ≥ 0 (default 1e-6), column_names: ignore | match }
  - explanation: string

ResultSet: { columns: string[], types: string[], rows: Cell[][], rowCount: number, truncated: bool }
Cell = number | string | boolean | null

GradeOutcome =
  | { kind: 'solved' }
  | { kind: 'columns', expected: number, actual: number }
  | { kind: 'column-names', missing: string[], extra: string[] }
  | { kind: 'rows', expected: number, actual: number }
  | { kind: 'values', rowIndex: number, expected: Cell[], actual: Cell[] | null }

Attempt = 'error' | 'shape' | 'values' | 'solved'   (share squares ⬛ 🟥 🟨 🟩)
History (localStorage key daily-sql:v1): { days: Record<puzzleNumber, { attempts: Attempt[], hints: number, solved: bool, solvedOnDay: bool }> }
Fingerprint: { rows: number, columns: number, sha256: string }  // rows canonicalized, numbers to 6 significant digits, sorted unless ordered
```

### Task Breakdown

#### Phase 1: Foundation

| # | Task | File(s) | Depends On | Validation |
|---|------|---------|------------|------------|
| 1 | package.json, tsconfig, eslint, prettier, vite config, .gitignore | root | - | `npm run typecheck` on an empty src |
| 2 | Node engine wrapper (blocking DuckDB-WASM) | `src/engine/node.ts` | 1 | `select version()` returns v1.5.4 |
| 3 | Data fetch script + DATA_SOURCES.md | `scripts/fetch-data.ts` | 2 | five Parquet files, total < 20 MB |
| 4 | Dataset registry | `src/datasets.ts` | 3 | test: every file exists |

#### Phase 2: Core logic

| # | Task | File(s) | Depends On | Validation |
|---|------|---------|------------|------------|
| 5 | Puzzle schema + node loader | `src/puzzles/*` | 1 | schema test |
| 6 | Statement guard + normalization query + runForGrading | `src/engine/runner.ts`, `src/grading/result.ts` | 2 | unit tests |
| 7 | Grader | `src/grading/compare.ts` | 6 | unit tests per outcome |
| 8 | Rotation | `src/rotation.ts` | 5 | DST/timezone tests |
| 9 | Share + storage | `src/share.ts`, `src/storage.ts` | 7 | unit tests |
| 10 | Author 30+ puzzles, iterate against data | `puzzles/*.yaml` | 3, 6 | reference test |
| 11 | Fingerprints script + test | `scripts/fingerprints.ts`, `tests/reference.test.ts` | 10 | `npm test` |

#### Phase 3: UI, e2e, docs

| # | Task | File(s) | Depends On | Validation |
|---|------|---------|------------|------------|
| 12 | Browser engine (worker, lazy tables, timeout restart) | `src/engine/browser.ts` | 6 | manual + e2e |
| 13 | UI: header, puzzle, schema panel, editor, results, feedback, share, archive, stats, theme | `src/ui/*`, `index.html`, `src/style.css` | 12 | `npm run build`, e2e |
| 14 | Playwright smoke | `e2e/smoke.spec.ts`, `playwright.config.ts` | 13 | `npm run test:e2e` |
| 15 | Deploy workflow (Pages) | `.github/workflows/deploy.yml` | 13 | YAML review |
| 16 | Four-file skeleton + doc-check | root | all | doc-check 0 warnings |

### Pseudocode / Logic Flow

```
runForGrading(runner, sql, rowLimit):
    1. stmt = singleStatement(sql)            # strip comments + trailing ';', throw on inner ';'
    2. body = /^(describe|summarize|show)\b/i ? `SELECT * FROM (${stmt})` : stmt
    3. CREATE OR REPLACE TEMP TABLE __result AS {body}
    4. cols = DESCRIBE __result ; n = SELECT count(*) FROM __result
    5. SELECT {cast per type} FROM __result LIMIT rowLimit   # numeric -> DOUBLE, BOOLEAN keep, else VARCHAR
    6. DROP TABLE __result ; return ResultSet

grade(expected, actual, grading):
    1. column count differs -> columns
    2. if match names: compare lowercased name multisets -> column-names; reorder actual to expected order
    3. row count differs -> rows
    4. normalize cells (midnight timestamp string -> date string; -0 -> 0)
    5. if not ordered: sort both by canonical key (numbers rounded to 6 sig digits)
    6. first i where !rowsEqual(e[i], a[i], tol) -> values(i, e[i], a[i])
    7. solved

cellsEqual(a, b, tol): both null -> true; one null -> false; numbers -> |a-b| <= tol or |a-b| <= tol*max(|a|,|b|); else ===

puzzleNumberFor(date): ymd = Intl.DateTimeFormat('en-CA', {timeZone: 'America/New_York'}) parts
    n = (Date.UTC(ymd) - Date.UTC(2026,10,1)) / 86400000 + 1 ; return max(1, n)
puzzleFor(n, bank): bank[(n - 1) % bank.length]

browser engine timeout: Promise.race(query, sleep(15000)); on timeout: worker.terminate(),
    mark tables unloaded, re-instantiate on next call, report "stopped after 15 s".
```

Error handling: SQL errors are shown verbatim (DuckDB messages are helpful) and recorded as an
`error` attempt only on Submit; Run never counts. Data fetch failures in the page show a retry
button. Schema failures throw at load (fail fast) and are caught by the schema test first.

---

## Validation

```bash
npm run lint          # eslint . && prettier --check .
npm run typecheck     # tsc --noEmit
npm test              # vitest run (unit + reference fingerprints)
npm run build         # tsc --noEmit && vite build
npx playwright install chromium && npm run test:e2e
python3 ~/.claude/scripts/doc-check.py --repo .
```

The final gate is `/validate` passing.

---

## Anti-Patterns to Avoid

### Do NOT:

1. **Grade by comparing query text or by exact float equality**
   - Why it's bad: many correct queries exist; floats differ in the last bits by plan.
   - Instead: compare normalized result sets with tolerance.

2. **Load DuckDB from a CDN**
   - Why it's bad: third-party runtime dependency, breaks offline review.
   - Instead: Vite `?url` imports of the dist files.

3. **Put results or puzzle prose in `innerHTML`**
   - Why it's bad: data values are untrusted text.
   - Instead: build nodes with `textContent`.

### Common Mistakes for This Feature:

- [ ] Fan-out in reference SQL itself: check every reference at the right grain before writing the fingerprint.
- [ ] Unordered puzzles whose reference relies on ties: give the prompt a full tie-breaker or set `ordered: false`.
- [ ] Prompts that leave rounding or NULL treatment ambiguous: say it in the prompt and set the tolerance.

---

## Notes

Confidence for one-pass implementation: **7/10**. Risks: DuckDB-WASM dev-tagged build in a real
browser under Vite 8 (Rolldown), Playwright's Chromium download, and authoring 30 puzzles whose
references are correct at the right grain. The Node probe already ran DuckDB-WASM, Parquet
round-trips and all four downloads successfully.

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-11-01 | coding agent | Initial PRP created |
