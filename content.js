const PAGE_TYPES = {
    problem: {
        upIcon: 'svg.fa-thumbs-up',
        downIcon: 'svg.fa-thumbs-down',
        fetchCounts: (page) => fetchProblemCounts(page.slug)
    },
    editorial: {
        upIcon: 'svg.fa-up',
        downIcon: 'svg.fa-down',
        fetchCounts: (page) => fetchEditorialCounts(page.slug)
    },
    solution: {
        upIcon: 'svg.fa-up',
        downIcon: 'svg.fa-down',
        fetchCounts: (page) => fetchSolutionCounts(page.topicId)
    },
    discuss: {
        upIcon: 'svg.fa-up',
        downIcon: 'svg.fa-down',
        fetchCounts: (page) => fetchDiscussCounts(page.topicId)
    }
};

function getPage() {
    const solutionMatches = window.location.pathname.match(/^\/problems\/([a-z0-9-]+)\/solutions\/(\d+)(?:\/|$)/);
    if (solutionMatches) {
        const [, slug, topicId] = solutionMatches;
        return { slug, type: 'solution', topicId, key: `${slug}/solutions/${topicId}` };
    }
    const discussMatches = window.location.pathname.match(/^\/discuss\/post\/(\d+)(?:\/|$)/);
    if (discussMatches) {
        const topicId = discussMatches[1];
        return { type: 'discuss', topicId, key: `discuss/${topicId}` };
    }
    const matches = window.location.pathname.match(/^\/problems\/([a-z0-9-]+)(\/editorial)?(?:\/|$)/);
    if (!matches) {
        return null;
    }
    const slug = matches[1];
    const type = matches[2] ? 'editorial' : 'problem';
    return { slug, type, key: type === 'editorial' ? `${slug}/editorial` : slug };
}

async function fetchGraphql(body) {
    try {
        const response = await fetch('https://leetcode.com/graphql/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            return null;
        }
        const { data } = await response.json();
        return data || null;
    } catch (err) {
        console.debug('[Dislike-Count-For-LeetCode] fetch failed:', err);
        return null;
    }
}

async function fetchProblemCounts(slug) {
    const query = `
        query questionData($titleSlug: String!) {
            question(titleSlug: $titleSlug) {
                likes
                dislikes
            }
        }
    `;
    const data = await fetchGraphql({
        query,
        variables: { titleSlug: slug },
        operationName: 'questionData'
    });
    if (!data || !data.question) {
        return null;
    }
    return { likes: data.question.likes, dislikes: data.question.dislikes };
}

function reactionsToCounts(article) {
    if (!article || !Array.isArray(article.reactions)) {
        return null;
    }
    const counts = { likes: 0, dislikes: 0 };
    for (const { reactionType, count } of article.reactions) {
        if (reactionType === 'UPVOTE') {
            counts.likes = count;
        } else if (reactionType === 'THUMBS_DOWN') {
            counts.dislikes = count;
        }
    }
    return counts;
}

async function fetchReactionCounts(body, articleField) {
    const data = await fetchGraphql(body);
    return reactionsToCounts(data && data[articleField]);
}

function fetchEditorialCounts(slug) {
    return fetchReactionCounts({
        query: `
            query editorialReactions($questionSlug: String!) {
                ugcArticleOfficialSolutionArticle(questionSlug: $questionSlug) {
                    reactions {
                        count
                        reactionType
                    }
                }
            }
        `,
        variables: { questionSlug: slug },
        operationName: 'editorialReactions'
    }, 'ugcArticleOfficialSolutionArticle');
}

function fetchTopicReactions(articleField, topicId) {
    return fetchReactionCounts({
        query: `
            query topicReactions($topicId: ID!) {
                ${articleField}(topicId: $topicId) {
                    reactions {
                        count
                        reactionType
                    }
                }
            }
        `,
        variables: { topicId },
        operationName: 'topicReactions'
    }, articleField);
}

function fetchSolutionCounts(topicId) {
    return fetchTopicReactions('ugcArticleSolutionArticle', topicId);
}

function fetchDiscussCounts(topicId) {
    return fetchTopicReactions('ugcArticleDiscussionArticle', topicId);
}

function findVoteButtons(pageType) {
    for (const icon of document.querySelectorAll(pageType.upIcon)) {
        const upButton = icon.closest('button');
        if (!upButton || !upButton.checkVisibility()) continue;
        const downIcon = upButton.parentElement.querySelector(pageType.downIcon);
        const downButton = downIcon && downIcon.closest('button');
        if (downButton && downButton !== upButton) {
            return { upButton, downButton };
        }
    }
    return null;
}

