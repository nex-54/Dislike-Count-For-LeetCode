import {
    COUNT_TIMEOUT_MS,
    checkCountText, delay, enablePopupToggle, retryFlow, waitForAttachedCount, withExtensionContext
} from './helpers.js';

const EDITORIAL_URL = 'https://leetcode.com/problems/two-sum/editorial/';

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
        await delay(1000);
    }
    throw new Error(`no comment dislike count appeared within ${COUNT_TIMEOUT_MS}ms`);
}

async function runFlow(context) {
    await enablePopupToggle(context, 'comment-counts');
    const page = await context.newPage();
    try {
        await page.goto(EDITORIAL_URL, { waitUntil: 'domcontentloaded' });
        // The article count doubles as a readiness (and Cloudflare) check.
        await waitForAttachedCount(page, '[data-lcd-count]');
        const text = (await waitForCommentCount(page)).trim();
        checkCountText(text, 'injected comment count');
        console.log(`ok - editorial comments: dislike count "${text}"`);
    } finally {
        await page.close();
    }
}

async function main() {
    await withExtensionContext('lcd-comments-', (context) =>
        retryFlow(() => runFlow(context)));
    console.log('comments test passed');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
