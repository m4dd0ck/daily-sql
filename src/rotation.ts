/** Puzzle days roll over at midnight in New York, where most of the data comes from. */
export const PUZZLE_TIME_ZONE = 'America/New_York';
/** The calendar date of puzzle #1. */
export const LAUNCH_DATE = '2026-11-01';

const DAY_MS = 86_400_000;

/** The calendar date (YYYY-MM-DD) an instant falls on in a time zone. */
export function calendarDate(instant: Date, timeZone: string = PUZZLE_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function utcDays(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Not a YYYY-MM-DD date: ${isoDate}`);
  }
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

/** Puzzle number for a calendar date; dates before launch get #1. */
export function puzzleNumberOn(isoDate: string): number {
  return Math.max(1, utcDays(isoDate) - utcDays(LAUNCH_DATE) + 1);
}

/** Today's puzzle number in the puzzle time zone. */
export function todaysPuzzleNumber(now: Date = new Date()): number {
  return puzzleNumberOn(calendarDate(now));
}

/** The calendar date a puzzle number belongs to. */
export function dateOfPuzzle(puzzleNumber: number): string {
  return new Date((utcDays(LAUNCH_DATE) + puzzleNumber - 1) * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The bank entry for a puzzle number: in order, then from the start again once the bank is used up.
 *
 * Raises:
 *   Error: the bank is empty or the number is below 1.
 */
export function puzzleForNumber<T>(puzzleNumber: number, bank: readonly T[]): T {
  if (!Number.isInteger(puzzleNumber) || puzzleNumber < 1) {
    throw new Error(`Puzzle numbers start at 1, got ${puzzleNumber}`);
  }
  const entry = bank[(puzzleNumber - 1) % bank.length];
  if (entry === undefined) throw new Error('The puzzle bank is empty');
  return entry;
}
