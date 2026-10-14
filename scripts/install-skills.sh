#!/usr/bin/env bash
# このリポジトリの .claude/skills/* を ~/.claude/skills にシンボリックリンクで登録する。
# リンクなので、git pull するだけでスキルが最新になる。
# 使い方: scripts/install-skills.sh [--force]
#   --force  同名のスキルが既にある場合、<名前>.bak-<日時> に退避してからリンクする
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO/.claude/skills"
DEST="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

mkdir -p "$DEST"
for skill in "$SRC"/*/; do
  name="$(basename "$skill")"
  target="$DEST/$name"
  if [ -L "$target" ] && [ "$(readlink "$target")" = "${skill%/}" ]; then
    echo "ok      $name (登録済み)"
    continue
  fi
  if [ -e "$target" ] || [ -L "$target" ]; then
    if [ "$FORCE" -eq 1 ]; then
      backup="$target.bak-$(date +%Y%m%d%H%M%S)"
      mv "$target" "$backup"
      echo "backup  $name → $(basename "$backup")"
    else
      echo "skip    $name (既に $target がある。置き換えるなら --force)"
      continue
    fi
  fi
  ln -s "${skill%/}" "$target"
  echo "link    $name → ${skill%/}"
done
