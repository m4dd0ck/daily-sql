import { describe, expect, it } from 'vitest';
import {
  calendarDate,
  dateOfPuzzle,
  LAUNCH_DATE,
  puzzleForNumber,
  puzzleNumberOn,
  todaysPuzzleNumber,
} from '../src/rotation.ts';

describe('calendarDate', () => {
  it('uses New York time, not UTC', () => {
    // 03:00 UTC on 2 Nov is 22:00 on 1 Nov in New York (UTC-5: daylight saving time ended on 1 Nov).
    expect(calendarDate(new Date('2026-11-02T03:00:00Z'))).toBe('2026-11-01');
    expect(calendarDate(new Date('2026-11-02T05:00:00Z'))).toBe('2026-11-02');
  });

  it('rolls over at New York midnight in winter (UTC-5)', () => {
    expect(calendarDate(new Date('2027-01-15T04:59:59Z'))).toBe('2027-01-14');
    expect(calendarDate(new Date('2027-01-15T05:00:00Z'))).toBe('2027-01-15');
  });

  it('rolls over at New York midnight in summer (UTC-4)', () => {
    expect(calendarDate(new Date('2027-07-01T03:59:59Z'))).toBe('2027-06-30');
    expect(calendarDate(new Date('2027-07-01T04:00:00Z'))).toBe('2027-07-01');
  });
});

describe('puzzleNumberOn', () => {
  it('numbers the launch date 1', () => {
    expect(puzzleNumberOn(LAUNCH_DATE)).toBe(1);
  });

  it('counts calendar days across the end of daylight saving time', () => {
    expect(puzzleNumberOn('2026-11-07')).toBe(7);
    expect(puzzleNumberOn('2026-11-08')).toBe(8);
  });

  it('counts across a leap day', () => {
    expect(puzzleNumberOn('2028-03-01') - puzzleNumberOn('2028-02-28')).toBe(2);
  });

  it('gives puzzle 1 before launch', () => {
    expect(puzzleNumberOn('2026-01-01')).toBe(1);
  });

  it('is the inverse of dateOfPuzzle', () => {
    for (const n of [1, 2, 31, 365, 1000]) expect(puzzleNumberOn(dateOfPuzzle(n))).toBe(n);
  });
});

describe('todaysPuzzleNumber', () => {
  it('is the same for every instant of one New York day', () => {
    const morning = todaysPuzzleNumber(new Date('2026-12-25T05:00:00Z'));
    const night = todaysPuzzleNumber(new Date('2026-12-26T04:59:00Z'));
    expect(morning).toBe(night);
    expect(morning).toBe(puzzleNumberOn('2026-12-25'));
  });
});

describe('puzzleForNumber', () => {
  const bank = ['a', 'b', 'c'];

  it('walks the bank in order and starts again when it runs out', () => {
    expect([1, 2, 3, 4, 7].map((n) => puzzleForNumber(n, bank))).toEqual(['a', 'b', 'c', 'a', 'a']);
  });

  it('rejects numbers below 1 and an empty bank', () => {
    expect(() => puzzleForNumber(0, bank)).toThrow();
    expect(() => puzzleForNumber(1, [])).toThrow('empty');
  });
});
