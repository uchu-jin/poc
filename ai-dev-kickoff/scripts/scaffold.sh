#!/usr/bin/env bash
# AI駆動開発キックオフの静的ファイルを配置する。既存ファイルは上書きしない。
# 使い方: scaffold.sh <出力先ディレクトリ>
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: $0 <target-dir>" >&2
  exit 1
fi

SRC="$(cd "$(dirname "$0")/../assets/scaffold" && pwd)"
DEST="$1"
mkdir -p "$DEST"
DEST="$(cd "$DEST" && pwd)"

created=0
skipped=0
while IFS= read -r -d '' f; do
  rel="${f#"$SRC"/}"
  target="$DEST/$rel"
  if [ -e "$target" ]; then
    echo "skip    $rel (既存)"
    skipped=$((skipped + 1))
  else
    mkdir -p "$(dirname "$target")"
    cp "$f" "$target"
    echo "create  $rel"
    created=$((created + 1))
  fi
done < <(find "$SRC" -type f -print0 | sort -z)

echo "---"
echo "作成 $created 件 / スキップ $skipped 件 → $DEST"
echo "次: CLAUDE.md と docs/requirements/requirements.md をインタビュー結果から書く"
