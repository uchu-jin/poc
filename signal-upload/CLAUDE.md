# プロジェクト概要

Signal：世界の AI×デザイン・開発、UI/UX、ブランディングの記事を各媒体の公式 RSS から集めて一覧にする Web アプリ。`uchu-jin/poc` モノレポの中の 1 つの PoC で、**ファイルはすべて `signal-upload/` の中に作り、リポジトリ直下（`../`）には何も置かない**。

元のソースが失われていたため、2026-11-01 にビルド済みの JS・CSS から書き起こした（CSS は元のビルドと同一）。

## 技術スタック

- React 19 ＋ TypeScript（strict）＋ Vite
- 公開先：Cloudflare Workers（`signal.sorano-design.com`）。画面（`dist/`）は静的ファイルとして配信し、`/api/` だけを Worker（`worker/index.ts`）が受ける。設定は `wrangler.jsonc`
- RSS の中継：`/api/feed.php`。ブラウザから海外サイトの RSS を直接読めないため、Worker が代わりに取得し、10 分キャッシュする（Cloudflare のキャッシュ。取得に失敗したら古いものを返す）
  - `?id=`：`feeds.json` に登録した媒体
  - `?url=`：利用者が追加したサイト。サイトの URL ならページ内の `<link rel="alternate">` から RSS を探す。社内網などへの取得を防ぐため、http/https・ポート 80/443・公開ホストだけを通し、リダイレクト先も1つずつ確かめ、RSS/Atom 以外は返さない
- サイト情報の中継：`/api/ogp.php`。デザイン会社を追加するとき、ページの `<head>` から `<title>`・`<meta>`・`<link>` のタグだけを返す（1 日キャッシュ）。読み取りは `src/lib/ogp.ts`
- 同期：`/api/sync.php`。登録なしで、サイトの追加・削除（`customSources`・`removedSources`・`customStudios`・`removedStudios`）を同期コードごとに Workers KV（`SYNC`）へ保存する。コードは I・O・0・1 を除いた英数字16文字で、知っている人は誰でも読み書きできる（合言葉として扱う）。KV のキーはコードの SHA-256。1 つの IP から1日に作れるコードは20個まで。同時に編集したときは、あとから保存したほうが残る（KV は端末間の反映に最大1分ほどかかる）
- URL は PHP 時代のまま（`api/*.php`）にしているので、画面側は変えていない。`public/api/*.php` は PHP が動くレンタルサーバーに置く場合の版として残している（Worker では配信しない）
- 品質：ESLint（react-hooks を含む）＋ Prettier
- テスト：Vitest（jsdom）

## ディレクトリ

- `worker/index.ts` ：Cloudflare Worker（`/api/` の3つ）。`worker/lib.ts` は外の環境に依存しない判定（`tests/worker.test.ts` で確認）
- `src/data/sources.ts` ：媒体の一覧、カテゴリ、地域、期間、AI 判定の正規表現
- `src/data/studios.ts`、`studios-ogp.json` ：「デザイン会社」タブの会社一覧と、各社サイトの OGP（取得済みの値を固定で持つ）
- `src/lib/parseFeed.ts` ：RSS / Atom の解析と、記事の重複統合
- `src/lib/sources.ts` ：利用者が追加・削除したサイトとデザイン会社の扱い（URL の正規化、重複判定など）
- `src/lib/ogp.ts` ：デザイン会社のサイト名・説明・画像・アイコンの読み取り
- `src/lib/sync.ts` ：同期コードの形と、サーバーから読んだ内容の確認
- `src/hooks/` ：フィード取得（`useFeeds`）、サイト一覧（`useSources`）、デザイン会社の一覧（`useStudios`）、同期（`useSync`）、localStorage（`useLocalStorage`）
- `src/components/` ：カード類、サイドバー、サイト管理ページ（`SitesPage`、URL は `#/sites`）と同期の欄（`SyncPanel`）
- `public/api/` ：`feeds.json`（中継してよい媒体の id → URL。Worker も読む）と、PHP 版の `feed.php`・`ogp.php`・`sync.php`・`_lib.php`
- `tests/` ：単体テストと、RSS / Atom のサンプル（`fixtures/`）

## 開発

```bash
npm install          # .npmrc で legacy-peer-deps を有効にしている（npm の peer 解決の不具合を避けるため）
npm run dev          # PHP がなくても動く。vite.config.ts が feed.php・ogp.php・sync.php と同じ処理をする（キャッシュなし、同期の保存先はメモリ）
npx vitest run
npm run typecheck && npm run lint
npm run build        # dist/ ができる
npm run dev:worker   # ビルドして wrangler dev で Worker ごと動かす（http://localhost:8787、KV はローカルの仮のもの）
```

## デプロイ

`main` ブランチに push すると、Cloudflare（Workers & Pages の `signal`、ルートディレクトリ `signal-upload`）が `npm run build` → `npx wrangler deploy` を実行して公開する。独自ドメイン `signal.sorano-design.com` は `wrangler.jsonc` の `routes` で設定している。

- 同期の保存先の KV は Cloudflare ダッシュボードで作り、その ID を `wrangler.jsonc` の `kv_namespaces` に書く
- 無料プランの上限：`/api/` への処理は1日10万リクエスト、KV の書き込みは1日1,000回。画面の配信は無制限

## ルール

- 初期の媒体を追加・変更するときは、`src/data/sources.ts` と `public/api/feeds.json` の両方を直す（`tests/feeds-json.test.ts` が一致を確認する）
- `/api/` の動きを変えるときは、`worker/`、開発用の `vite.config.ts`、PHP 版の `public/api/*.php` をそろえる
- 画面の文言は日本語。`any` は使わない。コメントは必要最小限
- localStorage のキー（`cat`、`period`、`region`、`hiddenSources`、`saved`、`read`、`theme`、`customSources`、`removedSources`、`customStudios`、`removedStudios`、`syncCode`、`syncBase`）は利用者の保存内容なので、名前や形を変えるときは移行を考える
