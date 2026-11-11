#!/bin/sh
set -eu
cd "$(dirname "$0")"

version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' manifest.json)
out="dislike-count-for-leetcode-$version.zip"

rm -f "$out"
zip -X "$out" manifest.json background.js active.js content.js inject.js popup.html popup.js icons/16.png icons/48.png icons/128.png icons/16-gray.png icons/48-gray.png icons/128-gray.png
echo "built $out"
