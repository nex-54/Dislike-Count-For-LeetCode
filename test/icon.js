// The toolbar icon is gray by default and colored only on leetcode.com tabs.
// Offline: every request is stubbed, so there is no Cloudflare and no retrying.
// Chrome has no icon getter. Track successful setIcon calls and mirror each
// into an action title: Chrome resets both per-tab values on navigation. This
// checks the browser-managed reset as well as the requested icon, not pixels.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';
import { EXTENSION_DIR, EXTENSION_ID, delay, withExtensionContext } from './helpers.js';

const STUB = { contentType: 'text/html', body: '<!doctype html><title>stub</title>' };
const CALL_TIMEOUT_MS = 5000;
const ACTIVE_TITLE = 'icon-test: colored';

async function backgroundWorker(context) {
    const isOurs = (worker) => worker.url().includes(EXTENSION_ID);
    return context.serviceWorkers().find(isOurs)
        || context.waitForEvent('serviceworker', { predicate: isOurs });
}

async function expectIcon(worker, tabId, title, expectedCalls, colored) {
    const deadline = Date.now() + CALL_TIMEOUT_MS;
    let actual;
    while (Date.now() < deadline) {
        actual = await worker.evaluate(async (id) => ({
            title: await chrome.action.getTitle({ tabId: id }),
            calls: self.setIconCalls
        }), tabId);
        if (actual.title === title && actual.calls.length >= expectedCalls.length) {
            assert.deepEqual(actual.calls, expectedCalls.map((id) => ({ tabId: id, path: colored })));
            return;
        }
        await delay(50);
    }
    assert.fail(`expected title ${JSON.stringify(title)} and ${expectedCalls.length} icon calls, got ${JSON.stringify(actual)}`);
}

async function tabIdForPage(worker, page) {
    await page.bringToFront();
    return worker.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab.id;
    });
}

async function expectCachedRestore(page, token) {
    assert.equal(await page.evaluate(() => window.iconTestToken), token, 'history navigation reloaded the document');
    assert.equal(await page.evaluate(() => window.iconTestPersisted), true, 'pageshow.persisted must confirm a real cache restore');
}

async function runFlow(context) {
    const manifest = JSON.parse(readFileSync(join(EXTENSION_DIR, 'manifest.json'), 'utf8'));
    const colored = manifest.icons;
    const defaultTitle = manifest.action.default_title || manifest.name;
    assert.notDeepEqual(manifest.action.default_icon, colored, 'default toolbar icon must differ from the colored one');
    console.log('ok - default toolbar icon differs from the colored one');

    const worker = await backgroundWorker(context);
    await worker.evaluate((title) => {
        self.setIconCalls = [];
        const setIcon = chrome.action.setIcon.bind(chrome.action);
        chrome.action.setIcon = async (details) => {
            await setIcon(details);
            self.setIconCalls.push(details);
            await chrome.action.setTitle({ tabId: details.tabId, title });
        };
    }, ACTIVE_TITLE);
    await context.route('**/*', (route) => route.fulfill(STUB));
    await context.addInitScript(() => {
        window.iconTestToken = crypto.randomUUID();
        window.addEventListener('pageshow', (event) => {
            window.iconTestPersisted = event.persisted;
        });
    });

    const page = await context.newPage();
    await page.goto('https://example.com/');
    const tabId = await tabIdForPage(worker, page);
    await expectIcon(worker, tabId, defaultTitle, [], colored);
    await page.goto('https://leetcode.com/');
    const expectedCalls = [tabId];
    await expectIcon(worker, tabId, ACTIVE_TITLE, expectedCalls, colored);
    console.log('ok - visiting LeetCode sets the colored icon for its tab');

    await page.reload();
    expectedCalls.push(tabId);
    await expectIcon(worker, tabId, ACTIVE_TITLE, expectedCalls, colored);
    const token = await page.evaluate(() => window.iconTestToken);
    console.log('ok - reloading LeetCode reapplies the colored icon');

    const otherPage = await context.newPage();
    await otherPage.goto('https://example.com/other');
    const otherTabId = await tabIdForPage(worker, otherPage);
    await expectIcon(worker, otherTabId, defaultTitle, expectedCalls, colored);
    await otherPage.goto('https://leetcode.com/other');
    expectedCalls.push(otherTabId);
    await expectIcon(worker, otherTabId, ACTIVE_TITLE, expectedCalls, colored);
    await page.bringToFront();
    await expectIcon(worker, tabId, ACTIVE_TITLE, expectedCalls, colored);
    console.log('ok - tabs have independent icon state when switching');

    await page.goto('https://example.com/away');
    await expectIcon(worker, tabId, defaultTitle, expectedCalls, colored);
    await expectIcon(worker, otherTabId, ACTIVE_TITLE, expectedCalls, colored);
    console.log('ok - leaving LeetCode resets only that tab to the gray default');

    // Cached documents do not fire load again; wait for commit instead.
    await page.goBack({ waitUntil: 'commit' });
    await expectCachedRestore(page, token);
    expectedCalls.push(tabId);
    await expectIcon(worker, tabId, ACTIVE_TITLE, expectedCalls, colored);
    console.log('ok - Back restores a cached LeetCode page and reapplies its icon');

    await page.goForward({ waitUntil: 'commit' });
    await expectIcon(worker, tabId, defaultTitle, expectedCalls, colored);
    await page.goBack({ waitUntil: 'commit' });
    await expectCachedRestore(page, token);
    expectedCalls.push(tabId);
    await expectIcon(worker, tabId, ACTIVE_TITLE, expectedCalls, colored);
    console.log('ok - repeated Forward/Back navigation resets and restores the icon');

    // Also restore LeetCode in the forward direction, not just when going back.
    await page.goto('https://leetcode.com/next');
    expectedCalls.push(tabId);
    await expectIcon(worker, tabId, ACTIVE_TITLE, expectedCalls, colored);
    const nextToken = await page.evaluate(() => window.iconTestToken);
    await page.goBack({ waitUntil: 'commit' });
    await expectCachedRestore(page, token);
    expectedCalls.push(tabId);
    await expectIcon(worker, tabId, ACTIVE_TITLE, expectedCalls, colored);
    await page.goForward({ waitUntil: 'commit' });
    await expectCachedRestore(page, nextToken);
    expectedCalls.push(tabId);
    await expectIcon(worker, tabId, ACTIVE_TITLE, expectedCalls, colored);
    console.log('ok - Forward restores a cached LeetCode page and reapplies its icon');
}

async function main() {
    await withExtensionContext('lcd-icon-', runFlow, {
        ignoreDefaultArgs: ['--disable-back-forward-cache']
    });
    console.log('icon test passed');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
