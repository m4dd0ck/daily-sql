# Tasks

Single-repo status, kept by hand. Last reviewed **2026-11-01**.

## Needs the owner

| **item** | why it is stuck | added |
|---|---|---|
| **Create the public GitHub repo daily-sql under m4dd0ck and push `main`** | publishing is the owner's call after review | 2026-11-01 |
| **Enable Pages with source "GitHub Actions"** | the deploy job fails until Pages is on | 2026-11-01 |
| **Confirm the launch date** | puzzle #1 is 2026-11-01 (`LAUNCH_DATE` in `src/rotation.ts`); move it to the go-live day if later, before anyone plays | 2026-11-01 |
| **Read the NYC Open Data terms once** | `DATA_SOURCES.md` relies on the Open Data Law (Admin Code Title 23, Chapter 5); the portal sets no per-dataset license | 2026-11-01 |

## Queue

- [ ] Watch the first CI run on GitHub: the Playwright step installs Chromium with system
  dependencies there, which has only been run locally on macOS.

## Parked

- Saved editor drafts per puzzle, 2026-11-01, PARKED; not needed for one-sitting puzzles.

## Questions

- [ ] `npm audit` reports a moderate advisory in `minimatch` through ESLint 10 (dev only, not
  in the built site); revisit when ESLint updates it.
