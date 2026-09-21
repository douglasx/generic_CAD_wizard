import { expect, test, type Page } from '@playwright/test';

/** F-01 slice 2 — command line and typed coordinates (REQ-003.2, REQ-003.9). */

type Doc = { entities: Record<string, { kind: string; start?: number[]; end?: number[]; points?: number[][]; closed?: boolean }>; order: string[] };

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
}

/** Type into the page the way a user would: keystrokes anywhere reach the command line. */
async function type(page: Page, ...entries: string[]) {
  for (const e of entries) {
    if (e) await page.keyboard.type(e);
    await page.keyboard.press('Enter');
  }
}

const doc = (page: Page) => page.evaluate(() => (window as unknown as { __cadw: { doc(): Doc } }).__cadw.doc());

test('draws lines entirely from the keyboard with absolute, relative and polar input', async ({ page }) => {
  await ready(page);
  await page.getByTestId('viewport').click({ position: { x: 5, y: 5 } }); // focus the page, not the input
  await page.keyboard.press('Escape');
  await type(page, 'L');
  await expect(page.getByTestId('command-prompt')).toHaveText('LINE Specify first point:');
  await type(page, '0,0', '@100,0', '@50<90', 'c');
  await expect(page.getByTestId('entity-count')).toHaveText('3 entities');
  await expect(page.getByTestId('command-prompt')).toHaveText('Command:');

  const d = await doc(page);
  const lines = d.order.map((id) => d.entities[id]!);
  expect(lines[0]).toMatchObject({ kind: 'line', start: [0, 0, 0], end: [100, 0, 0] });
  expect(lines[1]!.end![0]).toBeCloseTo(100, 9);
  expect(lines[1]!.end![1]).toBeCloseTo(50, 9);
  expect(lines[2]!.end).toEqual([0, 0, 0]);
});

test('polyline by keyboard, then Enter repeats the command, Esc cancels', async ({ page }) => {
  await ready(page);
  await type(page, 'PL', '0,0', '200,0', '200,100', '0,100', 'C');
  await expect(page.getByTestId('entity-count')).toHaveText('1 entities');
  const d = await doc(page);
  expect(d.entities[d.order[0]!]).toMatchObject({ kind: 'polyline', closed: true });

  await type(page, ''); // Enter at the idle prompt repeats PLINE
  await expect(page.getByTestId('command-prompt')).toHaveText('PLINE Specify start point:');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('command-prompt')).toHaveText('Command:');
  await expect(page.getByTestId('command-log')).toContainText('*Cancel*');
});

test('mouse and keyboard mix: click the first point, type the rest', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Line', exact: true }).click();
  const box = (await page.getByTestId('viewport').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await type(page, '@250,0', '');
  await expect(page.getByTestId('entity-count')).toHaveText('1 entities');
  const d = await doc(page);
  const l = d.entities[d.order[0]!]!;
  expect(l.end![0]! - l.start![0]!).toBeCloseTo(250, 9);
  expect(l.end![1]! - l.start![1]!).toBeCloseTo(0, 9);
});

test('shows errors for unknown commands and bad coordinates', async ({ page }) => {
  await ready(page);
  await type(page, 'FOO');
  await expect(page.getByTestId('command-log')).toContainText('Unknown command "FOO"');
  await type(page, 'L', '10,,5');
  await expect(page.getByTestId('command-log')).toContainText('Invalid input: 10,,5');
  await expect(page.getByTestId('entity-count')).toHaveText('0 entities');
});

test('U at the prompt undoes; Up arrow recalls earlier input', async ({ page }) => {
  await ready(page);
  await type(page, 'L', '0,0', '10,0', '');
  await expect(page.getByTestId('entity-count')).toHaveText('1 entities');
  await type(page, 'U');
  await expect(page.getByTestId('entity-count')).toHaveText('0 entities');
  await page.getByTestId('command-input').focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('command-input')).toHaveValue('U');
});
