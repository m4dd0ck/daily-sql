import './style.css';
import type { TableName } from './datasets.ts';
import { BrowserDuckDB, QueryTimeoutError } from './engine/browser.ts';
import { grade } from './grading/compare.ts';
import { runForGrading, SqlInputError, type ResultSet } from './grading/result.ts';
import { PUZZLES } from './puzzles/bank.ts';
import type { Puzzle } from './puzzles/schema.ts';
import { dateOfPuzzle, puzzleForNumber, todaysPuzzleNumber } from './rotation.ts';
import { buildShareText } from './share.ts';
import { browserStorage, ProgressStore, type ThemeChoice } from './storage.ts';
import { byId, byIdAs, el } from './ui/dom.ts';
import { SqlEditor } from './ui/editor.ts';
import { attemptKindOf, describeOutcome } from './ui/feedback.ts';
import {
  renderArchive,
  renderProse,
  renderResult,
  renderStats,
  renderTables,
} from './ui/render.ts';

const SITE_URL = 'https://m4dd0ck.github.io/daily-sql/';
const DISPLAY_ROWS = 200;
const QUERY_TIMEOUT_MS = 15_000;
const REFERENCE_ROW_LIMIT = 501;

const store = new ProgressStore(browserStorage());
const engine = new BrowserDuckDB(
  (table: TableName) => `${import.meta.env.BASE_URL}data/${table}.parquet`,
  new URL(`${import.meta.env.BASE_URL}extensions`, window.location.href).href,
  QUERY_TIMEOUT_MS,
);
const references = new Map<string, Promise<ResultSet>>();
const todayNumber = todaysPuzzleNumber();

let puzzleNumber = todayNumber;
let puzzle: Puzzle = puzzleForNumber(puzzleNumber, PUZZLES);
// Reason: a load, a run and a grade can overlap when the visitor moves to another puzzle while
// a query is in flight; the buttons come back only when the last of them has finished.
let busyTasks = 0;
let loadToken = 0;

const editor = new SqlEditor(byId('editor'), {
  onRun: () => void run(),
  onSubmit: () => void submit(),
});
const runButton = byIdAs('run-button', HTMLButtonElement);
const submitButton = byIdAs('submit-button', HTMLButtonElement);
const engineStatus = byId('engine-status');
const feedback = byId('feedback');

function beginTask(message: string): void {
  busyTasks += 1;
  runButton.disabled = true;
  submitButton.disabled = true;
  engineStatus.textContent = message;
}

/** End one task; `message` shows once nothing else is running, or at once if `isUrgent`. */
function endTask(message: string, isUrgent = false): void {
  busyTasks = Math.max(0, busyTasks - 1);
  if (busyTasks === 0) {
    runButton.disabled = false;
    submitButton.disabled = false;
  }
  if (busyTasks === 0 || isUrgent) engineStatus.textContent = message;
}

/** Whether the visitor is still on the puzzle a task started on. */
function isShowing(number: number): boolean {
  return puzzleNumber === number;
}

function showFeedback(message: string, tone: 'good' | 'warn' | 'bad'): void {
  feedback.hidden = false;
  feedback.className = `feedback ${tone}`;
  feedback.textContent = message;
}

function errorMessage(error: unknown): string {
  if (error instanceof QueryTimeoutError) {
    return `${error.message}. The engine was restarted; try a query that returns less or joins on a key.`;
  }
  return error instanceof Error ? error.message : String(error);
}

function referenceFor(target: Puzzle): Promise<ResultSet> {
  let pending = references.get(target.slug);
  if (!pending) {
    pending = runForGrading(engine, target.referenceSql, REFERENCE_ROW_LIMIT);
    pending.catch(() => references.delete(target.slug));
    references.set(target.slug, pending);
  }
  return pending;
}

function showResult(result: ResultSet): void {
  byId('result-card').hidden = false;
  renderResult(byId('result-table'), byId('result-summary'), result);
}

