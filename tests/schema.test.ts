import { describe, expect, it } from 'vitest';
import { TABLE_NAMES } from '../src/datasets.ts';
import { loadPuzzlesFromDisk } from '../src/puzzles/load-node.ts';
import { DIFFICULTIES, parseBank, parsePuzzle, SKILLS } from '../src/puzzles/schema.ts';

const puzzles = loadPuzzlesFromDisk();

function tablesIn(sql: string): string[] {
  return TABLE_NAMES.filter((table) => new RegExp(`\\b(from|join)\\s+${table}\\b`, 'i').test(sql));
}

describe('puzzle bank', () => {
  it('has at least 30 puzzles', () => {
    expect(puzzles.length).toBeGreaterThanOrEqual(30);
  });

  it('has unique slugs and titles', () => {
    expect(new Set(puzzles.map((p) => p.slug)).size).toBe(puzzles.length);
    expect(new Set(puzzles.map((p) => p.title)).size).toBe(puzzles.length);
  });

  it('has at least five puzzles of each difficulty', () => {
    for (const difficulty of DIFFICULTIES) {
      expect(
        puzzles.filter((p) => p.difficulty === difficulty).length,
        difficulty,
      ).toBeGreaterThanOrEqual(5);
    }
  });

  it('covers every skill at least once', () => {
    const covered = new Set(puzzles.flatMap((p) => p.skills));
    expect(SKILLS.filter((skill) => !covered.has(skill))).toEqual([]);
  });

  it('uses every dataset', () => {
    const used = new Set(puzzles.flatMap((p) => p.datasets));
    expect(TABLE_NAMES.filter((table) => !used.has(table))).toEqual([]);
  });

  it.each(puzzles.map((p) => [p.slug, p] as const))(
    '%s lists exactly the tables its SQL reads',
    (_, puzzle) => {
      expect(tablesIn(puzzle.referenceSql).sort()).toEqual([...puzzle.datasets].sort());
    },
  );

  it.each(puzzles.map((p) => [p.slug, p] as const))(
    '%s has a single-statement reference',
    (_, puzzle) => {
      expect(puzzle.referenceSql.trim().replace(/;\s*$/, '')).not.toContain(';');
    },
  );
});

describe('schema checks', () => {
  const valid = {
    id: 1,
    slug: 'a-puzzle',
    title: 'A puzzle',
    difficulty: 'easy',
    datasets: ['emissions'],
    skills: ['aggregation'],
    prompt: 'Count rows.',
    hints: ['count(*)'],
    reference_sql: 'SELECT count(*) FROM emissions',
    grading: { ordered: false },
    explanation: 'It counts.',
  };

  it('fills grading defaults', () => {
    expect(parsePuzzle(valid, 'x.yaml').grading).toEqual({
      isOrdered: false,
      tolerance: 1e-6,
      columnNames: 'ignore',
    });
  });

  it('rejects an unknown dataset', () => {
    expect(() => parsePuzzle({ ...valid, datasets: ['payroll'] }, 'x.yaml')).toThrow(
      'x.yaml: invalid puzzle',
    );
  });

  it('rejects unknown keys, so a typo is not silently ignored', () => {
    expect(() => parsePuzzle({ ...valid, hint: 'typo' }, 'x.yaml')).toThrow();
  });

  it('rejects a puzzle with no hints', () => {
    expect(() => parsePuzzle({ ...valid, hints: [] }, 'x.yaml')).toThrow();
  });

  it('rejects a gap in the ids', () => {
    expect(() => parseBank([['002-a-puzzle.yaml', { ...valid, id: 2 }]])).toThrow('without gaps');
  });

  it('rejects a file name that does not match id and slug', () => {
    expect(() => parseBank([['001-other.yaml', valid]])).toThrow(
      'file name should be 001-a-puzzle.yaml',
    );
  });
});
