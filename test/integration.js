import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';
import { chromium } from 'playwright';

const EXTENSION_DIR = resolve(import.meta.dirname, '..');
const COUNT_RE = /^\d+(\.\d+)?[KM]?$/;
const COUNT_TIMEOUT_MS = 30000;
const NAV_TIMEOUT_MS = 15000;
// Cloudflare sometimes challenges the first navigation (especially from CI
// IPs) but sets a context-wide clearance cookie shortly after, so a failed
// run usually passes on a later attempt (see smoke.js).
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 10000;

const PROBLEM_URL = 'https://leetcode.com/problems/two-sum/';
const SOLUTION_HREF_FRAGMENT = '/problems/two-sum/solutions/3619262/';

async function waitForVisibleCount(page) {
    const locator = page.locator('[data-lcd-count]:visible').first();
    await locator.waitFor({ state: 'visible', timeout: COUNT_TIMEOUT_MS });
    const text = (await locator.textContent() || '').trim();
    if (!COUNT_RE.test(text)) {
        throw new Error(`injected count has unexpected text: ${JSON.stringify(text)}`);
    }
    return text;
}

async function assertNoReload(page) {
    const survived = await page.evaluate(() => window.__lcdNoReloadMarker === true);
    if (!survived) {
        throw new Error('navigation reloaded the page (expected an in-app SPA transition)');
    }
}

async function clickTab(page, name) {
    await page.locator('div.flexlayout__tab_button', { hasText: name }).first().click();
}

async function runFlow(context) {
    const page = await context.newPage();
    try {
        // 1. Problem page - fresh load.
        await page.goto(PROBLEM_URL, { waitUntil: 'domcontentloaded' });
        const problemCount = await waitForVisibleCount(page);
        console.log(`ok - problem page: dislike count "${problemCount}"`);

        // Planted after the real page load; a full reload would wipe it, so
        // its survival below proves steps 2 and 3 are in-app SPA transitions.
        await page.evaluate(() => { window.__lcdNoReloadMarker = true; });

        // 2. Editorial tab via click, no reload.
        await clickTab(page, 'Editorial');
        await page.waitForURL(/\/editorial\/?$/, { timeout: NAV_TIMEOUT_MS });
        await assertNoReload(page);
        const editorialCount = await waitForVisibleCount(page);
        console.log(`ok - editorial tab (SPA click): dislike count "${editorialCount}"`);

        // 3. Solutions tab, then a specific solution post, via clicks, no reload.
        await clickTab(page, 'Solutions');
        await page.waitForURL(/\/solutions\/?$/, { timeout: NAV_TIMEOUT_MS });
        await page.waitForSelector(`a[href*="${SOLUTION_HREF_FRAGMENT}"]`, { timeout: COUNT_TIMEOUT_MS });
        await page.locator(`a[href*="${SOLUTION_HREF_FRAGMENT}"]`).first().click();
        await page.waitForURL(/\/solutions\/\d+\//, { timeout: NAV_TIMEOUT_MS });
        await assertNoReload(page);
        const solutionCount = await waitForVisibleCount(page);
        console.log(`ok - solution post (SPA click): dislike count "${solutionCount}"`);
    } finally {
        await page.close();
    }
}

async function main() {
    const userDataDir = mkdtempSync(join(tmpdir(), 'lcd-integration-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
            `--disable-extensions-except=${EXTENSION_DIR}`,
            `--load-extension=${EXTENSION_DIR}`
        ]
    });
    try {
        let lastErr;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            if (attempt > 1) {
                console.log(`retrying full flow (attempt ${attempt}/${MAX_ATTEMPTS})...`);
                await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
            }
            try {
                await runFlow(context);
                lastErr = null;
                break;
            } catch (err) {
                lastErr = err;
                console.error(`FAIL (attempt ${attempt}/${MAX_ATTEMPTS}): ${err.message}`);
            }
        }
        if (lastErr) {
            throw lastErr;
        }
    } finally {
        await context.close();
        rmSync(userDataDir, { recursive: true, force: true });
    }
    console.log('integration test passed');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
