#!/usr/bin/env bash
# このスキルを ~/.claude/skills にシンボリックリンクで登録する。
# リンクなので、git pull するだけでスキルが最新になる。
# 使い方: ai-dev-kickoff/install.sh [--force]
#   --force  同名のスキルが既にある場合、<名前>.bak-<日時> に退避してからリンクする
set -euo pipefail

SKILL="$(cd "$(dirname "$0")" && pwd)"
NAME="$(basename "$SKILL")"
DEST="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
TARGET="$DEST/$NAME"

mkdir -p "$DEST"
if [ -L "$TARGET" ] && [ "$(readlink "$TARGET")" = "$SKILL" ]; then
  echo "ok      $NAME (登録済み)"
  exit 0
fi
if [ -e "$TARGET" ] || [ -L "$TARGET" ]; then
  if [ "${1:-}" = "--force" ]; then
    backup="$TARGET.bak-$(date +%Y%m%d%H%M%S)"
    mv "$TARGET" "$backup"
    echo "backup  $NAME → $(basename "$backup")"
  else
    echo "skip    $NAME (既に $TARGET がある。置き換えるなら --force)"
    exit 0
  fi
fi
ln -s "$SKILL" "$TARGET"
echo "link    $NAME → $SKILL"
