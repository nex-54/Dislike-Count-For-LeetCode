import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';
import { chromium } from 'playwright';

const EXTENSION_DIR = resolve(import.meta.dirname, '..');
const COUNT_RE = /^\d+(\.\d+)?[KM]?$/;
const COUNT_TIMEOUT_MS = 30000;

const TARGETS = [
    { name: 'problem page', url: 'https://leetcode.com/problems/two-sum/' },
    { name: 'editorial page', url: 'https://leetcode.com/problems/two-sum/editorial/' },
    { name: 'solution post', url: 'https://leetcode.com/problems/two-sum/solutions/3619262/3-methods-c-java-python-beginner-friendl-x595/' }
];

async function checkTarget(context, { name, url }) {
    const page = await context.newPage();
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
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
        const text = (await count.textContent() || '').trim();
        if (!COUNT_RE.test(text)) {
            throw new Error(`injected count has unexpected text: ${JSON.stringify(text)}`);
        }
        console.log(`ok - ${name}: dislike count "${text}"`);
    } finally {
        await page.close();
    }
}

async function main() {
    const userDataDir = mkdtempSync(join(tmpdir(), 'lcd-smoke-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
            `--disable-extensions-except=${EXTENSION_DIR}`,
            `--load-extension=${EXTENSION_DIR}`
        ]
    });
    let failures = 0;
    try {
        for (const target of TARGETS) {
            try {
                await checkTarget(context, target);
            } catch (err) {
                failures++;
                console.error(`FAIL - ${target.name} (${target.url}): ${err.message}`);
            }
        }
    } finally {
        await context.close();
        rmSync(userDataDir, { recursive: true, force: true });
    }
    if (failures > 0) {
        process.exit(1);
    }
    console.log('smoke test passed');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