async function execute(target: Puzzle, sql: string, rowLimit: number): Promise<ResultSet> {
  await engine.ensureTables(target.datasets);
  return runForGrading(engine, sql, rowLimit);
}

// Reason: run and submit capture the puzzle, its number and the SQL when they start. The
// visitor can move to another puzzle while a query is in flight, and the result must neither
// be graded against nor shown on the puzzle they moved to.
async function run(): Promise<void> {
  if (busyTasks > 0) return;
  const number = puzzleNumber;
  const target = puzzle;
  const sql = editor.text;
  beginTask('Running…');
  let message = 'Ready.';
  try {
    const result = await execute(target, sql, DISPLAY_ROWS);
    if (isShowing(number)) {
      showResult(result);
      feedback.hidden = true;
      message = `Ran. ${result.rowCount} rows. Submit when it answers the question.`;
    }
  } catch (error) {
    if (isShowing(number)) showFeedback(errorMessage(error), 'bad');
  } finally {
    endTask(message);
  }
}

async function submit(): Promise<void> {
  if (busyTasks > 0) return;
  const number = puzzleNumber;
  const target = puzzle;
  const sql = editor.text;
  const isToday = number === todayNumber;
  beginTask('Grading…');
  try {
    await engine.ensureTables(target.datasets);
    const expected = await referenceFor(target);
    let actual: ResultSet;
    try {
      actual = await execute(target, sql, Math.max(DISPLAY_ROWS, expected.rowCount + 1));
    } catch (error) {
      // Reason: an empty editor or a stray second statement is a typo, not an attempt.
      if (error instanceof SqlInputError || store.day(number).isSolved) {
        if (isShowing(number)) showFeedback(errorMessage(error), 'bad');
        return;
      }
      const record = store.recordAttempt(number, 'error', isToday);
      if (isShowing(number)) {
        showFeedback(
          `${errorMessage(error)} (Counted as attempt ${record.attempts.length}.)`,
          'bad',
        );
      }
      return;
    }
    const outcome = grade(expected, actual, target.grading);
    const record = store.recordAttempt(number, attemptKindOf(outcome), isToday);
    if (!isShowing(number)) return;
    showResult(actual);
    const tone = outcome.kind === 'solved' ? 'good' : outcome.kind === 'values' ? 'warn' : 'bad';
    showFeedback(describeOutcome(outcome, target.grading.isOrdered, record.attempts.length), tone);
    if (outcome.kind === 'solved') showSolved();
  } catch (error) {
    if (isShowing(number)) showFeedback(errorMessage(error), 'bad');
  } finally {
    endTask('Ready.');
  }
}

function shareText(): string {
  const day = store.day(puzzleNumber);
  return buildShareText({
    puzzleNumber,
    difficulty: puzzle.difficulty,
    attempts: day.attempts,
    hintsUsed: day.hintsUsed,
    url: SITE_URL,
  });
}

function showSolved(): void {
  byId('solved-card').hidden = false;
  renderProse(byId('explanation'), puzzle.explanation);
  byId('reference-sql').textContent = puzzle.referenceSql.trim();
  byId('share-preview').textContent = shareText();
  byId('share-status').textContent = '';
}

function renderHints(): void {
  const revealed = Math.min(store.day(puzzleNumber).hintsUsed, puzzle.hints.length);
  byId('hint-list').replaceChildren(
    ...puzzle.hints.slice(0, revealed).map((hint) => el('li', {}, hint)),
  );
  const button = byIdAs('hint-button', HTMLButtonElement);
  button.hidden = revealed >= puzzle.hints.length;
  button.textContent = `Show a hint (${revealed + 1} of ${puzzle.hints.length})`;
}

function starterSql(target: Puzzle): string {
  return `-- ${target.title}\nSELECT *\nFROM ${target.datasets[0] ?? ''}\nLIMIT 10`;
}