function formatCount(count) {
    for (const [size, suffix] of [[1e6, 'M'], [1e3, 'K']]) {
        if (count >= size - size / 20000) {
            return `${Math.round((count / size) * 10) / 10}${suffix}`;
        }
    }
    return count.toString();
}

function findCountTemplate(upButton, upIcon) {
    for (const child of upButton.children) {
        if (child.matches(upIcon) || child.querySelector(upIcon)) {
            continue;
        }
        return child;
    }
    return null;
}

function setDislikeCount(upButton, downButton, count, upIcon) {
    const template = findCountTemplate(upButton, upIcon);
    let countElement = downButton.querySelector('[data-lcd-count]');
    if (!countElement) {
        countElement = template ? template.cloneNode(true) : document.createElement('div');
        countElement.setAttribute('data-lcd-count', '');
        downButton.appendChild(countElement);
    }
    if (template && countElement.className !== template.className) {
        countElement.className = template.className;
    }
    const textHost = countElement.querySelector('span') || countElement;
    const text = formatCount(count);
    if (textHost.textContent !== text) {
        textHost.textContent = text;
    }
}


let styledDownButton = null;
let styledClassName = '';
function syncButtonStyle(upButton, downButton) {
    if (downButton === styledDownButton && upButton.className === styledClassName
        && downButton.className === styledClassName) {
        return;
    }
    styledDownButton = downButton;
    styledClassName = upButton.className;
    downButton.className = styledClassName;
}

let currentPage = null;
let currentCounts = null;
let cachedButtons = null; // { pageKey, upButton, downButton }
function applyCounts() {
    if (!currentCounts || !currentPage) {
        return;
    }
    const pageType = PAGE_TYPES[currentPage.type];
    // Avoid a full DOM scan on every mutation (e.g. every keystroke in the
    // code editor) when the buttons we already found are still valid.
    let buttons = cachedButtons && cachedButtons.pageKey === currentPage.key ? cachedButtons : null;
    if (buttons && (!buttons.upButton.isConnected || !buttons.upButton.checkVisibility())) {
        buttons = null;
    }
    if (!buttons) {
        buttons = findVoteButtons(pageType);
        if (buttons) {
            cachedButtons = { pageKey: currentPage.key, ...buttons };
        }
    }
    if (!buttons) {
        return;
    }
    syncButtonStyle(buttons.upButton, buttons.downButton);
    watchVotes(buttons.upButton, buttons.downButton);
    setDislikeCount(buttons.upButton, buttons.downButton, currentCounts.dislikes, pageType.upIcon);
}

const FETCH_RETRY_MS = [1000, 5000, 15000, 30000];
let refreshToken = 0;
async function refreshCounts(page, attempt = 0, token = ++refreshToken) {
    const counts = await PAGE_TYPES[page.type].fetchCounts(page);
    if (token !== refreshToken || !currentPage || currentPage.key !== page.key) {
        return;
    }
    if (!counts) {
        if (attempt >= FETCH_RETRY_MS.length) {
            return;
        }
        setTimeout(() => {
            if (token === refreshToken) {
                refreshCounts(page, attempt + 1, token);
            }
        }, FETCH_RETRY_MS[attempt]);
        return;
    }
    currentCounts = counts;
    applyCounts();
}

let commentCountsEnabled = false;
function setCommentCountsEnabled(enabled) {
    if (enabled === commentCountsEnabled) {
        return;
    }
    commentCountsEnabled = enabled;
    if (enabled) {
        queueUpdate();
    } else {
        for (const countElement of document.querySelectorAll('[data-lcd-comment] [data-lcd-count]')) {
            countElement.remove();
        }
    }
}

let solutionListCountsEnabled = false;
function setSolutionListCountsEnabled(enabled) {
    if (enabled === solutionListCountsEnabled) {
        return;
    }
    solutionListCountsEnabled = enabled;
    if (enabled) {
        queueUpdate();
    } else {
        for (const countElement of document.querySelectorAll('[data-lcd-solution]')) {
            countElement.remove();
        }
    }
}

chrome.storage.sync.get({ commentCounts: false, solutionListCounts: false })
    .then(({ commentCounts, solutionListCounts }) => {
        setCommentCountsEnabled(Boolean(commentCounts));
        setSolutionListCountsEnabled(Boolean(solutionListCounts));
    })
    .catch((err) => {
        console.debug('[Dislike-Count-For-LeetCode] storage read failed:', err);
    });
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') {
        return;
    }
    if (changes.commentCounts) {
        setCommentCountsEnabled(Boolean(changes.commentCounts.newValue));
    }
    if (changes.solutionListCounts) {
        setSolutionListCountsEnabled(Boolean(changes.solutionListCounts.newValue));
    }
});

