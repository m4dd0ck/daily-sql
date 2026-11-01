import { z } from 'zod';
import { TABLE_NAMES } from '../datasets.ts';
import type { GradingRules } from '../grading/compare.ts';

export const SKILLS = [
  'aggregation',
  'anti-join',
  'cohort',
  'date-bucketing',
  'date-parsing',
  'dedup',
  'fan-out',
  'gaps-islands',
  'late-arriving',
  'null-handling',
  'pivot',
  'running-total',
  'scd',
  'string-cleanup',
  'top-n',
  'window',
] as const;

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

const text = z.string().trim().min(1);

/** One puzzle file as written in puzzles/*.yaml. */
export const puzzleFileSchema = z.strictObject({
  id: z.int().positive(),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be kebab-case'),
  title: text,
  difficulty: z.enum(DIFFICULTIES),
  datasets: z.array(z.enum(TABLE_NAMES)).min(1),
  skills: z.array(z.enum(SKILLS)).min(1),
  prompt: text,
  hints: z.array(text).min(1),
  reference_sql: text,
  grading: z.strictObject({
    ordered: z.boolean(),
    tolerance: z.number().nonnegative().default(1e-6),
    column_names: z.enum(['ignore', 'match']).default('ignore'),
  }),
  explanation: text,
});

export type PuzzleFile = z.input<typeof puzzleFileSchema>;

/** A validated puzzle, as the app and tests use it. */
export interface Puzzle {
  id: number;
  slug: string;
  title: string;
  difficulty: (typeof DIFFICULTIES)[number];
  datasets: (typeof TABLE_NAMES)[number][];
  skills: (typeof SKILLS)[number][];
  prompt: string;
  hints: string[];
  referenceSql: string;
  grading: GradingRules;
  explanation: string;
}

/**
 * Validate one parsed puzzle file.
 *
 * Raises:
 *   Error: naming the source and every schema problem in it.
 */
export function parsePuzzle(data: unknown, source: string): Puzzle {
  const result = puzzleFileSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`${source}: invalid puzzle\n${z.prettifyError(result.error)}`);
  }
  const file = result.data;
  return {
    id: file.id,
    slug: file.slug,
    title: file.title,
    difficulty: file.difficulty,
    datasets: file.datasets,
    skills: file.skills,
    prompt: file.prompt,
    hints: file.hints,
    referenceSql: file.reference_sql,
    grading: {
      isOrdered: file.grading.ordered,
      tolerance: file.grading.tolerance,
      columnNames: file.grading.column_names,
    },
    explanation: file.explanation,
  };
}

/**
 * Validate the whole bank: ids unique, contiguous from 1, and matching the file name.
 *
 * Args:
 *   entries: [file name, parsed YAML] pairs.
 *
 * Returns:
 *   Puzzles sorted by id (the schedule order).
 */
export function parseBank(entries: readonly (readonly [string, unknown])[]): Puzzle[] {
  const puzzles = entries.map(([source, data]) => {
    const puzzle = parsePuzzle(data, source);
    const expectedName = `${String(puzzle.id).padStart(3, '0')}-${puzzle.slug}.yaml`;
    if (!source.endsWith(expectedName)) {
      throw new Error(`${source}: file name should be ${expectedName}`);
    }
    return puzzle;
  });
  puzzles.sort((a, b) => a.id - b.id);
  puzzles.forEach((puzzle, index) => {
    if (puzzle.id !== index + 1) {
      throw new Error(`Puzzle ids must run 1..n without gaps; found ${puzzle.id} at position ${index + 1}`);
    }
  });
  return puzzles;
}
