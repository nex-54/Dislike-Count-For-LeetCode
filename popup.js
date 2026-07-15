const checkbox = document.getElementById('comment-counts');

chrome.storage.sync.get({ commentCounts: false }).then(({ commentCounts }) => {
    checkbox.checked = commentCounts;
});

checkbox.addEventListener('change', () => {
    chrome.storage.sync.set({ commentCounts: checkbox.checked });
});
