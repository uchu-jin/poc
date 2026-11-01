# プロジェクト概要

みちすがら：観光地を散歩しているユーザーの現在地をもとに、周辺の観光地（OpenStreetMap / Overpass）と天気（Open-Meteo）を取り込み、Claude との会話で街を発見できるスマホ向け Web アプリ。`uchu-jin/poc` モノレポの中の 1 つの PoC で、**ファイルはすべて `location/` の中に作り、リポジトリ直下（`../`）には何も置かない**。

## 技術スタック

- TypeScript（strict）＋ Vite（UI フレームワークなし）、HTML / CSS
- サーバー：Cloudflare Pages Functions（`/api/chat`）＋ `@anthropic-ai/sdk`、入力検証は zod
- AI モデル：`claude-haiku-5-5`（既定）／ `claude-sonnet-5-5`（環境変数 `CLAUDE_MODEL` で切替）。日付付きの ID は使わない
- 品質：ESLint ＋ Prettier、husky ＋ lint-staged（pre-commit）
- テスト：Vitest（単体、Functions）、Playwright（E2E。chromium と webkit）

## ディレクトリ

- `src/domain/` ：型、距離・方位、移動判定、履歴、時刻（DOM に依存させない）
- `src/storage/` ：localStorage のラッパー
- `src/poi/`、`src/weather/`、`src/chat/`、`src/location/`、`src/ui/`、`src/state/` ：機能単位のコード
- `src/data/` ：生成データ（市区町村の代表座標。T3 で生成）
- `functions/` ：Pages Functions（`api/chat.ts`、`_lib/` にプロンプト・検証・ガード）
- `tests/unit/`、`tests/functions/`、`e2e/` ：テスト
- `scripts/` ：ビルド検査（`check-bundle.mjs`）、スモークテスト、データ生成
- `docs/requirements/` ：要件定義（`requirements.md` v1.1）
- `docs/decisions.md` ：決定ログ（D-xx）
- `docs/rules/` ：判定基準となるルール（アーキテクチャ、セキュリティ等）【要確認：まだ存在しない。現状の判定基準は要件定義と決定ログ】
- `.claude/plans/` ：プラン（現状は MVP 全体で `plans.md` 1 本と、そのレビュー `review.md`）

【要確認】テンプレートの「`src/features/<機能名>/`」には揃えていない。現状は機能ごとに `src/` 直下のフォルダに分けている（計画 3.1）。揃える場合はプランの変更として扱う。

## 開発の進め方

- 実装に入る前に、必ず `.claude/plans/` にプランを作る
- プランは 8 項目で書く：概要／背景／詳細設計／テスト影響範囲／新規テストケース／実装順／コミット前テスト実行／スコープ外
- 未確定の論点は【要確認】を付けて残し、推測で埋めない
- 実装順には、タスクごとの担当モデル・サブエージェントを書く
- 要件や設計を変えたら、要件書と決定ログ（D-xx を追加）を同じコミットで更新する
- コミットはプランのタスク単位で、メッセージの先頭にタスク番号を付ける（例：`T2: add movement detection`）

## 実装のルール

- プランの実装順に従う
- プランにない変更が必要になったら、実装せず立ち止まって報告する
- スコープ外に書かれたものは作らない
- 設計上の約束（破らないこと）：
  - Claude API キーはサーバー側（`functions/`）だけが持つ。クライアントのコードに出さない
  - システムプロンプトはサーバー側で固定する。クライアントから指示文を受け取らない
  - `/api/chat` と Open-Meteo に送る座標は小数 3 桁に丸める。サーバーは座標や会話の本文をログに出さない
  - Overpass では「取得失敗」と「0 件」を区別する。5km の再検索に進むのは 0 件のときだけ
  - `notice`（システム通知）は AI に送る履歴に含めない
  - UI は `src/state/store.ts` だけを購読する
- コーディング規約：TypeScript strict、`any` は使わない。画面の文言は日本語。コード内のコメントは必要最小限にする

## テストのルール

- 先に失敗するテストを書き、失敗（Red）を確認してから実装する
- 最初から通ったテストは、実装済みか assert が弱いかを報告する
- 完了報告には、実行コマンドと出力を付ける
- 外部 API（Overpass、Open-Meteo、Anthropic）は、テストでは必ずモックする。実 API を呼ぶのは `npm run smoke` だけ（手動、課金あり）
- コミット前に実行：`npx vitest run` ／ 影響する E2E のみ `npx playwright test <ファイル>`
  - pre-commit hook（`.husky/pre-commit`）が typecheck、lint-staged、`vitest --run` を自動で実行する。`--no-verify` は使わない
  - PR の前には、加えて `npm run build && npm run check:bundle`（API キー関連の文字列がビルド成果物にないかの検査）を実行する

## レビューのルール

- 指摘は P0（実装前に必ず直す）／P1（推奨）／P2（軽微）で分類する
- 指摘には「どの記述が・どの基準と・なぜずれるか」を添える

## 報告のルール

- 根拠を確認できないものは推測で埋めず「不明」と答える
- プランに書いていない判断は「実装時の判断」と明示する

## 触らない場所

- `package-lock.json`：手で編集しない（`npm install` でだけ更新する）
- `src/data/*.json`：生成物。手で編集せず、`scripts/` の生成スクリプトを直して再生成する
- `.husky/_/`：husky が自動生成する
- `dist/`、`.wrangler/`、`test-results/`、`playwright-report/`：ビルドやテストの出力
- `.dev.vars`：API キーなどの秘密情報。読まない、コミットしない（例は `.dev.vars.example`）
- `wrangler.toml` のバインディングと本番の環境変数：T13（デプロイ手順）以外では変えない
- `.claude/launch.json`：このプロジェクトの作業で作ったものではないため触らない
- リポジトリ直下（`../`）：何も置かない
