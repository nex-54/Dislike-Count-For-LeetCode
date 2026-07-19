import {
    COUNT_TIMEOUT_MS,
    checkCountText, delay, enablePopupToggle, retryFlow, waitForAttachedCount, withExtensionContext
} from './helpers.js';

const TARGETS = [
    { name: 'editorial comments', url: 'https://leetcode.com/problems/two-sum/editorial/' },
    { name: 'discuss post comments', url: 'https://leetcode.com/discuss/post/2347639/a-comprehensive-guide-and-template-for-m-irii/' }
];

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
    await enablePopupToggle(context, 'comment-counts', 'commentCounts');
    for (const { name, url } of TARGETS) {
        const page = await context.newPage();
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            // The article count doubles as a readiness (and Cloudflare) check.
            await waitForAttachedCount(page, '[data-lcd-count]');
            const text = (await waitForCommentCount(page)).trim();
            checkCountText(text, 'injected comment count');
            console.log(`ok - ${name}: dislike count "${text}"`);
        } finally {
            await page.close();
        }
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