const COMMENT_QUERIES = {
    questionDiscussComments: {
        query: `
            query questionDiscussComments($topicId: Int!, $orderBy: String, $pageNo: Int, $numPerPage: Int) {
                topicComments(topicId: $topicId, orderBy: $orderBy, pageNo: $pageNo, numPerPage: $numPerPage) {
                    data {
                        id
                        post {
                            voteCount
                            voteUpCount
                        }
                    }
                }
            }
        `,
        extract: (data) => data.topicComments && data.topicComments.data
    },
    commentReplies: {
        query: `
            query commentReplies($commentId: ID!, $skip: Int, $first: Int) {
                commentReplyConnection(commentId: $commentId, skip: $skip, first: $first) {
                    edges {
                        node {
                            id
                            post {
                                voteCount
                                voteUpCount
                            }
                        }
                    }
                }
            }
        `,
        extract: (data) => data.commentReplyConnection && data.commentReplyConnection.edges
            && data.commentReplyConnection.edges.map((edge) => edge.node)
    }
};

const commentCountsByQuery = new Map();
const commentFetchAttempts = new Map();

function fetchCommentDislikes(queryKeyJson) {
    let promise = commentCountsByQuery.get(queryKeyJson);
    if (promise) {
        return promise;
    }
    promise = (async () => {
        const [operationName, variables] = JSON.parse(queryKeyJson);
        const spec = COMMENT_QUERIES[operationName];
        if (!spec) {
            return null;
        }
        const data = await fetchGraphql({ query: spec.query, variables, operationName });
        const comments = data && spec.extract(data);
        if (!comments) {
            return null;
        }
        const counts = new Map();
        for (const comment of comments) {
            const post = comment && comment.post;
            if (post && typeof post.voteUpCount === 'number' && typeof post.voteCount === 'number') {
                counts.set(Number(comment.id), post.voteUpCount - post.voteCount);
            }
        }
        return counts;
    })();
    commentCountsByQuery.set(queryKeyJson, promise);
    promise.then((counts) => {
        if (counts) {
            commentFetchAttempts.delete(queryKeyJson);
            return;
        }
        const attempt = commentFetchAttempts.get(queryKeyJson) || 0;
        if (attempt >= FETCH_RETRY_MS.length) {
            return;
        }
        commentFetchAttempts.set(queryKeyJson, attempt + 1);
        setTimeout(() => {
            if (commentCountsByQuery.get(queryKeyJson) === promise) {
                commentCountsByQuery.delete(queryKeyJson);
                queueUpdate();
            }
        }, FETCH_RETRY_MS[attempt]);
    });
    return promise;
}

function findRowChildContaining(row, icon) {
    let child = icon;
    while (child && child.parentElement !== row) {
        child = child.parentElement;
    }
    return child;
}

function setCommentDislikeCount(row, dislikes) {
    const downIcon = row.querySelector('svg.fa-down');
    const upIcon = row.querySelector('svg.fa-up');
    if (!downIcon || !upIcon) {
        return;
    }
    const downGroup = findRowChildContaining(row, downIcon);
    const upGroup = findRowChildContaining(row, upIcon);
    if (!downGroup || !upGroup || downGroup === upGroup) {
        return;
    }
    let countElement = downGroup.querySelector('[data-lcd-count]');
    if (!countElement) {
        let template = null;
        for (const child of upGroup.children) {
            if (!child.matches('svg.fa-up') && !child.querySelector('svg.fa-up')) {
                template = child;
                break;
            }
        }
        countElement = template ? template.cloneNode(false) : document.createElement('div');
        countElement.setAttribute('data-lcd-count', '');
        downGroup.appendChild(countElement);
    }
    const text = formatCount(dislikes);
    if (countElement.textContent !== text) {
        countElement.textContent = text;
    }
}

async function decorateCommentRow(row) {
    const infoJson = row.getAttribute('data-lcd-comment');
    let info;
    try {
        info = JSON.parse(infoJson);
    } catch {
        return;
    }
    watchCommentVotes(row);
    const counts = await fetchCommentDislikes(JSON.stringify(info.queryKey));
    if (!commentCountsEnabled || !counts || !row.isConnected
        || row.getAttribute('data-lcd-comment') !== infoJson) {
        return;
    }
    const dislikes = counts.get(Number(info.id));
    if (typeof dislikes === 'number') {
        setCommentDislikeCount(row, dislikes);
    }
}

