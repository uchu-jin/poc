# みちすがら（location）

観光地を散歩しているあなたの現在地をもとに、周辺の観光地（OpenStreetMap）と天気（Open-Meteo）を取り込み、Claude と会話しながら街を発見できる、スマホ向けの Web アプリです。

> **状態**：開発中（T0 完了）。進め方は [.claude/plans/plans.md](.claude/plans/plans.md) を参照してください。

## ドキュメント

| ファイル                                                               | 内容                                  |
| ---------------------------------------------------------------------- | ------------------------------------- |
| [docs/requirements/requirements.md](docs/requirements/requirements.md) | 要件定義書 v1.1                       |
| [docs/decisions.md](docs/decisions.md)                                 | 決定ログ（v1.0 からの変更とその理由） |
| [.claude/plans/plans.md](.claude/plans/plans.md)                       | 実装計画（設計、テスト、実装順）      |
| [CLAUDE.md](CLAUDE.md)                                                 | このフォルダで作業するときのルール    |

## 構成（予定）

- フロントエンド：Vite ＋ TypeScript（フレームワークなし）
- サーバー：Cloudflare Pages Functions（`/api/chat`。Claude API へのプロキシ）
- テスト：Vitest、Playwright

## セットアップ

```bash
npm install                              # 依存関係の導入（husky の hook も設定されます）
cp .dev.vars.example .dev.vars           # ANTHROPIC_API_KEY などを記入（Git には含めません）
npm run dev                              # Vite の開発サーバー（フロントエンドのみ）
npm run dev:full                         # ビルド後に wrangler pages dev で Functions も起動（:8788）
npx playwright install chromium webkit   # E2E 用ブラウザ（初回のみ）
npm run e2e                              # E2E テスト
```

## デプロイ

T13 で追記します。

## データの出典

T3 で追記します（市区町村の代表座標）。

- 観光地情報：© OpenStreetMap contributors（ODbL）
- 天気情報：Open-Meteo（CC BY 4.0）
