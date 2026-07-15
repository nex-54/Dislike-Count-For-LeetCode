import { createHash } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';
import { chromium } from 'playwright';

const EXTENSION_DIR = resolve(import.meta.dirname, '..');
// Chrome derives an unpacked extension's ID from the sha256 of its absolute
// path, with hex digits mapped to a-p.
const EXTENSION_ID = createHash('sha256')
    .update(EXTENSION_DIR)
    .digest('hex')
    .slice(0, 32)
    .replace(/./g, (c) => 'abcdefghijklmnop'[parseInt(c, 16)]);
const COUNT_RE = /^\d+(\.\d+)?[KM]?$/;
const COUNT_TIMEOUT_MS = 30000;
// Cloudflare sometimes challenges the first navigation (especially from CI
// IPs) but sets a context-wide clearance cookie shortly after, so a failed
// run usually passes on a later attempt (see smoke.js).
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 10000;

const EDITORIAL_URL = 'https://leetcode.com/problems/two-sum/editorial/';

// Comment counts are off by default; turn them on through the popup, the
// same way a user would.
async function enableCommentCounts(context) {
    const page = await context.newPage();
    try {
        await page.goto(`chrome-extension://${EXTENSION_ID}/popup.html`);
        // Let popup.js finish loading the stored state into the checkbox
        // before touching it.
        await page.waitForTimeout(300);
        const checkbox = page.locator('#comment-counts');
        if (!(await checkbox.isChecked())) {
            await checkbox.check();
            await page.waitForTimeout(300);
        }
    } finally {
        await page.close();
    }
}

// Comments only load once the article pane is scrolled to the bottom.
async function waitForCommentCount(page) {
    const deadline = Date.now() + COUNT_TIMEOUT_MS;
    while (Date.now() < deadline) {
        const text = await page.evaluate(() => {
            for (const el of document.querySelectorAll('div')) {
                if (el.scrollHeight > el.clientHeight + 100 && el.clientHeight > 300) {
                    el.scrollTop = el.scrollHeight;
                }
            }
            for (const row of document.querySelectorAll('[data-lcd-comment]')) {
                const count = row.querySelector('[data-lcd-count]');
                if (row.checkVisibility() && count) {
                    return count.textContent;
                }
            }
            return null;
        });
        if (text !== null) {
            return text;
        }
        await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`no comment dislike count appeared within ${COUNT_TIMEOUT_MS}ms`);
}

async function runFlow(context) {
    await enableCommentCounts(context);
    const page = await context.newPage();
    try {
        await page.goto(EDITORIAL_URL, { waitUntil: 'domcontentloaded' });
        // The article count doubles as a readiness (and Cloudflare) check.
        const count = page.locator('[data-lcd-count]').first();
        try {
            await count.waitFor({ state: 'attached', timeout: COUNT_TIMEOUT_MS });
        } catch (err) {
            const title = await page.title();
            if (/just a moment/i.test(title)) {
                throw new Error(`blocked by Cloudflare challenge (page title: ${JSON.stringify(title)})`);
            }
            throw new Error(`no [data-lcd-count] element appeared within ${COUNT_TIMEOUT_MS}ms`);
        }
        const text = (await waitForCommentCount(page)).trim();
        if (!COUNT_RE.test(text)) {
            throw new Error(`injected comment count has unexpected text: ${JSON.stringify(text)}`);
        }
        console.log(`ok - editorial comments: dislike count "${text}"`);
    } finally {
        await page.close();
    }
}

async function main() {
    const userDataDir = mkdtempSync(join(tmpdir(), 'lcd-comments-'));
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
                console.log(`retrying (attempt ${attempt}/${MAX_ATTEMPTS})...`);
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
    console.log('comments test passed');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
