(() => {
    const MAX_FIBER_HOPS = 25;

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
        while (row && !row.querySelector('svg.fa-up')) {
            row = row.parentElement;
        }
        return row;
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
            } catch (err) {
                continue;
            }
            if (row.getAttribute('data-lcd-comment') !== value) {
                row.setAttribute('data-lcd-comment', value);
            }
        }
    }

    window.addEventListener('lcd:tag', tagCommentRows);
})();