function applyCommentCounts() {
    for (const row of document.querySelectorAll('[data-lcd-comment]')) {
        if (row.checkVisibility()) {
            decorateCommentRow(row);
        }
    }
}

// Only clicks on the vote controls should trigger a refetch; the row also
// holds non-vote controls like reply/share.
function isCommentVoteClick(row, target) {
    if (!(target instanceof Element)) {
        return false;
    }
    for (const selector of ['svg.fa-up', 'svg.fa-down']) {
        const icon = row.querySelector(selector);
        const group = icon && findRowChildContaining(row, icon);
        if (group && group.contains(target)) {
            return true;
        }
    }
    return false;
}

const watchedCommentRows = new WeakSet();
function watchCommentVotes(row) {
    if (watchedCommentRows.has(row)) {
        return;
    }
    watchedCommentRows.add(row);
    row.addEventListener('click', (event) => {
        if (!isCommentVoteClick(row, event.target)) {
            return;
        }
        const infoJson = row.getAttribute('data-lcd-comment');
        setTimeout(() => {
            let info;
            try {
                info = JSON.parse(infoJson);
            } catch {
                return;
            }
            const queryKeyJson = JSON.stringify(info.queryKey);
            commentCountsByQuery.delete(queryKeyJson);
            commentFetchAttempts.delete(queryKeyJson);
            queueUpdate();
        }, VOTE_SETTLE_MS);
    });
}

const SOLUTION_LIST_PATH = /^\/problems\/[a-z0-9-]+\/solutions\/?$/;
const INACTIVE_UP_PATH = 'M192 82.4L334.7 232.3c.8 .8 1.3 2 1.3 3.2c0 2.5-2 4.6-4.6 4.6H248c-13.3 0-24 10.7-24 24V432H160V264c0-13.3-10.7-24-24-24H52.6c-2.5 0-4.6-2-4.6-4.6c0-1.2 .5-2.3 1.3-3.2L192 82.4zm192 153c0-13.5-5.2-26.5-14.5-36.3L222.9 45.2C214.8 36.8 203.7 32 192 32s-22.8 4.8-30.9 13.2L14.5 199.2C5.2 208.9 0 221.9 0 235.4c0 29 23.5 52.6 52.6 52.6H112V432c0 26.5 21.5 48 48 48h64c26.5 0 48-21.5 48-48V288h59.4c29 0 52.6-23.5 52.6-52.6z';
const SOLUTION_CARD_HREF = /^\/problems\/[a-z0-9-]+\/solutions\/(\d+)(?:\/|$)/;
const MAX_CARD_HOPS = 8;

const solutionDislikesByTopic = new Map();
const solutionTopicsInFlight = new Set();
const solutionFetchAttempts = new Map();

async function fetchSolutionListDislikes(topicIds) {
    for (const topicId of topicIds) {
        solutionTopicsInFlight.add(topicId);
    }
    // topicIds come from the \d+ href capture, so inlining them is safe.
    const query = `query solutionListReactions { ${topicIds.map((topicId, i) =>
        `t${i}: ugcArticleSolutionArticle(topicId: ${topicId}) { reactions { count reactionType } }`
    ).join(' ')} }`;
    const data = await fetchGraphql({ query, operationName: 'solutionListReactions' });
    const failed = [];
    topicIds.forEach((topicId, i) => {
        const counts = reactionsToCounts(data && data[`t${i}`]);
        if (counts) {
            solutionDislikesByTopic.set(topicId, counts.dislikes);
            solutionFetchAttempts.delete(topicId);
            solutionTopicsInFlight.delete(topicId);
        } else {
            failed.push(topicId);
        }
    });
    if (failed.length < topicIds.length) {
        queueUpdate();
    }
    const retryable = [];
    for (const topicId of failed) {
        const attempt = solutionFetchAttempts.get(topicId) || 0;
        if (attempt >= FETCH_RETRY_MS.length) {
            solutionDislikesByTopic.set(topicId, null);
            solutionTopicsInFlight.delete(topicId);
        } else {
            solutionFetchAttempts.set(topicId, attempt + 1);
            retryable.push({ topicId, attempt });
        }
    }
    if (!retryable.length) {
        return;
    }
    setTimeout(() => {
        for (const { topicId } of retryable) {
            solutionTopicsInFlight.delete(topicId);
        }
        queueUpdate();
    }, FETCH_RETRY_MS[Math.min(...retryable.map((r) => r.attempt))]);
}

