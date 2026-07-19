import {
    checkCountText, enablePopupToggle, retryFlow, waitForAttachedCount, withExtensionContext
} from './helpers.js';

const SOLUTIONS_LIST_URL = 'https://leetcode.com/problems/two-sum/solutions/';

async function runFlow(context) {
    await enablePopupToggle(context, 'solution-list-counts', 'solutionListCounts');
    const page = await context.newPage();
    try {
        await page.goto(SOLUTIONS_LIST_URL, { waitUntil: 'domcontentloaded' });
        const count = await waitForAttachedCount(page, '[data-lcd-solution]');
        const text = (await count.textContent()).trim();
        checkCountText(text, 'injected solution list count');
        const decorated = await page.locator('[data-lcd-solution]').count();
        console.log(`ok - solutions list: first dislike count "${text}", ${decorated} cards decorated`);
    } finally {
        await page.close();
    }
}

async function main() {
    await withExtensionContext('lcd-solutions-', (context) =>
        retryFlow(() => runFlow(context)));
    console.log('solutions test passed');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
