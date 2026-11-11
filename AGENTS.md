# Repository Guidelines

This is the canonical guide for Claude, Codex, and other AI agents working in this repository.

At the start of every session, read [README.md](README.md) in full before starting task work.

@README.md

Human-facing documentation lives in `README.md`.

## Project Structure

This Manifest V3 extension restores LeetCode dislike counts on problem, editorial, solution, and discuss pages using plain JavaScript, without a bundler.

- `manifest.json` registers `content.js` (isolated-world counts) and `inject.js` (MAIN-world comment tagging).
- `active.js` reports leetcode.com tabs to `background.js`, which swaps the default gray toolbar icon (`icons/*-gray.png`) for the colored one on that tab.
- `popup.html` loads `popup.js` for the opt-in comment toggle.
- `test/` contains the offline `files.js` check and Playwright suites; `.github/workflows/` contains CI/releases.
- `icons/`, `promo/`, and `screenshots/` contain assets.

## Development Commands

```sh
npm ci                            # root tooling; required by lint and test:files
npm run lint                      # ESLint
npm --prefix test run test:files  # file-list check; no browser or network
./test.sh                         # full suite; installs missing dependencies and Chromium
./build.sh                        # package dislike-count-for-leetcode-<version>.zip
```

For a single browser suite, run `npm ci` and `npx playwright install chromium` inside `test/`, then `npm run test:<suite>`: `icon`, `smoke`, `integration`, or `comments`.

## Testing Guidelines

Add `test/<feature>.js` using `test/helpers.js`; wire both `test:<feature>` and `test` in `test/package.json`. Run lint and focused checks while iterating; run `./test.sh` before pushing or opening a PR.

## Commits, Pull Requests & Releases

Omit `Co-Authored-By` trailers.

Commit on `main` and push directly to `origin/main`; create a branch or PR only when asked.

Change the `manifest.json` version only for releases.
