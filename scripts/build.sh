#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./manifest.json').version")
OUT="dist/ocp-lifecycle-highlighter-${VERSION}.zip"

rm -rf dist
mkdir -p dist

TMP_ZIP="$(mktemp -d)/ext.zip"
zip -r "$TMP_ZIP" manifest.json src _locales icons -x "*.DS_Store"
mv "$TMP_ZIP" "$OUT"

echo "built: $OUT"
unzip -l "$OUT"
