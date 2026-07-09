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
    }
};

function getPage() {
    const solutionMatches = window.location.pathname.match(/^\/problems\/([a-z0-9\-]+)\/solutions\/(\d+)(?:\/|$)/);
    if (solutionMatches) {
        const [, slug, topicId] = solutionMatches;
        return { slug, type: 'solution', topicId, key: `${slug}/solutions/${topicId}` };
    }
    const matches = window.location.pathname.match(/^\/problems\/([a-z0-9\-]+)(\/editorial)?(?:\/|$)/);
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

function fetchSolutionCounts(topicId) {
    return fetchReactionCounts({
        query: `
            query solutionReactions($topicId: ID!) {
                ugcArticleSolutionArticle(topicId: $topicId) {
                    reactions {
                        count
                        reactionType
                    }
                }
            }
        `,
        variables: { topicId },
        operationName: 'solutionReactions'
    }, 'ugcArticleSolutionArticle');
}

function findVoteButtons(pageType) {
    for (const icon of document.querySelectorAll(pageType.upIcon)) {
        const upButton = icon.closest('button');
        // Previously visited tabs (e.g. the editorial) stay mounted but
        // hidden and match the same icon selectors, so only accept buttons
        // the user can actually see.
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
async function refreshCounts(page, attempt = 0) {
    const counts = await PAGE_TYPES[page.type].fetchCounts(page);
    if (!currentPage || currentPage.key !== page.key) {
        return;
    }
    if (!counts) {
        if (attempt >= FETCH_RETRY_MS.length) {
            return;
        }
        const delay = FETCH_RETRY_MS[attempt];
        setTimeout(() => {
            if (currentPage && currentPage.key === page.key && !currentCounts) {
                refreshCounts(page, attempt + 1);
            }
        }, delay);
        return;
    }
    currentCounts = counts;
    applyCounts();
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
    if (!currentPage || page.key !== currentPage.key) {
        currentPage = page;
        currentCounts = null;
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
