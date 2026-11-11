#!/bin/sh
set -eu
cd "$(dirname "$0")"

# Root tooling: lint needs it, and so does files.js, which imports eslint.config.mjs.
if [ ! -d node_modules/@eslint/js ]; then
	npm ci
fi

npm run lint

cd test

if [ ! -d node_modules/playwright ]; then
	npm ci
fi

npx playwright install chromium

npm test
