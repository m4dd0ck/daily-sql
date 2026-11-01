import { describe, expect, it } from 'vitest';
import { attemptKindOf, describeOutcome } from '../src/ui/feedback.ts';
import { formatCell, parseProse } from '../src/ui/text.ts';

describe('parseProse', () => {
  it('splits paragraphs on blank lines and joins wrapped lines', () => {
    expect(parseProse('one\ntwo\n\nthree')).toEqual([
      [{ text: 'one two', isCode: false }],
      [{ text: 'three', isCode: false }],
    ]);
  });

  it('marks backtick spans as code', () => {
    expect(parseProse('Use `count(*)` here')).toEqual([
      [
        { text: 'Use ', isCode: false },
        { text: 'count(*)', isCode: true },
        { text: ' here', isCode: false },
      ],
    ]);
  });
});

describe('formatCell', () => {
  it('shows NULL, trims float noise and keeps text', () => {
    expect(formatCell(null)).toBe('NULL');
    expect(formatCell(0.1 + 0.2)).toBe('0.3');
    expect(formatCell('<b>')).toBe('<b>');
  });
});

describe('describeOutcome', () => {
  it('names the row and both values when values differ', () => {
    const message = describeOutcome(
      { kind: 'values', rowIndex: 1, expected: ['Brooklyn', 17.72], actual: ['Brooklyn', 25.17] },
      true,
      2,
    );
    expect(message).toBe(
      'Right shape, wrong values. Row 2 differs: expected (Brooklyn, 17.72), got (Brooklyn, 25.17).',
    );
  });

  it('counts attempts when solved', () => {
    expect(describeOutcome({ kind: 'solved' }, false, 1)).toBe('Solved in 1 attempt.');
  });

  it('reports row counts', () => {
    expect(describeOutcome({ kind: 'rows', expected: 17, actual: 0 }, false, 1)).toContain(
      'expected 17 rows and got 0',
    );
  });

  it('maps shape problems to a red square and value problems to yellow', () => {
    expect(attemptKindOf({ kind: 'rows', expected: 1, actual: 2 })).toBe('shape');
    expect(attemptKindOf({ kind: 'values', rowIndex: 0, expected: [], actual: null })).toBe(
      'values',
    );
  });
});
