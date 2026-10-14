# poc

Claude Code で POC をつくるためのリポジトリ。

## スキル

`.claude/skills/` に、POC づくりで使う Claude Code スキルを置いている。

| スキル | 内容 |
|---|---|
| [ai-dev-kickoff](.claude/skills/ai-dev-kickoff/SKILL.md) | サービス名と機能説明から、インタビュー形式で CLAUDE.md と要件定義（requirements.md）を作り、プラン主導の8段階ワークフロー（/plan 〜 /refactor）を回せる土台を配置する |

### 使えるようにする

```bash
git clone https://github.com/uchu-jin/poc.git
cd poc
scripts/install-skills.sh
```

`~/.claude/skills/` にシンボリックリンクが張られ、どのフォルダで Claude Code を開いてもスキルが使える。
リンクなので、更新は `git pull` だけで反映される。

- このリポジトリのルートで Claude Code を開く場合は、インストールしなくても `.claude/skills/` から読み込まれる
- 同名のスキルが既にあるときはスキップする。置き換えるなら `scripts/install-skills.sh --force`（元のものは `.bak-<日時>` に退避）

### 使い方

新しいセッションで、たとえば次のように書く。

> 「〇〇」というサービスを作りたい。機能は〜

claude.ai で使う場合は、`.claude/skills/ai-dev-kickoff` フォルダを zip にしてスキルとしてアップロードする。
