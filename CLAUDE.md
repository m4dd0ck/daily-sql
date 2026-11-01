# Daily SQL: agent rules

Instructions for coding agents working in this repo; a human reader wants `README.md`. Read
`README.md` for how it works, `RUNBOOK.md` for procedures, `TASK.md` for what is open. The
owner's global agent rules apply on top of these.

## Prohibitions

- Public repo: no personal data, keys or account details in any file. Data columns that could
  describe an individual (addresses, consumer ZIPs, narratives, phone numbers) stay out.
- Real-time commits only; never backdate or set `GIT_AUTHOR_DATE`. No AI attribution.
- Never rewrite `puzzles/fingerprints.json` to make a failing test pass without reading why
  the answer moved; a changed answer is a decision for the owner.
- Never reorder, renumber or delete existing puzzles: the date of every past puzzle depends on
  its position. Add at the end.
- Never refresh `public/data/` as part of an unrelated change; it changes past answers.
- Synthetic data only where the real data lacks the mess, named `synthetic_*`, documented in
  `DATA_SOURCES.md`.
- No runtime requests to third parties from the page (CDNs, extension repositories,
  analytics).

## Traps

- The page and the tests must run the same DuckDB version; tests use DuckDB-WASM's Node build,
  never the native `duckdb` package.
- Every value reaching the DOM goes through `textContent` (`el()` in `src/ui/dom.ts`).
- Scripts in `scripts/` run under Node's type stripping: no enums, no parameter properties,
  relative imports end in `.ts`.
- A prompt that does not pin rounding, placeholders and tie-breaks has more than one right
  answer and the grader will call one of them wrong.

## Conventions

- Puzzle files are named NNN-slug.yaml with `id` equal to NNN; prose uses backticks for code and
  blank lines between paragraphs.
- Grading tolerance is absolute: 0.051 for one decimal, 0.006 for two.
