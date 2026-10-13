# CLAUDE.md — みちすがら（location）

## 前提
- ここは `uchu-jin/poc` モノレポの中の 1 つの PoC。**ファイルはすべて `location/` の中に作る。リポジトリ直下（`../`）には何も置かない**
- 正本：
  - 要件：`docs/requirements/requirements.md`（v1.1）
  - 判断の理由：`docs/decisions.md`
  - 実装計画：`.claude/plans/plans.md`
- 要件や設計を変えたら、要件書と決定ログ（D-xx を追加）を同じコミットで更新する

## 設計上の約束（破らないこと）
- Claude API キーはサーバー側（`functions/`）だけが持つ。クライアントのコードに出さない
- システムプロンプトはサーバー側で固定する。クライアントから指示文を受け取らない
- `/api/chat` と Open-Meteo に送る座標は小数 3 桁に丸める。サーバーは座標や会話の本文をログに出さない
- Overpass では「取得失敗」と「0 件」を区別する。5km の再検索に進むのは 0 件のときだけ
- `notice`（システム通知）は AI に送る履歴に含めない
- 外部 API（Overpass、Open-Meteo、Anthropic）は、テストでは必ずモックする。実 API を呼ぶのは `npm run smoke` だけ
- モデル ID は `claude-haiku-5-5`（既定）と `claude-sonnet-5-5` のみ。日付付きの ID は使わない

## コマンド（T1 で整備）
```bash
npm run dev         # Vite ＋ wrangler pages dev
npm run typecheck
npm run lint
npm run test        # Vitest（unit ＋ functions）
npm run e2e         # Playwright（手動で実行）
```

## コミット
- pre-commit hook（`.husky/pre-commit`）が typecheck、lint、unit を実行する。`--no-verify` は使わない
- コミットは計画のタスク単位（T0、T1…）。メッセージの先頭にタスク番号を付ける（例：`T2: add movement detection`）

## コーディング規約
- TypeScript strict。`any` は使わない
- UI は `src/state/store.ts` だけを購読し、ドメイン層（`src/domain`）は DOM に依存させない
- 画面に出す文言は日本語。コード内のコメントは必要最小限にする
