# 世界の人工衛星から（earth-from-satellites）

世界の気象衛星（ひまわり9号、GOES-East、GOES-West）が撮った地球の最新画像を、約10分ごとに更新して眺められるミニ Web アプリ。自分と知人が「今の地球」を見て楽しむためのもの。
`uchu-jin/poc` モノレポの中の 1 つの POC。**ファイルはすべて `earth-from-satellites/` の中に作り、リポジトリ直下（`../`）には何も置かない**。
要件定義: docs/requirements/requirements.md

## 技術スタック

- TypeScript（strict）＋ Vite（UI フレームワークなし）、HTML / CSS（隣の `location/` と同じ構成）
- サーバー：Cloudflare Pages Functions（最新画像の情報を返す `/api/latest`）。入力検証は zod
- 品質：ESLint ＋ Prettier、husky ＋ lint-staged（pre-commit）
- テスト：Vitest（単体、Functions）、Playwright（E2E）
- 外部の画像配信元：公式配信を優先（GOES は NOAA STAR、ひまわりは NICT など）【要確認：具体的な URL と利用条件はプランで調べて決める】

## よく使うコマンド

【要確認：パッケージの初期化時に確定する。以下は location/ に揃えた仮置き】

- 開発サーバー：`npm run dev`（Functions 込みは `npm run dev:full`）
- 単体テスト：`npx vitest run`
- E2E：`npx playwright test <ファイル>`
- Lint：`npm run lint`、型検査：`npm run typecheck`

## ディレクトリ

【要確認：初期化時に確定する。以下は仮置き】

- `src/` ：画面と機能単位のコード（`src/features/<機能名>/`）。表示ロジックは DOM から切り離す
- `functions/` ：Pages Functions（`api/latest.ts`、配信元ごとの取得処理は `_lib/` に閉じ込める）
- `tests/unit/`、`tests/functions/`、`e2e/` ：テスト
- docs/requirements/ ：要件定義（FR-xxx / SC-xxx で参照する）
- docs/rules/ ：判定基準となるルール（architecture / security / testing）
- .claude/plans/ ：機能ごとのプラン（_template.md を複製して使う）

## 開発の進め方

- 実装に入る前に、必ず .claude/plans/ にプランを作る（/plan）
- プランは8項目で書く：概要／背景／詳細設計／テスト影響範囲／新規テストケース／実装順／コミット前テスト実行／スコープ外
- 未確定の論点は【要確認】を付けて残し、推測で埋めない
- 実装順には、タスクごとの担当モデル・サブエージェントを書く（単純作業は安価なモデル、中核ロジックは上位モデル）
- 一人開発。コミットはプランのタスク単位で、メッセージの先頭にタスク番号を付ける（例：`T2: add GOES latest image resolver`）

## 実装のルール

- プランの実装順に従う
- プランにない変更が必要になったら、実装せず立ち止まって報告する
- 要件定義・プランの「スコープ外」に書かれたものは作らない
- 設計上の約束（破らないこと）：
  - サーバー関数は、許可リストにある衛星 ID と配信元にだけアクセスする。クライアントから URL を受け取って取りに行かない
  - クライアントが読み込む画像は長辺 2000px 以下にする（スマホで 3 秒以内に表示するため）
  - 取得に失敗しても、表示中の画像は消さない
- コーディング規約：TypeScript strict、`any` は使わない。画面の文言は日本語。コメントは必要最小限

## テストのルール

- 先に失敗するテストを書き、失敗（Red）を確認してから実装する
- 最初から通ったテストは、実装済みかassertが弱いかを報告する
- 完了報告には、実行コマンドと出力を付ける
- 外部の画像配信元は、テストでは必ずモックする。実際の配信元を呼ぶのは手動のスモークテストだけ
- 時刻（撮影日時、「○分前」の判定、更新周期）は、テストでは時計を固定・注入して検証する
- コミット前に実行：`npx vitest run` ／ 影響する E2E のみ `npx playwright test <ファイル>`。pre-commit hook を `--no-verify` で飛ばさない

## レビューのルール

- 指摘は P0（実装前に必ず直す）／P1（推奨）／P2（軽微）で分類する
- 指摘には「どの記述が・どの基準と・なぜずれるか」を添える
- 判定基準：docs/rules/、docs/requirements/

## 報告のルール

- 根拠を確認できないものは推測で埋めず「不明」と答える
- プランに書いていない判断は「実装時の判断」と明示する

## 触らない場所

- `.env*`、`.dev.vars`
- ロックファイル（`package-lock.json`）の手編集
- 自動生成ファイル（`dist/`、`.wrangler/`）
- リポジトリ直下（`../`）と、ほかの POC のフォルダ（`../location/` など）
