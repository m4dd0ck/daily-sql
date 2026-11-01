import { describe, expect, it } from 'vitest';
import { attemptSquares, buildShareText } from '../src/share.ts';

const url = 'https://m4dd0ck.github.io/daily-sql/';

describe('buildShareText', () => {
  it('shows number, difficulty, one square per attempt and the link', () => {
    const text = buildShareText({
      puzzleNumber: 14,
      difficulty: 'medium',
      attempts: ['shape', 'values', 'solved'],
      hintsUsed: 0,
      url,
    });
    expect(text).toBe(`Daily SQL #14 (medium)\n🟥🟨🟩 solved in 3\n${url}`);
  });

  it('mentions hints only when used', () => {
    const text = buildShareText({
      puzzleNumber: 2,
      difficulty: 'easy',
      attempts: ['solved'],
      hintsUsed: 2,
      url,
    });
    expect(text.split('\n')).toContain('💡 2 hints');
  });

  it('says not solved when there is no green square', () => {
    const text = buildShareText({
      puzzleNumber: 3,
      difficulty: 'hard',
      attempts: ['error'],
      hintsUsed: 0,
      url,
    });
    expect(text).toContain('⬛ not solved yet, 1 tried');
  });

  it('never contains the answer or the SQL', () => {
    const text = buildShareText({
      puzzleNumber: 5,
      difficulty: 'hard',
      attempts: ['values', 'solved'],
      hintsUsed: 1,
      url,
    });
    expect(text).not.toMatch(/select|from|where/i);
  });
});

describe('attemptSquares', () => {
  it('caps the squares at twelve and counts the rest', () => {
    const squares = attemptSquares(Array.from({ length: 15 }, () => 'shape' as const));
    expect(squares).toBe(`${'🟥'.repeat(12)} +3`);
  });
});
