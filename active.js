// Tells background.js that this tab is on LeetCode, so it colors the toolbar
// icon. Runs at document_start so the icon is not left gray while the page loads.
async function reportActive() {
    try {
        await chrome.runtime.sendMessage({ type: 'lcd-active' });
    } catch (err) {
        // Thrown when the extension was reloaded or removed while this page stayed open.
        console.debug('[Dislike-Count-For-LeetCode] reporting the tab failed:', err);
    }
}

// A prerendered page runs content scripts before it is shown, and showing it
// is a navigation that resets the tab's icon, so it reports once activated.
if (document.prerendering) {
    document.addEventListener('prerenderingchange', reportActive, { once: true });
} else {
    reportActive();
}
// A page restored from the back/forward cache does not rerun content scripts,
// but the navigation that restored it still reset the tab's icon.
window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        reportActive();
    }
});
