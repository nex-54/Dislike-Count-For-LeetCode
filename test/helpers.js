import { createHash } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';
import { chromium } from 'playwright';

export const EXTENSION_DIR = resolve(import.meta.dirname, '..');
// Chrome derives an unpacked extension's ID from the sha256 of its absolute
// path, with hex digits mapped to a-p.
export const EXTENSION_ID = createHash('sha256')
    .update(EXTENSION_DIR)
    .digest('hex')
    .slice(0, 32)
    .replace(/./g, (c) => 'abcdefghijklmnop'[parseInt(c, 16)]);

export const COUNT_RE = /^\d+(\.\d+)?[KM]?$/;
export const COUNT_TIMEOUT_MS = 30000;
// Cloudflare sometimes challenges the first navigation (especially from CI
// IPs) but sets a context-wide clearance cookie shortly after, so a failed
// attempt usually passes on a later one.
export const MAX_ATTEMPTS = 3;
export const RETRY_DELAY_MS = 10000;

export function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

export async function withExtensionContext(tmpPrefix, fn) {
    const userDataDir = mkdtempSync(join(tmpdir(), tmpPrefix));
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
            `--disable-extensions-except=${EXTENSION_DIR}`,
            `--load-extension=${EXTENSION_DIR}`
        ]
    });
    try {
        await fn(context);
    } finally {
        await context.close();
        rmSync(userDataDir, { recursive: true, force: true });
    }
}

// Retry a whole flow, for tests whose steps build on each other.
export async function retryFlow(fn, label = '') {
    let lastErr;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (attempt > 1) {
            console.log(`retrying${label ? ` ${label}` : ''} (attempt ${attempt}/${MAX_ATTEMPTS})...`);
            await delay(RETRY_DELAY_MS);
        }
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            console.error(`FAIL (attempt ${attempt}/${MAX_ATTEMPTS}): ${err.message}`);
        }
    }
    throw lastErr;
}

// Wait for an element injected by the extension, distinguishing a Cloudflare
// challenge page from the extension genuinely failing to inject.
export async function waitForAttachedCount(page, selector) {
    const count = page.locator(selector).first();
    try {
        await count.waitFor({ state: 'attached', timeout: COUNT_TIMEOUT_MS });
    } catch (err) {
        const title = await page.title();
        if (/just a moment/i.test(title)) {
            throw new Error(`blocked by Cloudflare challenge (page title: ${JSON.stringify(title)})`, { cause: err });
        }
        throw new Error(`no ${selector} element appeared within ${COUNT_TIMEOUT_MS}ms`, { cause: err });
    }
    return count;
}

export function checkCountText(text, what) {
    if (!COUNT_RE.test(text)) {
        throw new Error(`${what} has unexpected text: ${JSON.stringify(text)}`);
    }
}

// Opt-in features are off by default; turn them on through the popup, the
// same way a user would.
export async function enablePopupToggle(context, checkboxId) {
    const page = await context.newPage();
    try {
        await page.goto(`chrome-extension://${EXTENSION_ID}/popup.html`);
        await page.waitForTimeout(300);
        const checkbox = page.locator(`#${checkboxId}`);
        if (!(await checkbox.isChecked())) {
            await checkbox.check();
            await page.waitForTimeout(300);
        }
    } finally {
        await page.close();
    }
}
