#!/bin/sh
set -eu
cd "$(dirname "$0")"

# files.js imports eslint.config.mjs, so the suite needs root tooling too.
if [ ! -d node_modules/@eslint/js ]; then
	npm ci
fi

cd test

if [ ! -d node_modules/playwright ]; then
	npm ci
fi

npx playwright install chromium

npm test
