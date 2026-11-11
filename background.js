// The toolbar icon is gray by default (manifest.json). active.js reports in
// from every leetcode.com page, and the icon is colored for that tab only.
// The browser drops a tab-specific icon when the tab navigates, so leaving
// LeetCode turns it gray again without needing the tabs permission.
const ACTIVE_ICON = {
    16: 'icons/16.png',
    48: 'icons/48.png',
    128: 'icons/128.png'
};

chrome.runtime.onMessage.addListener((message, sender) => {
    if (!message || message.type !== 'lcd-active' || !sender.tab) {
        return;
    }
    chrome.action.setIcon({ tabId: sender.tab.id, path: ACTIVE_ICON }).catch((err) => {
        // The tab may have closed before the message arrived.
        console.debug('[Dislike-Count-For-LeetCode] setIcon failed:', err);
    });
});
