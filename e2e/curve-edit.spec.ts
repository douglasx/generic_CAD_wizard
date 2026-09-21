import { expect, test, type Page } from '@playwright/test';

/** F-01 slice 7 — TRIM, EXTEND, OFFSET (REQ-003.6). */

type Ent = Record<string, unknown> & { kind: string; start?: number[]; end?: number[]; radius?: number; startAngle?: number; endAngle?: number };
type Doc = { entities: Record<string, Ent>; order: string[] };
type Hook = { doc(): Doc; toScreen(x: number, y: number): [number, number] };

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
}
async function type(page: Page, ...entries: string[]) {
  for (const e of entries) {
    if (e) await page.keyboard.type(e);
    await page.keyboard.press('Enter');
  }
}
const scr = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => (window as unknown as { __cadw: Hook }).__cadw.toScreen(a!, b!), [x, y]);
const ents = async (page: Page) => {
  const d = await page.evaluate(() => (window as unknown as { __cadw: Hook }).__cadw.doc());
  return d.order.map((id) => d.entities[id]!);
};
async function clickAt(page: Page, x: number, y: number) {
  const [sx, sy] = await scr(page, x, y);
  await page.mouse.move(sx, sy);
  await page.mouse.click(sx, sy);
}

test('TRIM the middle of a line between two others, then undo', async ({ page }) => {
  await ready(page);
  await type(page, 'L', '-150,0', '150,0', '');
  await type(page, 'L', '-50,-60', '-50,60', '');
  await type(page, 'L', '50,-60', '50,60', '');
  await type(page, 'TR');
  await clickAt(page, 0, 0);
  await type(page, '');
  const horizontals = (await ents(page)).filter((e) => e.start![1] === 0 && e.end![1] === 0);
  expect(horizontals.map((e) => [e.start![0], e.end![0]]).sort((a, b) => a[0]! - b[0]!)).toEqual([[-150, -50], [50, 150]]);
  await page.keyboard.press('Control+z');
  expect(await ents(page)).toHaveLength(3);
});

test('TRIM a circle with a line leaves an arc', async ({ page }) => {
  await ready(page);
  await type(page, 'C', '0,0', '80');
  await type(page, 'L', '-120,0', '120,0', '');
  await type(page, 'TR');
  await clickAt(page, 0, 80);
  await type(page, '');
  const arc = (await ents(page)).find((e) => e.kind === 'arc');
  expect(arc).toBeTruthy();
});

test('EXTEND a line to a boundary', async ({ page }) => {
  await ready(page);
  await type(page, 'L', '-100,0', '0,0', '');
  await type(page, 'L', '120,-50', '120,50', '');
  await type(page, 'EX');
  await clickAt(page, -8, 0);
  await type(page, '');
  expect((await ents(page))[0]!.end).toEqual([120, 0, 0]);
});

test('OFFSET a rectangle outward and a circle inward', async ({ page }) => {
  await ready(page);
  await type(page, 'PL', '-100,-50', '100,-50', '100,50', '-100,50', 'C');
  await type(page, 'C', '250,0', '60');
  await type(page, 'O', '10');
  await clickAt(page, 0, -50);
  await clickAt(page, 0, -150);
  await clickAt(page, 310, 0);
  await clickAt(page, 250, 0);
  await type(page, '');
  const all = await ents(page);
  expect(all).toHaveLength(4);
  const pl = all[2]!;
  const [x0, y0] = (pl.points as number[][])[0]!;
  expect(x0).toBeCloseTo(-110, 9);
  expect(y0).toBeCloseTo(-60, 9);
  expect(all[3]!.radius).toBe(50);
});