async function loadPuzzle(number: number): Promise<void> {
  puzzleNumber = number;
  puzzle = puzzleForNumber(number, PUZZLES);
  const isToday = number === todayNumber;
  byId('puzzle-label').textContent =
    `#${number} · ${dateOfPuzzle(number)}${isToday ? '' : ' (archive)'}`;
  byId('puzzle-meta').replaceChildren(
    el('span', { class: `badge ${puzzle.difficulty}` }, puzzle.difficulty),
    ...puzzle.skills.map((skill) => el('span', { class: 'badge skill' }, skill)),
  );
  byId('puzzle-title').textContent = puzzle.title;
  document.title = `Daily SQL #${number}: ${puzzle.title}`;
  renderProse(byId('puzzle-prompt'), puzzle.prompt);
  renderTables(byId('tables-body'), puzzle.datasets, {});
  renderHints();
  editor.text = starterSql(puzzle);
  feedback.hidden = true;
  byId('result-card').hidden = true;
  byId('solved-card').hidden = true;
  if (store.day(number).isSolved) showSolved();

  loadToken += 1;
  const token = loadToken;
  const target = puzzle;
  beginTask('Loading tables…');
  let message = 'Ready.';
  let isUrgent = false;
  try {
    await engine.ensureTables(target.datasets);
    const columns = await engine.columnsByTable();
    // Reason: a later navigation owns the page now; this load must not draw over it.
    if (token === loadToken) {
      renderTables(byId('tables-body'), target.datasets, columns);
      editor.setSchema(columns);
      void referenceFor(target);
    }
  } catch (error) {
    if (token === loadToken) {
      message = `Could not load the data: ${errorMessage(error)} Reload to try again.`;
      isUrgent = true;
    }
  } finally {
    endTask(message, isUrgent);
  }
}

function numberFromHash(): number {
  const match = /^#\/(\d+)$/.exec(window.location.hash);
  const requested = match ? Number(match[1]) : todayNumber;
  return requested >= 1 && requested <= todayNumber ? requested : todayNumber;
}

function applyTheme(choice: ThemeChoice): void {
  if (choice === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  byId('theme-button').textContent = `Theme: ${choice}`;
}

function wireDialogs(): void {
  const archive = byIdAs('archive-dialog', HTMLDialogElement);
  const stats = byIdAs('stats-dialog', HTMLDialogElement);
  byId('archive-button').addEventListener('click', () => {
    renderArchive(byId('archive-list'), PUZZLES, todayNumber, puzzleNumber, store);
    archive.showModal();
  });
  byId('stats-button').addEventListener('click', () => {
    renderStats(byId('stats-list'), store.stats(todayNumber));
    stats.showModal();
  });
  for (const dialog of [archive, stats]) {
    dialog.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target === dialog || target.closest('[data-close]') || target.closest('a'))
        dialog.close();
    });
  }
}

function wireControls(): void {
  runButton.addEventListener('click', () => void run());
  submitButton.addEventListener('click', () => void submit());
  byId('hint-button').addEventListener('click', () => {
    store.recordHint(puzzleNumber);
    renderHints();
  });
  byId('share-button').addEventListener('click', () => {
    const status = byId('share-status');
    navigator.clipboard.writeText(shareText()).then(
      () => (status.textContent = 'Copied.'),
      () => (status.textContent = 'Copy failed; select the text above instead.'),
    );
  });
  const order: ThemeChoice[] = ['system', 'light', 'dark'];
  byId('theme-button').addEventListener('click', () => {
    const next = order[(order.indexOf(store.themeChoice) + 1) % order.length] ?? 'system';
    store.themeChoice = next;
    applyTheme(next);
  });
  window.addEventListener('hashchange', () => void loadPuzzle(numberFromHash()));
}

applyTheme(store.themeChoice);
byId('storage-note').textContent = store.isPersistent
  ? 'Your streak and history are kept in this browser only.'
  : 'This browser is not letting the page store anything, so progress lasts for this visit only.';
wireDialogs();
wireControls();
void engine.warmUp().catch((error: unknown) => {
  engineStatus.textContent = `DuckDB could not start: ${errorMessage(error)}`;
});
void loadPuzzle(numberFromHash());
