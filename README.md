# Dislike Count For LeetCode

A Chrome extension that restores the hidden dislike count on LeetCode.

*This extension is not affiliated with, endorsed by, or connected to LeetCode.*

![Dislike count shown on a LeetCode problem page](screenshots/Screenshot.png)

## How it works

The extension fetches dislike counts from LeetCode's own public GraphQL API using the problem slug from the URL, and injects the count into the dislike button.
Supported pages: problem, editorial, solution

## Install

### Chrome Web Store

https://chromewebstore.google.com/detail/dislike-count-for-leetcod/gjbiemmdpdncpbjmgemebpddnikiiomn

### Repo

1. Clone or download this repository:
   ```sh
   git clone https://github.com/nex-54/Dislike-Count-For-LeetCode.git
   ```
2. Open `chrome://extensions` in Chrome (or any Chromium-based browser).
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the repository folder.

## Development

After editing `content.js`, reload the extension on `chrome://extensions` (click the reload icon), then refresh the LeetCode page to see the change.

### Releasing

The `version` field in `manifest.json` is the single source of truth. Bumping it drives
everything else.

1. Update the `version` field in `manifest.json` and push the change to `main`.
2. The `release` workflow runs the smoke test, then — only if it passes — reads the new
   version, builds `dislike-count-for-leetcode-<version>.zip` via `./build.sh`, and creates
   the `v<version>` tag and a GitHub release with that zip attached.
3. Download the zip from the release and upload it to the Chrome Web Store.

The workflow only runs when the version in `manifest.json` changes and skips versions that already have a
tag.

### Local builds

```sh
./build.sh
```

### Smoke test

A Playwright smoke test loads the extension and checks that dislike counts appear on live leetcode.com pages.

```sh
./test.sh
```

## Screenshots

### Problem page

![Dislike count on a problem page](screenshots/Screenshot%20-%20problem.png)

### Editorial page

![Dislike count on an editorial page](screenshots/Screenshot%20-%20editorial.png)

### Solution post

![Dislike count on a community solution post](screenshots/Screenshot%20-%20solution.png)