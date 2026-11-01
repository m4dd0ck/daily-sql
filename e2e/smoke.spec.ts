import { expect, test, type Page } from '@playwright/test';
import { loadPuzzlesFromDisk } from '../src/puzzles/load-node.ts';
import { dateOfPuzzle, puzzleForNumber, todaysPuzzleNumber } from '../src/rotation.ts';

const bank = loadPuzzlesFromDisk();

async function typeQuery(page: Page, sql: string): Promise<void> {
  const editor = page.getByRole('textbox', { name: 'SQL editor' });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  // Reason: insertText bypasses auto-closing brackets, so the text lands exactly as written.
  await page.keyboard.insertText(sql);
}

async function waitUntilReady(page: Page): Promise<void> {
  await expect(page.locator('#engine-status')).toHaveText('Ready.');
}

test('solves today’s puzzle with its reference SQL', async ({ page }) => {
  const today = puzzleForNumber(todaysPuzzleNumber(), bank);
  await page.goto('./');
  await expect(page.locator('#puzzle-title')).toHaveText(today.title);
  await waitUntilReady(page);
  await typeQuery(page, today.referenceSql);
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.locator('#feedback')).toHaveText(/^Solved in 1 attempt\./);
  await expect(page.locator('#share-preview')).toContainText(`Daily SQL #${todaysPuzzleNumber()}`);
  await expect(page.locator('#share-preview')).toContainText('🟩');
});

test('a wrong answer gets feedback and a square, then the right one solves it', async ({
  page,
}) => {
  const fanOut = bank.find((p) => p.slug === 'average-score-without-fan-out');
  if (!fanOut) throw new Error('puzzle missing');
  // Reason: archive links only reach puzzles up to today, so move the page's clock forward.
  await page.clock.setFixedTime(new Date(`${dateOfPuzzle(fanOut.id + 5)}T12:00:00-05:00`));
  await page.goto(`./#/${fanOut.id}`);
  await expect(page.locator('#puzzle-title')).toHaveText(fanOut.title);
  await waitUntilReady(page);
  await typeQuery(
    page,
    "SELECT boro, round(avg(score), 2) FROM inspections WHERE boro <> '0' GROUP BY boro",
  );
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.locator('#feedback')).toContainText('Right shape, wrong values');
  await typeQuery(page, fanOut.referenceSql);
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.locator('#feedback')).toHaveText(/^Solved in 2 attempts\./);
  await expect(page.locator('#share-preview')).toContainText('🟨🟩');
});

test('shows the result of Run without grading it', async ({ page }) => {
  await page.goto('./');
  await waitUntilReady(page);
  await typeQuery(page, 'SELECT * FROM range(1000) t(i)');
  await page.getByRole('button', { name: 'Run' }).click();
  await expect(page.locator('#result-summary')).toHaveText('1000 rows; showing the first 200.');
  await expect(page.locator('#result-table tbody tr')).toHaveCount(200);
  await expect(page.locator('#feedback')).toBeHidden();
});

test('reports SQL errors', async ({ page }) => {
  await page.goto('./');
  await waitUntilReady(page);
  await typeQuery(page, 'SELECT nope FROM inspections');
  await page.getByRole('button', { name: 'Run' }).click();
  await expect(page.locator('#feedback')).toContainText('nope');
});

test('works when localStorage throws', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('SecurityError');
      },
    });
  });
  await page.goto('./');
  await expect(page.locator('#storage-note')).toContainText('progress lasts for this visit only');
  await waitUntilReady(page);
});

test('lists past puzzles in the archive', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page.locator('#archive-list li')).toHaveCount(todaysPuzzleNumber());
});

test('sends a link to a future puzzle to today’s', async ({ page }) => {
  await page.goto(`./#/${todaysPuzzleNumber() + 3}`);
  await expect(page.locator('#puzzle-title')).toHaveText(
    puzzleForNumber(todaysPuzzleNumber(), bank).title,
  );
});

test('solves every puzzle in the bank with its reference SQL in the browser engine', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser run is enough');
  await page.clock.setFixedTime(new Date(`${dateOfPuzzle(bank.length)}T12:00:00-05:00`));
  for (const puzzle of bank) {
    await page.goto(`./#/${puzzle.id}`);
    await expect(page.locator('#puzzle-title')).toHaveText(puzzle.title);
    await waitUntilReady(page);
    await typeQuery(page, puzzle.referenceSql);
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.locator('#feedback'), puzzle.slug).toHaveText(/^Solved in 1 attempt\./);
  }
});

test('stops a runaway query and keeps working afterwards', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser run is enough');
  await page.goto('./');
  await waitUntilReady(page);
  await typeQuery(page, 'SELECT sum(a.i * b.i) FROM range(1000000) a(i), range(1000000) b(i)');
  await page.getByRole('button', { name: 'Run' }).click();
  await expect(page.locator('#feedback')).toContainText('Query stopped after 15 s', {
    timeout: 40_000,
  });
  await typeQuery(page, 'SELECT count(*) AS n FROM service_requests');
  await page.getByRole('button', { name: 'Run' }).click();
  await expect(page.locator('#result-summary')).toHaveText('1 row.');
});
