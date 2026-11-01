/** How one submission went, which is all the share string reveals. */
export type AttemptKind = 'error' | 'shape' | 'values' | 'solved';

const SQUARES: Record<AttemptKind, string> = {
  error: '⬛',
  shape: '🟥',
  values: '🟨',
  solved: '🟩',
};
const MAX_SQUARES = 12;

export interface ShareInput {
  puzzleNumber: number;
  difficulty: string;
  attempts: readonly AttemptKind[];
  hintsUsed: number;
  url: string;
}

/** The squares line: one per submission, capped so a long struggle stays one line. */
export function attemptSquares(attempts: readonly AttemptKind[]): string {
  const shown = attempts
    .slice(0, MAX_SQUARES)
    .map((kind) => SQUARES[kind])
    .join('');
  const hidden = attempts.length - MAX_SQUARES;
  return hidden > 0 ? `${shown} +${hidden}` : shown;
}

/**
 * The text copied by the share button. It says how it went, never what the answer was.
 *
 * Example:
 *   Daily SQL #14 (medium)
 *   🟥🟨🟩 solved in 3
 *   https://m4dd0ck.github.io/daily-sql/
 */
export function buildShareText(input: ShareInput): string {
  const isSolved = input.attempts.includes('solved');
  const count = input.attempts.length;
  const verdict = isSolved ? `solved in ${count}` : `not solved yet, ${count} tried`;
  const lines = [
    `Daily SQL #${input.puzzleNumber} (${input.difficulty})`,
    `${attemptSquares(input.attempts)} ${verdict}`.trim(),
  ];
  if (input.hintsUsed > 0) {
    lines.push(`💡 ${input.hintsUsed} hint${input.hintsUsed === 1 ? '' : 's'}`);
  }
  lines.push(input.url);
  return lines.join('\n');
}
