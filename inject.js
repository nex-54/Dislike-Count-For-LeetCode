(() => {
    const MAX_FIBER_HOPS = 25;
    const MAX_ROW_HOPS = 8;

    function findCommentInfo(downIcon) {
        let fiber = null;
        for (let el = downIcon; el && !fiber; el = el.parentElement) {
            const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
            if (key) {
                fiber = el[key];
            }
        }
        for (let hop = 0; fiber && hop < MAX_FIBER_HOPS; hop++, fiber = fiber.return) {
            const comment = fiber.memoizedProps && fiber.memoizedProps.comment;
            if (comment && comment.id != null && Array.isArray(comment.queryKey)) {
                return { id: comment.id, queryKey: comment.queryKey };
            }
        }
        return null;
    }

    function findVoteRow(downIcon) {
        let row = downIcon.parentElement;
        for (let hop = 0; row && hop < MAX_ROW_HOPS; hop++, row = row.parentElement) {
            if (row.querySelector('svg.fa-up')) {
                return row;
            }
        }
        return null;
    }

    function tagCommentRows() {
        for (const downIcon of document.querySelectorAll('svg.fa-down')) {
            if (downIcon.closest('button')) {
                continue;
            }
            const row = findVoteRow(downIcon);
            if (!row) {
                continue;
            }
            const info = findCommentInfo(downIcon);
            if (!info) {
                continue;
            }
            let value;
            try {
                value = JSON.stringify(info);
            } catch {
                continue;
            }
            if (row.getAttribute('data-lcd-comment') !== value) {
                row.setAttribute('data-lcd-comment', value);
            }
        }
    }

    window.addEventListener('lcd:tag', tagCommentRows);
})();
