# プロジェクト概要

ai-dev-kickoff：新規プロジェクトに AI 駆動開発の土台（CLAUDE.md・要件定義・8段階ワークフローのコマンドとサブエージェント・ADR）を用意する Claude Code のスキル。`uchu-jin/poc` モノレポの中にあり、**ファイルはすべて `ai-dev-kickoff/` の中に作り、リポジトリ直下（`../`）や他のアプリのフォルダには何も置かない**。

このファイルは「スキルを開発するときのルール」。スキルが配置先に書き出す CLAUDE.md のひな形は `assets/CLAUDE.md.tmpl` で、別物。

## ディレクトリ

- `SKILL.md` ：スキル本体（Claude が読む手順）。frontmatter の `description` が発動条件になる
- `references/interview.md` ：インタビューの質問バンクと「おまかせ」時の既定値
- `assets/*.tmpl` ：Claude がインタビュー結果で埋めて書き出すひな形（CLAUDE.md・requirements.md・workflow.md）
- `assets/scaffold/` ：配置先にそのままコピーする静的ファイル（`.claude/commands`・`.claude/agents`・`.claude/plans`・`docs/adr`・`docs/rules`・`docs/requirements`）
- `scripts/scaffold.sh` ：`assets/scaffold/` を配置先にコピーする。既存ファイルは上書きしない
- `install.sh` ：`~/.claude/skills/` にシンボリックリンクで登録する

## 開発の進め方

- `~/.claude/skills/ai-dev-kickoff` と `poc/.claude/skills/ai-dev-kickoff` はこのフォルダへのシンボリックリンク。**保存した時点で全セッションのスキルに反映される**ので、書きかけの状態で長く置かない
- 機能を足したら、関係する箇所を同じコミットでそろえる：
  - `assets/scaffold/` にファイルを足した・消した → `SKILL.md` の 2-1 のツリー
  - 配置先で使うコマンドを足した → `assets/workflow.md.tmpl`、`SKILL.md` の Step 3（作者に伝えること）、必要なら `description`
  - ひな形の章立てを変えた → それを書き出す `SKILL.md` の 2-x の手順と、そのひな形を読むコマンド
- 1つのコマンドは1つの段階だけを担う。コマンドの終わりに `docs/workflow.md` の進み具合を更新させる書き方をそろえる
- コミットメッセージは英語で、何を足したかを一文で（例：`Add ADR support to ai-dev-kickoff`）

## 書き方のルール

- 生成物・コマンド・テンプレートの文章は日本語。です・ます調ではなく、言い切りの指示文（「〜すること」「〜する」）
- テンプレートの埋める箇所は `［ ］`、未決は【要確認】、仮の値は「（仮置き）」。この3つの記号は配置先でも意味を持つので、表記を変えない
- 番号の体系（FR-xxx、SC-xxx、ADR-NNNN、V-xx、P0/P1/P2、段階 1〜8）は全ファイルで共通。変えるときは grep して全部そろえる
- 人間が決めることを AI に決めさせない書き方を保つ（承認・採択・スコープ外の変更は人間）
- アプリのコード（`src/`、パッケージの初期化）を生成する手順は足さない。土台までがこのスキルの範囲

## 確かめ方

- 配置の確認：スクラッチのディレクトリに `bash scripts/scaffold.sh <dir>` を2回実行し、1回目に全件 create、2回目に全件 skip になること
- 文書どうしの整合：`grep -rn "<コマンド名や番号>" .` で、SKILL.md・テンプレート・コマンドの記述がそろっていること
- 振る舞いの確認が要る変更（インタビューや生成の手順）は、スクラッチのディレクトリでスキルを最後まで通して試す。モノレポの中では試さない
