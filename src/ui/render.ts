import { DATASETS, type TableName } from '../datasets.ts';
import type { ResultSet } from '../grading/result.ts';
import type { Puzzle } from '../puzzles/schema.ts';
import { dateOfPuzzle, puzzleForNumber } from '../rotation.ts';
import type { ProgressStore, Stats } from '../storage.ts';
import { el } from './dom.ts';
import { formatCell, parseProse } from './text.ts';

/** Prose with `code` spans as paragraphs. */
export function renderProse(target: HTMLElement, source: string): void {
  target.replaceChildren(
    ...parseProse(source).map((segments) =>
      el('p', {}, ...segments.map((s) => (s.isCode ? el('code', {}, s.text) : s.text))),
    ),
  );
}

/** One block per table: what a row is, where it is from, its columns once known. */
export function renderTables(
  target: HTMLElement,
  tables: readonly TableName[],
  columns: Record<string, string[]>,
): void {
  target.replaceChildren(
    ...tables.map((table) => {
      const info = DATASETS[table];
      const names = columns[table];
      return el(
        'div',
        { class: 'table-info' },
        el(
          'h3',
          {},
          el('code', {}, table),
          info.isSynthetic ? el('span', { class: 'badge warn' }, 'synthetic') : null,
        ),
        el('p', {}, `${info.title}. One row per ${info.grain.replace(/^one row per /, '')}.`),
        names
          ? el(
              'p',
              { class: 'columns' },
              ...names.flatMap((n, i) => [i > 0 ? ' ' : '', el('code', {}, n)]),
            )
          : null,
        el(
          'p',
          { class: 'source' },
          el('a', { href: info.sourceUrl, rel: 'noopener' }, info.source),
          ' · ',
          el('a', { href: info.licenseUrl, rel: 'noopener' }, info.license),
        ),
      );
    }),
  );
}

/** The result grid, capped at the rows that were read back. */
export function renderResult(table: HTMLElement, summary: HTMLElement, result: ResultSet): void {
  const shown = result.rows.length;
  summary.textContent = result.isTruncated
    ? `${result.rowCount} rows; showing the first ${shown}.`
    : `${result.rowCount} row${result.rowCount === 1 ? '' : 's'}.`;
  const head = el(
    'tr',
    {},
    ...result.columns.map((name, i) => {
      const isNumeric = result.rows.some((row) => typeof row[i] === 'number');
      return el(
        'th',
        { scope: 'col', title: result.types[i] ?? '', class: isNumeric ? 'num' : '' },
        name,
      );
    }),
  );
  const body = result.rows.map((row) =>
    el(
      'tr',
      {},
      ...row.map((cell) =>
        el(
          'td',
          { class: cell === null ? 'null' : typeof cell === 'number' ? 'num' : '' },
          formatCell(cell),
        ),
      ),
    ),
  );
  table.replaceChildren(el('table', {}, el('thead', {}, head), el('tbody', {}, ...body)));
}

/** Archive entries newest first, with how each went. */
export function renderArchive(
  target: HTMLElement,
  bank: readonly Puzzle[],
  todayNumber: number,
  currentNumber: number,
  store: ProgressStore,
): void {
  const items: HTMLElement[] = [];
  for (let n = todayNumber; n >= 1; n -= 1) {
    const puzzle = puzzleForNumber(n, bank);
    const day = store.day(n);
    const state = day.isSolved ? 'solved' : day.attempts.length > 0 ? 'tried' : 'not played';
    const link = el(
      'a',
      { href: `#/${n}`, ...(n === currentNumber ? { 'aria-current': 'page' } : {}) },
      el('span', { class: 'archive-number' }, `#${n}`),
      el('span', { class: 'archive-title' }, puzzle.title),
      el('span', { class: `badge ${puzzle.difficulty}` }, puzzle.difficulty),
      el('span', { class: `archive-state ${state.replace(' ', '-')}` }, state),
    );
    items.push(
      el(
        'li',
        { value: String(n) },
        el('time', { datetime: dateOfPuzzle(n) }, dateOfPuzzle(n)),
        link,
      ),
    );
  }
  target.replaceChildren(...items);
}

/** Played, solved and streak numbers. */
export function renderStats(target: HTMLElement, stats: Stats): void {
  const entries: [string, number][] = [
    ['Played', stats.played],
    ['Solved', stats.solved],
    ['Current streak', stats.currentStreak],
    ['Best streak', stats.maxStreak],
  ];
  target.replaceChildren(
    ...entries.map(([label, value]) =>
      el('div', {}, el('dt', {}, label), el('dd', {}, String(value))),
    ),
  );
}
