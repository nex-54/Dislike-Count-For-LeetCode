#!/bin/sh
set -eu
cd "$(dirname "$0")/test"

if [ ! -d node_modules/playwright ]; then
	npm ci
fi

npx playwright install chromium

npm test
