# プロジェクト概要

Signal：世界の AI×デザイン・開発、UI/UX、ブランディングの記事を各媒体の公式 RSS から集めて一覧にする Web アプリ。`uchu-jin/poc` モノレポの中の 1 つの PoC で、**ファイルはすべて `signal-upload/` の中に作り、リポジトリ直下（`../`）には何も置かない**。

元のソースが失われていたため、2026-11-01 にビルド済みの JS・CSS から書き起こした（CSS は元のビルドと同一）。

## 技術スタック

- React 19 ＋ TypeScript（strict）＋ Vite
- RSS の中継：PHP（`public/api/feed.php`）。ブラウザから海外サイトの RSS を直接読めないため、レンタルサーバー上の PHP が代わりに取得し、10 分キャッシュする
- 品質：ESLint（react-hooks を含む）＋ Prettier
- テスト：Vitest（jsdom）

## ディレクトリ

- `src/data/sources.ts` ：媒体の一覧、カテゴリ、地域、期間、AI 判定の正規表現
- `src/data/studios.ts`、`studios-ogp.json` ：「デザイン会社」タブの会社一覧と、各社サイトの OGP（取得済みの値を固定で持つ）
- `src/lib/parseFeed.ts` ：RSS / Atom の解析と、記事の重複統合
- `src/hooks/` ：フィード取得（`useFeeds`）、localStorage（`useLocalStorage`）
- `src/components/` ：カード類とサイドバー
- `public/api/` ：`feed.php` と `feeds.json`（中継してよい媒体の id → URL）
- `tests/` ：単体テストと、RSS / Atom のサンプル（`fixtures/`）

## 開発

```bash
npm install          # .npmrc で legacy-peer-deps を有効にしている（npm の peer 解決の不具合を避けるため）
npm run dev          # PHP がなくても動く。vite.config.ts が feed.php と同じ中継をする（キャッシュなし）
npx vitest run
npm run typecheck && npm run lint
npm run build        # dist/ ができる
```

## デプロイ

`dist/` の中身を PHP が動くサーバーにアップロードする。`api/cache/` は PHP が自動で作る（書き込み権限が必要）。

## ルール

- 媒体を追加・変更するときは、`src/data/sources.ts` と `public/api/feeds.json` の両方を直す（`tests/feeds-json.test.ts` が一致を確認する）
- 画面の文言は日本語。`any` は使わない。コメントは必要最小限
- localStorage のキー（`cat`、`period`、`region`、`hiddenSources`、`saved`、`read`、`theme`）は利用者の保存内容なので、名前や形を変えるときは移行を考える
