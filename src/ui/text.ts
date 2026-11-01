import type { Cell } from '../grading/result.ts';

/** A run of prompt text, either plain or inside `backticks`. */
export interface TextSegment {
  text: string;
  isCode: boolean;
}

/** Split prompt prose into paragraphs (blank-line separated) of plain and `code` segments. */
export function parseProse(source: string): TextSegment[][] {
  return source
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .replace(/\s*\n\s*/g, ' ')
        .split('`')
        .map((text, index) => ({ text, isCode: index % 2 === 1 }))
        .filter((segment) => segment.text !== ''),
    );
}

/** How a cell is shown in the result table and in feedback. */
export function formatCell(cell: Cell): string {
  if (cell === null) return 'NULL';
  if (typeof cell === 'number') {
    // Reason: hide float noise such as 0.30000000000000004 without hiding real precision.
    return Number.isFinite(cell) ? String(Number(cell.toPrecision(12))) : String(cell);
  }
  return String(cell);
}

/** A row as one line, e.g. (Brooklyn, 17.72, NULL). */
export function formatRow(row: readonly Cell[]): string {
  return `(${row.map(formatCell).join(', ')})`;
}
