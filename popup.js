const TOGGLES = [
    { checkbox: document.getElementById('comment-counts'), key: 'commentCounts' }
];

chrome.storage.sync.get({ commentCounts: false }).then((values) => {
    for (const { checkbox, key } of TOGGLES) {
        checkbox.checked = values[key];
    }
}).catch((err) => {
    console.debug('[Dislike-Count-For-LeetCode] storage read failed:', err);
});

for (const { checkbox, key } of TOGGLES) {
    checkbox.addEventListener('change', () => {
        chrome.storage.sync.set({ [key]: checkbox.checked });
    });
}
