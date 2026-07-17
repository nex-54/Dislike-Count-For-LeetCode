import {
    MAX_ATTEMPTS, RETRY_DELAY_MS,
    checkCountText, delay, waitForAttachedCount, withExtensionContext
} from './helpers.js';

const TARGETS = [
    { name: 'problem page', url: 'https://leetcode.com/problems/two-sum/' },
    { name: 'editorial page', url: 'https://leetcode.com/problems/two-sum/editorial/' },
    { name: 'solution post', url: 'https://leetcode.com/problems/two-sum/solutions/3619262/3-methods-c-java-python-beginner-friendl-x595/' }
];

async function checkTarget(context, { name, url }) {
    const page = await context.newPage();
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        const count = await waitForAttachedCount(page, '[data-lcd-count]');
        const text = (await count.textContent() || '').trim();
        checkCountText(text, 'injected count');
        console.log(`ok - ${name}: dislike count "${text}"`);
    } finally {
        await page.close();
    }
}

async function main() {
    // Unlike the other tests, retry per target: each target stands alone, so
    // only the failed ones need another attempt.
    let pending = TARGETS;
    await withExtensionContext('lcd-smoke-', async (context) => {
        for (let attempt = 1; attempt <= MAX_ATTEMPTS && pending.length > 0; attempt++) {
            if (attempt > 1) {
                console.log(`retrying ${pending.length} failed target(s) (attempt ${attempt}/${MAX_ATTEMPTS})...`);
                await delay(RETRY_DELAY_MS);
            }
            const failed = [];
            for (const target of pending) {
                try {
                    await checkTarget(context, target);
                } catch (err) {
                    failed.push(target);
                    console.error(`FAIL - ${target.name} (${target.url}): ${err.message}`);
                }
            }
            pending = failed;
        }
    });
    if (pending.length > 0) {
        process.exit(1);
    }
    console.log('smoke test passed');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
