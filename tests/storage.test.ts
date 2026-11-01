import { describe, expect, it } from 'vitest';
import { ProgressStore, type KeyValueStore } from '../src/storage.ts';

class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

class BrokenStore implements KeyValueStore {
  getItem(): string | null {
    throw new Error('SecurityError');
  }
  setItem(): void {
    throw new Error('QuotaExceededError');
  }
}

describe('ProgressStore', () => {
  it('keeps attempts across instances when storage works', () => {
    const backend = new MemoryStore();
    new ProgressStore(backend).recordAttempt(3, 'values', true);
    expect(new ProgressStore(backend).day(3).attempts).toEqual(['values']);
  });

  it('works in memory when storage throws, and says so', () => {
    const store = new ProgressStore(new BrokenStore());
    store.recordAttempt(1, 'solved', true);
    expect(store.day(1).isSolved).toBe(true);
    expect(store.isPersistent).toBe(false);
  });

  it('works with no storage at all', () => {
    const store = new ProgressStore(null);
    store.recordHint(4);
    expect(store.day(4).hintsUsed).toBe(1);
  });

  it('stops recording attempts once solved', () => {
    const store = new ProgressStore(null);
    store.recordAttempt(1, 'shape', true);
    store.recordAttempt(1, 'solved', true);
    store.recordAttempt(1, 'values', true);
    expect(store.day(1).attempts).toEqual(['shape', 'solved']);
  });

  it('ignores a corrupt history entry instead of failing', () => {
    const backend = new MemoryStore();
    backend.setItem('daily-sql:history:v1', '{not json');
    expect(new ProgressStore(backend).playedNumbers()).toEqual([]);
  });

  it('drops records with the wrong shape', () => {
    const backend = new MemoryStore();
    backend.setItem(
      'daily-sql:history:v1',
      JSON.stringify({
        1: { attempts: 'x' },
        2: { attempts: [], hintsUsed: 0, isSolved: false, isSolvedOnDay: false },
      }),
    );
    expect(new ProgressStore(backend).playedNumbers()).toEqual([2]);
  });

  it('remembers the theme choice', () => {
    const backend = new MemoryStore();
    new ProgressStore(backend).themeChoice = 'dark';
    expect(new ProgressStore(backend).themeChoice).toBe('dark');
  });
});

describe('stats', () => {
  function solvedOn(numbers: number[], isToday = true): ProgressStore {
    const store = new ProgressStore(null);
    for (const n of numbers) store.recordAttempt(n, 'solved', isToday);
    return store;
  }

  it('counts the current streak back from today', () => {
    expect(solvedOn([3, 4, 5]).stats(5).currentStreak).toBe(3);
  });

  it('keeps yesterday’s streak alive until today is played', () => {
    expect(solvedOn([3, 4]).stats(5).currentStreak).toBe(2);
  });

  it('breaks the streak on a missed day and keeps the best one', () => {
    const stats = solvedOn([1, 2, 3, 5, 6]).stats(6);
    expect(stats.currentStreak).toBe(2);
    expect(stats.maxStreak).toBe(3);
  });

  it('does not count archive solves toward the streak', () => {
    const stats = solvedOn([4, 5], false).stats(5);
    expect(stats.currentStreak).toBe(0);
    expect(stats.solved).toBe(2);
  });

  it('counts played puzzles including unsolved ones', () => {
    const store = new ProgressStore(null);
    store.recordAttempt(1, 'shape', true);
    store.recordAttempt(2, 'solved', true);
    expect(store.stats(2)).toMatchObject({ played: 2, solved: 1 });
  });
});
