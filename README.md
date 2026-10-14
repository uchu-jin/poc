# poc

Claude Code で POC をつくるためのリポジトリ。1つの POC = 直下の1フォルダ。

```
poc/
├── ai-dev-kickoff/   POC の土台をつくる Claude Code スキル
└── <次の POC>/       ai-dev-kickoff でつくる
```

## はじめに（クローンしたら1回だけ）

```bash
git clone https://github.com/uchu-jin/poc.git
cd poc
ai-dev-kickoff/install.sh
```

`~/.claude/skills/ai-dev-kickoff` にシンボリックリンクが張られ、どのフォルダで Claude Code を開いてもスキルが使える。リンクなので、スキルの更新は `git pull` で反映される。

- このリポジトリのルートで開く場合は、インストールしなくても `.claude/skills/` から読み込まれる
- 同名のスキルが既にあるときはスキップする。置き換えるなら `--force`（元のものは `.bak-<日時>` に退避）

## 新しい POC をつくる

1. このリポジトリのルートで Claude Code を開き、たとえば次のように書く

   > 「〇〇」というサービスを作りたい。機能は〜

2. インタビューに答えると、`poc/<サービス名>/` に CLAUDE.md・要件定義・プラン用のコマンド一式ができる
3. 以降の開発は `poc/<サービス名>/` を Claude Code で開き、`/plan <機能名>` から進める

## ルール

- 各 POC のファイルはそのフォルダの中だけに置く。リポジトリ直下には置かない
- スキルの説明は [ai-dev-kickoff/SKILL.md](ai-dev-kickoff/SKILL.md)
