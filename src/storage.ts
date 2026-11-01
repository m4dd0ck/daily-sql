import type { AttemptKind } from './share.ts';

/** What is kept for one puzzle number. */
export interface DayRecord {
  attempts: AttemptKind[];
  hintsUsed: number;
  isSolved: boolean;
  /** Solved on the puzzle's own calendar day; only these count toward the streak. */
  isSolvedOnDay: boolean;
}

export interface Stats {
  played: number;
  solved: number;
  currentStreak: number;
  maxStreak: number;
}

/** The subset of the Web Storage API used here, so tests can pass a fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const HISTORY_KEY = 'daily-sql:history:v1';
const THEME_KEY = 'daily-sql:theme';

export type ThemeChoice = 'light' | 'dark' | 'system';

function emptyDay(): DayRecord {
  return { attempts: [], hintsUsed: 0, isSolved: false, isSolvedOnDay: false };
}

function isDayRecord(value: unknown): value is DayRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.attempts) &&
    typeof record.hintsUsed === 'number' &&
    typeof record.isSolved === 'boolean' &&
    typeof record.isSolvedOnDay === 'boolean'
  );
}

/**
 * History, streak and theme, kept in localStorage when it works and in memory when it does not.
 *
 * Every read and write is wrapped: private windows, blocked site data and quota errors all
 * throw from localStorage, and none of them may stop the puzzle from working.
 */
export class ProgressStore {
  private readonly days = new Map<number, DayRecord>();
  private theme: ThemeChoice = 'system';
  private persistent: boolean;
  private readonly backend: KeyValueStore | null;

  constructor(backend: KeyValueStore | null) {
    this.backend = backend;
    this.persistent = backend !== null;
    this.load();
  }

  /** False once storage has failed; the page tells the visitor progress will not be kept. */
  get isPersistent(): boolean {
    return this.persistent;
  }

  private load(): void {
    const raw = this.read(HISTORY_KEY);
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (typeof parsed === 'object' && parsed !== null) {
          for (const [key, value] of Object.entries(parsed)) {
            const puzzleNumber = Number(key);
            if (Number.isInteger(puzzleNumber) && isDayRecord(value))
              this.days.set(puzzleNumber, value);
          }
        }
      } catch {
        // Reason: a corrupt entry is dropped rather than blocking the page; the next save rewrites it.
      }
    }
    const theme = this.read(THEME_KEY);
    if (theme === 'light' || theme === 'dark' || theme === 'system') this.theme = theme;
  }

  private read(key: string): string | null {
    if (!this.backend) return null;
    try {
      return this.backend.getItem(key);
    } catch {
      this.persistent = false;
      return null;
    }
  }

  private write(key: string, value: string): void {
    if (!this.backend || !this.persistent) return;
    try {
      this.backend.setItem(key, value);
    } catch {
      this.persistent = false;
    }
  }

  private save(): void {
    this.write(HISTORY_KEY, JSON.stringify(Object.fromEntries(this.days)));
  }

  /** The record for a puzzle number (a fresh empty one if never played). */
  day(puzzleNumber: number): DayRecord {
    const record = this.days.get(puzzleNumber);
    return record ? { ...record, attempts: [...record.attempts] } : emptyDay();
  }

  /** Every puzzle number with a record. */
  playedNumbers(): number[] {
    return [...this.days.keys()].sort((a, b) => a - b);
  }

  /**
   * Record a submission. Ignored once the puzzle is solved, so the share string stops at the win.
   *
   * Args:
   *   puzzleNumber: the puzzle submitted to.
   *   kind: how the submission went.
   *   isToday: the puzzle is today's, so a solve counts toward the streak.
   */
  recordAttempt(puzzleNumber: number, kind: AttemptKind, isToday: boolean): DayRecord {
    const record = this.day(puzzleNumber);
    if (record.isSolved) return record;
    record.attempts.push(kind);
    if (kind === 'solved') {
      record.isSolved = true;
      record.isSolvedOnDay = isToday;
    }
    this.days.set(puzzleNumber, record);
    this.save();
    return record;
  }

  /** Count one more hint revealed for a puzzle. */
  recordHint(puzzleNumber: number): DayRecord {
    const record = this.day(puzzleNumber);
    record.hintsUsed += 1;
    this.days.set(puzzleNumber, record);
    this.save();
    return record;
  }

  /**
   * Played/solved counts and streaks as of today's puzzle number.
   *
   * The current streak counts back from today, or from yesterday when today is not solved yet,
   * over puzzles solved on their own day. Archive solves never count.
   */
  stats(todayNumber: number): Stats {
    const isOnDay = (n: number): boolean => this.days.get(n)?.isSolvedOnDay === true;
    let maxStreak = 0;
    let run = 0;
    for (let n = 1; n <= todayNumber; n += 1) {
      run = isOnDay(n) ? run + 1 : 0;
      maxStreak = Math.max(maxStreak, run);
    }
    let currentStreak = 0;
    for (
      let n = isOnDay(todayNumber) ? todayNumber : todayNumber - 1;
      n >= 1 && isOnDay(n);
      n -= 1
    ) {
      currentStreak += 1;
    }
    const records = [...this.days.values()];
    return {
      played: records.filter((r) => r.attempts.length > 0).length,
      solved: records.filter((r) => r.isSolved).length,
      currentStreak,
      maxStreak,
    };
  }

  get themeChoice(): ThemeChoice {
    return this.theme;
  }

  set themeChoice(choice: ThemeChoice) {
    this.theme = choice;
    this.write(THEME_KEY, choice);
  }
}

/** window.localStorage, or null when even touching it throws. */
export function browserStorage(): KeyValueStore | null {
  try {
    const storage = window.localStorage;
    const probe = 'daily-sql:probe';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}
