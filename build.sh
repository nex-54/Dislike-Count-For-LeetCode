#!/bin/sh
set -eu
cd "$(dirname "$0")"

version=$(node -p "require('./manifest.json').version")
out="dislike-count-for-leetcode-$version.zip"

rm -f "$out"
zip -X "$out" manifest.json content.js icons/16.png icons/48.png icons/128.png
echo "built $out"
