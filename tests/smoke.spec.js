// smoke.spec.js — tool-specific checks for Regex Tester with Explanation.
// Fixtures: tests/fixtures/support-log.txt (fictional, written by tests/make-fixtures.js) and sample.png (wrong type).
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const fixture = (name) => path.join(__dirname, 'fixtures', name);
const LOG = fs.readFileSync(fixture('support-log.txt'), 'utf8');

async function open(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('./');
  await expect(page.locator('#match-count')).toBeVisible();
  return errors;
}

async function setPattern(page, pattern, flags) {
  if (flags !== undefined) {
    for (const f of ['g', 'i', 'm', 's', 'u', 'y']) await page.locator(`#flag-${f}`).setChecked(flags.includes(f));
  }
  await page.fill('#pattern', pattern);
}

test.describe('Regex Tester with Explanation', () => {
  test('digits with the g flag highlight every number in the sample text', async ({ page }) => {
    const errors = await open(page);
    await expect(page.locator('#flag-g')).toBeChecked();
    const sample = await page.inputValue('#text');
    expect(sample).toBe(LOG); // the preloaded sample is the fixture text
    const expected = sample.match(/\d+/g);
    await setPattern(page, '\\d+', 'g');
    await expect(page.locator('#match-count')).toHaveText(`${expected.length} matches`);
    const marks = page.locator('#highlights mark.hl-m:not(.hl-zero)');
    await expect(marks).toHaveCount(expected.length);
    expect(await marks.allTextContents()).toEqual(expected);
    // Alternating colors.
    await expect(page.locator('#highlights mark.hl-m0')).toHaveCount(Math.ceil(expected.length / 2));
    await expect(page.locator('#highlights mark.hl-m1')).toHaveCount(Math.floor(expected.length / 2));
    expect(errors).toEqual([]);
  });

  test('capture groups are listed per match with index and value', async ({ page }) => {
    await open(page);
    await setPattern(page, 'order (\\d+) shipped to (?<name>\\w+ \\w+)', 'g');
    const rows = page.locator('#match-table tbody tr');
    await expect(rows).toHaveCount(2);
    const first = rows.nth(0);
    await expect(first.locator('.rx-index')).toHaveText(String(LOG.indexOf('order 4821')));
    await expect(first.locator('.rx-len')).toHaveText(String('order 4821 shipped to Lena Ortiz'.length));
    await expect(first.locator('.rx-text')).toHaveText('order 4821 shipped to Lena Ortiz');
    const groups = first.locator('.rx-groups li');
    await expect(groups.nth(0)).toContainText('$1');
    await expect(groups.nth(0)).toContainText('4821');
    const g1Start = LOG.indexOf('4821');
    await expect(groups.nth(0).locator('.rx-pos')).toHaveText(`${g1Start}–${g1Start + 4}`);
    await expect(groups.nth(1)).toContainText('Lena Ortiz');
    await expect(groups.nth(2)).toContainText('name');
    await expect(groups.nth(2)).toContainText('Lena Ortiz');
    await expect(rows.nth(1).locator('.rx-groups li').nth(0)).toContainText('4830');
    // Groups are underlined inside the highlighted match.
    await expect(page.locator('#highlights .hl-g').first()).toHaveText('4821');
  });

  test('replace with group references produces the replaced text and a real download', async ({ page }) => {
    await open(page);
    await setPattern(page, '(\\d{4})-(\\d{2})-(\\d{2})', 'g');
    await page.fill('#replace', '$3.$2.$1');
    const expected = LOG.replace(/(\d{4})-(\d{2})-(\d{2})/g, '$3.$2.$1');
    await expect(page.locator('#replace-output')).toHaveText(expected);
    await expect(page.locator('#replace-output')).toContainText('[14.03.2026 09:12] order 4821 shipped to Lena Ortiz');

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#download-replaced')]);
    expect(download.suggestedFilename()).toBe('replaced.txt');
    const saved = fs.readFileSync(await download.path(), 'utf8');
    expect(saved).toBe(expected);

    const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#download-csv')]);
    expect(csv.suggestedFilename()).toBe('matches.csv');
    const lines = fs.readFileSync(await csv.path(), 'utf8').trim().split('\r\n');
    expect(lines[0]).toBe('match,index,length,text,group1,group2,group3');
    expect(lines.length).toBe(1 + LOG.match(/\d{4}-\d{2}-\d{2}/g).length);
    expect(lines[1]).toBe(`1,${LOG.indexOf('2026-03-14')},10,2026-03-14,2026,03,14`);
  });

  test('an invalid pattern shows the engine error instead of crashing', async ({ page }) => {
    const errors = await open(page);
    await setPattern(page, 'order (\\d+');
    await expect(page.locator('#pattern-error')).toBeVisible();
    await expect(page.locator('#pattern-error')).toContainText(/Invalid regular expression/i);
    await expect(page.locator('#results .alert.alert--error')).toBeVisible();
    await expect(page.locator('#pattern')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#highlights mark')).toHaveCount(0);
    // The explainer still points at the problem.
    await page.click('#tab-explain');
    await expect(page.locator('#panel-explain .k-error')).toContainText('unclosed group');
    // Fixing it recovers.
    await page.fill('#pattern', 'order (\\d+)');
    await expect(page.locator('#pattern-error')).toBeHidden();
    await expect(page.locator('#match-count')).toHaveText('4 matches');
    expect(errors).toEqual([]);
  });

  test('a catastrophic pattern is stopped by a timeout notice and the page stays responsive', async ({ page }) => {
    await open(page);
    await page.fill('#text', 'a'.repeat(40) + '!');
    const started = Date.now();
    await setPattern(page, '^(a+)+$', 'g');
    await expect(page.locator('#results .alert--warn')).toContainText(/may be too slow/i, { timeout: 5000 });
    expect(Date.now() - started).toBeLessThan(5000);
    // The main thread answers right away and a new pattern works.
    const t0 = Date.now();
    await page.evaluate(() => 1 + 1);
    expect(Date.now() - t0).toBeLessThan(500);
    await page.fill('#pattern', 'a{3}');
    await expect(page.locator('#match-count')).toHaveText('13 matches');
    await expect(page.locator('#results .alert--warn')).toHaveCount(0);
  });

  test('explanation, cheat sheet, ready patterns, zero-length matches and keyboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page);
    await setPattern(page, '^\\[(?<date>[\\d-]+)\\s|ship(?=ped)|x*?', 'gm');
    await page.click('#tab-explain');
    const panel = page.locator('#panel-explain');
    await expect(panel).toContainText('the start of a line (m flag)');
    await expect(panel).toContainText('named "date"');
    await expect(panel).toContainText('lookahead');
    await expect(panel).toContainText('OR:');
    await expect(panel).toContainText('as few as possible (lazy)');
    await expect(panel).toContainText('one character from: a digit (0-9), "-"');
    // Zero-length matches end and render as markers.
    await expect(page.locator('#highlights mark.hl-zero').first()).toBeAttached();

    // Ready pattern with one click.
    await page.getByRole('button', { name: 'Hex colors' }).click();
    await expect(page.locator('#pattern')).toHaveValue('#(?:[0-9a-fA-F]{3}){1,2}\\b');
    await expect(page.locator('#highlights mark.hl-m')).toHaveText(['#3fa7c2', '#f90']);

    // Cheat sheet inserts at the cursor.
    await page.fill('#pattern', 'order ');
    await page.click('#cheat-open');
    await expect(page.locator('#cheat')).toBeVisible();
    await page.locator('#cheat button', { hasText: 'a digit 0-9' }).click();
    await page.locator('#cheat button', { hasText: 'one or more' }).first().click();
    await expect(page.locator('#pattern')).toHaveValue('order \\d+');
    await page.keyboard.press('Escape');
    await expect(page.locator('#cheat')).toBeHidden();

    // Slash focuses the pattern; Ctrl+Enter copies it as a literal.
    await page.locator('h1').click();
    await page.keyboard.press('/');
    await expect(page.locator('#pattern')).toBeFocused();
    await page.keyboard.press('Control+Enter');
    await expect(page.locator('.toast')).toContainText('/order \\d+/g');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('/order \\d+/g');

    // Share link keeps the pattern in the fragment and restores it.
    await page.click('#share');
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toContain('#p=');
    await page.goto(link);
    await page.reload();
    await expect(page.locator('#pattern')).toHaveValue('order \\d+');
    await expect(page.locator('#match-count')).toHaveText('4 matches');
  });

  test('wrong file types are rejected, text files load, long text caps highlights', async ({ page }) => {
    await open(page);
    await page.setInputFiles('#file-input', [fixture('sample.png'), fixture('support-log.txt')]);
    await expect(page.locator('#results .alert--error')).toContainText('sample.png is not a text file');
    await expect(page.locator('#text')).toHaveValue(LOG);
    await page.evaluate(() => {
      const ta = document.getElementById('text');
      ta.value = '7 '.repeat(160_000) + '😀 end';
      ta.dispatchEvent(new Event('input'));
    });
    await setPattern(page, '\\d', 'g');
    await expect(page.locator('#match-count')).toHaveText('160,000 matches');
    await expect(page.locator('#summary')).toContainText('first 2,000');
    await expect(page.locator('#text-hint')).toContainText('only the first 2,000');
    await expect(page.locator('#highlights mark.hl-m')).toHaveCount(2000);
    // Emoji: code units without u, one code point with u.
    await page.fill('#text', 'a😀b');
    await setPattern(page, '.', 'g');
    await expect(page.locator('#match-count')).toHaveText('4 matches');
    await page.locator('#flag-u').check();
    await expect(page.locator('#match-count')).toHaveText('3 matches');
    await expect(page.locator('#match-table .rx-index')).toHaveText(['0', '1', '3']);
    // HTML in the text is escaped, never injected.
    await page.fill('#text', '<img src=x onerror="window.__pwned=1"> <b>bold</b>');
    await setPattern(page, 'b', 'g');
    await expect(page.locator('#highlights img, #highlights b')).toHaveCount(0);
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  });

  test('works at 390px wide', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await setPattern(page, 'order (\\d+) shipped to (?<name>\\w+ \\w+)', 'g');
    await expect(page.locator('#match-table tbody tr')).toHaveCount(2);
    await page.fill('#replace', '$<name> got #$1 and a very long replacement text that must wrap nicely on a phone screen');
    await page.click('#tab-explain');
    await page.click('#cheat-open');
    const box = await page.locator('#cheat').boundingBox();
    expect(Math.round(box.width)).toBe(390);
    expect(Math.round(box.y + box.height)).toBe(844); // bottom sheet
    const widths = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(widths.doc).toBeLessThanOrEqual(widths.win);
    const pattern = await page.locator('#pattern').boundingBox();
    expect(pattern.x + pattern.width).toBeLessThanOrEqual(390);
    // Highlight layer keeps the same size as the textarea.
    const [ta, hl] = await Promise.all([page.locator('#text').boundingBox(), page.locator('#highlights').boundingBox()]);
    expect(Math.abs(ta.y - hl.y)).toBeLessThan(1);
    expect(hl.width).toBeLessThanOrEqual(ta.width);
  });

  test('__demo shows the support log with a finished result', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__demo());
    await expect(page.locator('#match-count')).toHaveText('7 matches');
    await expect(page.locator('#replace-output')).toContainText('14/03/2026 09:12');
  });
});