function findSolutionCard(anchor) {
    let card = anchor;
    for (let hop = 0; card && hop < MAX_CARD_HOPS; hop++, card = card.parentElement) {
        const upIcons = card.querySelectorAll('svg.fa-up');
        if (upIcons.length === 1) {
            return card;
        }
        if (upIcons.length > 1) {
            return null;
        }
    }
    return null;
}

function solutionCountTextHost(countElement) {
    for (const node of countElement.childNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && node.querySelector('svg')) {
            continue;
        }
        return node;
    }
    return null;
}

function setSolutionCardCount(card, dislikes) {
    let countElement = card.querySelector('[data-lcd-count]');
    if (!countElement) {
        const upIcon = card.querySelector('svg.fa-up');
        const iconWrapper = upIcon && upIcon.parentElement;
        const upGroup = iconWrapper && iconWrapper.parentElement;
        if (!upGroup) {
            return;
        }
        countElement = upGroup.cloneNode(true);
        countElement.setAttribute('data-lcd-count', '');
        countElement.setAttribute('data-lcd-solution', '');
        const icon = countElement.querySelector('svg.fa-up');
        if (icon) {
            icon.style.transform = 'translate(-50%, -50%) rotate(180deg)';
            const path = icon.querySelector('path');
            if (path) {
                path.setAttribute('d', INACTIVE_UP_PATH);
            }
        }
        for (const el of [countElement, ...countElement.querySelectorAll('.text-sd-success')]) {
            el.classList.remove('text-sd-success');
        }
        let countNode = null;
        for (const node of [...countElement.childNodes]) {
            if (icon && node.contains(icon)) {
                continue;
            }
            if (countNode) {
                node.remove();
            } else {
                countNode = node;
            }
        }
        if (!countNode) {
            countElement.appendChild(document.createTextNode(''));
        }
        upGroup.after(countElement);
    }
    const textHost = solutionCountTextHost(countElement);
    const text = formatCount(dislikes);
    if (textHost && textHost.textContent !== text) {
        textHost.textContent = text;
    }
}

function applySolutionListCounts() {
    const missing = new Set();
    for (const anchor of document.querySelectorAll('a[href*="/solutions/"]')) {
        const match = (anchor.getAttribute('href') || '').match(SOLUTION_CARD_HREF);
        if (!match) {
            continue;
        }
        const topicId = match[1];
        const card = findSolutionCard(anchor);
        if (!card || !card.checkVisibility()) {
            continue;
        }
        if (!solutionDislikesByTopic.has(topicId)) {
            if (!solutionTopicsInFlight.has(topicId)) {
                missing.add(topicId);
            }
            continue;
        }
        const dislikes = solutionDislikesByTopic.get(topicId);
        if (typeof dislikes === 'number') {
            setSolutionCardCount(card, dislikes);
        }
    }
    if (missing.size) {
        fetchSolutionListDislikes([...missing]);
    }
}

const VOTE_SETTLE_MS = 1500;
const watchedButtons = new WeakSet();
let voteRefetchTimer = null;
function watchVotes(upButton, downButton) {
    for (const button of [upButton, downButton]) {
        if (!watchedButtons.has(button)) {
            watchedButtons.add(button);
            button.addEventListener('click', scheduleVoteRefetch);
        }
    }
}

function scheduleVoteRefetch() {
    const page = currentPage;
    if (!page) {
        return;
    }
    clearTimeout(voteRefetchTimer);
    voteRefetchTimer = setTimeout(() => {
        if (currentPage && currentPage.key === page.key) {
            refreshCounts(page);
        }
    }, VOTE_SETTLE_MS);
}

async function update() {
    const page = getPage();
    if (!page) {
        return;
    }
    const pageChanged = !currentPage || page.key !== currentPage.key;
    if (pageChanged) {
        currentPage = page;
        currentCounts = null;
        commentCountsByQuery.clear();
        commentFetchAttempts.clear();
        solutionDislikesByTopic.clear();
        solutionFetchAttempts.clear();
    }
    if (commentCountsEnabled) {
        window.dispatchEvent(new CustomEvent('lcd:tag'));
        applyCommentCounts();
    }
    if (solutionListCountsEnabled && SOLUTION_LIST_PATH.test(window.location.pathname)) {
        applySolutionListCounts();
    }
    if (pageChanged) {
        await refreshCounts(page);
        return;
    }
    applyCounts();
}

let updateQueued = false;
function queueUpdate() {
    if (updateQueued) {
        return;
    }
    updateQueued = true;
    requestAnimationFrame(() => {
        updateQueued = false;
        update();
    });
}

new MutationObserver(queueUpdate)
    .observe(document.body, { childList: true, subtree: true, characterData: true });
queueUpdate();
