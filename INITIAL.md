# Feature Request: Daily SQL

## FEATURE

A static web page that serves one SQL puzzle a day over real, messy public data. The visitor
reads a short business question, writes SQL in an editor, runs it against DuckDB-WASM in the
browser, and the page grades the result set against the reference answer. It is a portfolio
piece for Analytics Engineer / Data Engineer roles: it shows SQL against dirty data
(duplicates, inconsistent casing, nulls and placeholder values, mixed date formats,
late-arriving rows, slowly changing values, fan-out joins) and a typed front end, with no
backend, no accounts and no API keys.

---

## EXAMPLES

### Example 1: Solve today's puzzle

**Input:**
```
Visitor opens the page on 2026-11-14 (America/New_York). Puzzle #14 asks:
"Average inspection score per borough, counted once per inspection, not once per violation."
They write a query with a CTE that collapses violations to one row per (camis, inspection_date)
and press Submit.
```

**Output:**
```
Result table (first 200 rows at most), then "Solved in 2 attempts".
The explanation and the reference SQL appear. "Copy result" puts this on the clipboard:

Daily SQL #14 (medium) 2/∞
🟨🟩
https://m4dd0ck.github.io/daily-sql/
```

### Example 2: Wrong answer with feedback

**Input:**
```
Same puzzle; the visitor averages score over the raw violation rows.
```

**Output:**
```
"Right shape, wrong values. Row 2 differs: expected (Brooklyn, 23.41), got (Brooklyn, 25.87)."
The attempt is stored; the share string gains a yellow square.
```

### Example 3: Edge Case - query that would run forever or return millions of rows

**Input:**
```
SELECT * FROM inspections a, inspections b, service_requests c;
```

**Output:**
```
After the time limit the worker is stopped and restarted, the page says
"Query stopped after 15 s", and nothing is graded. A large but finite result shows the first
200 rows and says how many there were.
```

### Example 4: Edge Case - no localStorage

**Input:**
```
Private window with storage blocked.
```

**Output:**
```
The puzzle still loads and grades. Streak and history live in memory for the visit and a
note says progress will not be kept.
```

### Similar Features (for reference)

- **Wordle**: one puzzle a day for everyone, share string that shows effort without the answer.
- **SQL murder mystery / pgexercises**: SQL practice against a fixed dataset; here the data is
  real and dirty, and grading is by result set, not by query text.

---

## DOCUMENTATION

### Required Reading

| Document | Why It's Needed | Link |
|----------|-----------------|------|
| DuckDB-WASM README | Vite bundle import pattern, registerFileBuffer | https://github.com/duckdb/duckdb-wasm/blob/main/packages/duckdb-wasm/README.md |
| DuckDB-WASM docs | instantiation, data ingestion | https://duckdb.org/docs/stable/clients/wasm/overview |
| CodeMirror 6 | editor setup, SQL language | https://codemirror.net/docs/guide/ , https://github.com/codemirror/lang-sql |
| Vite | static asset `?url` imports, `base` for GitHub Pages | https://vite.dev/guide/assets , https://vite.dev/guide/static-deploy |
| Vitest | config and test API | https://vitest.dev/guide/ |
| Playwright | webServer config, headless Chromium | https://playwright.dev/docs/test-webserver |
| zod | schema check for puzzle files | https://zod.dev |

### Related Internal Docs

- None in this repo yet. Tone for README and RUNBOOK follows the owner's other public repos.

### API/Library Documentation

- Socrata SODA API (NYC Open Data): https://dev.socrata.com/docs/queries/ - `$select`, `$where`, `$order`, `$limit`
- CFPB complaint API: https://cfpb.github.io/api/ccdb/api.html - CSV export with filters
- Our World in Data CO2: https://github.com/owid/co2-data - columns and license

---

## OTHER CONSIDERATIONS

### Constraints

- **Static only**: GitHub Pages, no server, no keys, no third-party calls at runtime.
- **Data size**: the committed data folder stays well under 20 MB; Parquet.
- **Licenses**: every dataset is redistributable; source URL, license, retrieval date and the
  exact subsetting script are in the repo.
- **Stack**: TypeScript strict, Vite, npm, CodeMirror 6, `@duckdb/duckdb-wasm` (self-hosted).
- **Tests**: vitest for grading, rotation, share string, schema; every puzzle's reference SQL
  runs against the real data and matches a stored fingerprint; a Playwright smoke test.
- **Accessibility**: keyboard reachable, labelled controls, live region for feedback, phone width,
  light and dark themes.

### Security Considerations

- Visitor SQL runs only inside their own browser's DuckDB worker; nothing leaves the page.
- Puzzle text and query results are inserted as text, never as HTML.
- No personal data in any dataset: drop addresses, phone numbers, ZIPs of individual
  consumers, free-text narratives.

### Known Gotchas

1. **DuckDB-WASM bundles are 35-41 MB**: only one is downloaded; serve them from the build,
   not a CDN, so the page has no third-party runtime dependency.
2. **Arrow values are not plain JS**: BIGINT is `bigint`, DECIMAL is a Uint32Array, DATE is ms;
   normalize in SQL before reading.
3. **Open data changes daily**: the committed Parquet is the source of truth; refetching can
   change answers, which the fingerprint test is there to catch.

### Out of Scope

- Accounts, leaderboards, server-side grading.
- Hiding the reference SQL from someone reading the bundle (a static site cannot).
- Puzzles that need DuckDB extensions downloaded at runtime.

### Open Questions

- [x] Timezone for the daily rotation: America/New_York (the data is mostly NYC).
- [x] Test engine: DuckDB-WASM's own Node build, so tests and browser run the same engine.

---

## Priority & Timeline

- **Priority**: HIGH
- **Target**: 2026-11
- **Estimated Effort**: LARGE

---

## Stakeholders

- **Requestor**: Noah (m4dd0ck)
- **Implementer**: coding agent
- **Reviewer**: Noah
