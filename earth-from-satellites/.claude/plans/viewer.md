# プラン：最新画像の表示・衛星の切り替え・定期更新（画面）

状態：承認済み（作者が未確定事項 #3〜#6 に回答。2026-10-15）。/review-plan・/review-tests の P0・P1 を反映済み（下の「レビューへの対応」）｜元資料：docs/requirements/requirements.md（ストーリー1〜3、FR-001〜FR-008、FR-012、§6 エッジケース、§7 非機能、SC-001・SC-002）

## 1. 概要

アプリを開くと、選んでいる衛星（初回はひまわり9号）の最新画像を、衛星名・撮影日時・クレジットとともに表示する。3つの衛星をボタンで切り替えられる。画面が表に出ている間は10分ごとに `/api/latest` を確かめ、撮影日時が新しければ画像を差し替える。

取得に失敗したときは、次のように振る舞う。

- 表示中の画像は残し、「更新できませんでした」と出す
- 表示できる画像がないときは、空白にせず「取得できませんでした」と出す
- どちらも次の周期で自動的に再試行し、その旨も添える

撮影日時が60分以上前の画像には、「○分前の画像です」と添える。

## 2. 背景

- ストーリー1〜3（P1）の画面側。`/api/latest`（プラン latest-image-api）の上に作る
- 作者の回答（2026-10-15）で、未確定事項 #3〜#6 が決まった
  - #3：切り替え先の取得に失敗したら、画像を空にして、選んだ衛星名と「取得できませんでした」を出す
  - #4：初回はひまわり9号。選んだ衛星はブラウザに保存し、次回もその衛星で始める
  - #5：しきい値は60分
  - #6：撮影日時は、端末のタイムゾーンで表示する
  - これらは V1 で要件定義に反映する
- SC-001（4G で3秒以内）のため、スマホには 700px 以下の画像だけを読ませる

## 3. 詳細設計

変更するファイル（すべて `earth-from-satellites/` の中）：

### 共有の取り決め

- `shared/contract.ts`（新規）：画面とサーバーの両方が参照する、純粋な定数と型だけを置く。サーバー専用の処理や Workers の型は含めない
  - `SATELLITE_IDS`、`SatelliteId`
  - 衛星の表示名 `SATELLITE_NAMES`
  - `LatestImage` の型
  - 画像を取る許可ホスト `IMAGE_HOSTS`、クレジットのリンクの許可ホスト `CREDIT_HOSTS`
  - `MAX_IMAGE_WIDTH = 2000`
- 上の定数を参照するよう、次を直す（値の二重管理をやめるだけで、振る舞いは変えない）
  - `functions/_lib/satellites.ts`
  - `functions/_lib/types.ts`
  - `functions/_lib/validate.ts`
- `src` から `functions/` は import しない（API の境界を守る）

### 画面のモジュール（`src/features/viewer/`）

- `latestClient.ts`：`fetchLatest(id, deps)`
  - `/api/latest?satellite=<id>` を `cache: 'no-cache'` で取得する（ブラウザのキャッシュを通さず、鮮度を約15分に保つ）
  - 応答を zod で検証する。満たさなければ失敗とする
    - `satelliteId` が要求した ID と一致する
    - `capturedAt` が日時として読める
    - `images` は1〜5件。各 `url` は https で、ホストが `IMAGE_HOSTS` のどれか
    - `width` は 1〜2000 の整数
    - 文字列は最大 2048 文字
  - `credit.url` が https で `CREDIT_HOSTS` に入っていないときは、失敗にはせず、リンクを外して文字だけを出す（`linkUrl: null`）
  - 失敗（非2xx、通信エラー、形式不正、8秒のタイムアウト）は、すべて `{ ok: false }` にまとめる
  - fetch は注入する。タイムアウトは `setTimeout` を使い、テストではフェイクタイマーで進める
  - zod の推論型が `LatestImage` と一致することを、`satisfies` で型として確かめる
- `state.ts`：表示状態の純粋な遷移
  - 状態：`{ satelliteId, image: LatestImage | null, status: 'loading' | 'ok' | 'error', requestId }`
  - `initialState(id)`：`loading`、画像は null、`requestId` は 0
  - `select(id)`
    - 選択中と同じ ID なら何もしない
    - 違う ID なら、画像を空にして `loading` にし、`requestId` を進める
  - `refreshStarted`：`requestId` を進める。`status` と画像は変えない
  - `shouldReplace(state, image)`：画像がない、または撮影日時（`Date.parse` で比べる）が表示中より新しいときに真
  - `loaded(requestId, image)`
    - `requestId` が最新でなければ無視する
    - 最新なら、`shouldReplace` が真のとき画像を差し替える
    - どちらの場合も `status` は `ok` にする
  - `failed(requestId)`：`requestId` が最新でなければ無視する。最新なら `error` にし、画像は残す
  - 最新の要求の結果だけを反映するので、次の場合も、後から返った古い結果で表示を上書きしない
    - 切り替えと定期更新が重なったとき
    - 定期更新どうしが重なったとき
- `freshness.ts`：`staleMinutes(capturedAt, now)`
  - 60分以上前なら経過分（切り捨て）を返し、そうでなければ null を返す
  - 日時として読めない値は null を返す
- `format.ts`：`formatCapturedAt(iso, timeZone?)`
  - `Intl.DateTimeFormat('ja-JP', { …, timeZoneName: 'short' })` で、例「2026/10/15 0:30 JST」の形にする
  - タイムゾーンはテストで注入する
- `messages.ts`：画面に出す文言の定数
  - 「読み込み中…」
  - 「更新できませんでした（10分後に自動で再試行します）」
  - 「取得できませんでした（10分後に自動で再試行します）」
  - 「○分前の画像です」
- `scheduler.ts`：`createScheduler({ intervalMs, clock, visibility, onTick, minGapMs })`
  - `visibility` は `{ isVisible(): boolean; subscribe(cb): () => void }` を注入する（DOM から切り離す）
  - 開始時に表なら、すぐ1回呼ぶ
  - 表に出ている間は、`intervalMs` ごとに呼ぶ
  - 裏に回ったら止める
  - 表に戻ったら、すぐ呼んでから周期を再開する
  - ただし前回の呼び出しから `minGapMs` 以内なら、すぐには呼ばない（タブの行き来で Functions を呼びすぎないため）
  - 同じ状態の通知が続いても、タイマーを二重にしない
  - 10分ごとの更新（`intervalMs` 600000、`minGapMs` 60000）と、1分ごとの「○分前」の表示更新（60000、`onTick` は再描画だけ）の両方に使う
- `storage.ts`：選んだ衛星の保存と読み出し
  - キーは `earth-from-satellites:satellite`
  - 読み出しも書き込みも try/catch で包む
  - 読めない値や許可リスト外の値は、`himawari9` に戻す
- `view.ts`：DOM の描画（状態と now → DOM）
  - 衛星のボタンは3つ。選択中のものだけ `aria-pressed="true"` にする
  - 画像は `<picture>` を使う
    - `<source media="(max-width: 720px)" srcset=…>` には、幅 700 以下の候補だけを入れる
    - `<img srcset=… sizes="720px">` には、全候補を入れる
    - 画像がないときは `<picture>` ごと隠す
  - 画像の下に次を表示する
    - 衛星名
    - 撮影日時：`<time datetime="ISO">`
    - 「○分前の画像です」
    - クレジット：`<a href target="_blank" rel="noopener noreferrer">`。`linkUrl` が null のときは文字だけにする
  - 状態のメッセージは `role="status"` で出す
  - 文字列は `textContent` で入れ、属性は `setAttribute` で入れる（innerHTML は使わない）
  - `srcset` は `new URL(url).href` で組み立てる
- `app.ts`：上の部品をつなぐ
  - 取得の流れ
    1. `refreshStarted`（または `select`）で `requestId` を得る
    2. `fetchLatest` を呼ぶ
    3. 成功したら、`shouldReplace` が真のときだけ `Image.decode()` で読み込みを終える
    4. `loaded` を送る。`requestId` は state 側で照合し直す
  - decode に失敗したら `failed` を送る（FR-005／FR-006）
  - 衛星のボタンを押したら、`storage` に保存し、`select` してから取得する

### 起動・見た目・配信

- `src/main.ts`、`src/style.css`：起動と見た目
  - 宇宙っぽい暗い背景
  - 画像は正方形で、画面の短い辺（最大 720px）に収める
- `index.html`：CIRA と STAR への `preconnect` を入れる。最初の `<img>` に `fetchpriority="high"` を付ける（SC-001）
- `public/_headers`：Cloudflare Pages の本番応答に CSP を付ける
  - `img-src 'self' https://cdn.star.nesdis.noaa.gov https://slider.cira.colostate.edu`
  - `connect-src 'self'`、`script-src 'self'`、`object-src 'none'`、`base-uri 'none'`

### テストの基盤・設定

- `playwright.config.ts`：location/ と同じ構成（Chromium と WebKit。`vite preview` を使う）
- `e2e/viewer.spec.ts`：`/api/latest` と画像の URL は `page.route` でモックし、実際の配信元には出ない
- `tsconfig.json`：include に `tests/unit` と `e2e`、`shared` を足す。`tests/functions` は exclude に残す（Workers の型を使うため。functions 側の tsconfig で検査する）
- `functions/tsconfig.json`：include に `../shared` を足す
- `vitest.config.ts`：`tests/unit` を jsdom で動かす
- 依存の追加（devDependencies、location/ と同じ版）
  - `@playwright/test ^1.64.0`：E2E のため
  - `jsdom ^28.1.0`：`view.ts` の単体テストのため

### 要件定義の更新（V1）

- ストーリー2-2 の Then を #3 の決定に合わせる
- FR-001・FR-002・FR-007 の「仮置き」を外す
- §6 のタブの扱いを、仮置きから決定にする
- §8 に「端末には選んだ衛星だけを保存する」と足す
- §12 から #3〜#6 を消す

### 判断済みの論点

- 定期更新の間隔は10分（FR-004）。失敗したときの再試行も、同じ周期で行う（FR-005／FR-006）
- 鮮度：画面からの取得は `cache: 'no-cache'` にする。遅れは「10分ごとの確認」と「エッジのキャッシュ5分」の合計で、最大約15分（§7）。`/api/latest` は変えない
- 応答の検証は、サーバーと同じ許可ホストで行う（多層防御。security.md）
- 同じ衛星のボタンをもう一度押しても、何もしない（ちらつかせない）
- リファラはブラウザの既定のまま送る（出所を隠さない）
- 【要確認】配信元の画像を外部サイトから直接参照してよいか（要件 §12 #1）。公開前に作者が確認する。手動スモークで、`wrangler pages dev` のオリジンから3衛星の画像が表示されることを確かめる
- 【要確認】pre-commit フック（未確定事項 #12）は今回も入れない

## 4. テスト影響範囲

- 共有モジュールに移しても、`tests/functions` の80件は振る舞いが変わらないので、そのまま通ること（import 先だけが変わる）
- `tsconfig.json` は `tests/functions` を引き続き外すので、型検査は functions 側で行う
- `vitest.config.ts` は、`tests/unit` だけ環境を jsdom にする

## 5. 新規テストケース

単体（`tests/unit/`。時計・fetch・storage は注入またはモック）：

- `contract`：`SATELLITE_IDS` は3つで、表示名がすべてある。サーバーの `SATELLITES` と ID がそろう
- `state`
  - 初期状態は `loading` で、画像は null
  - `loaded` で `ok` になり、画像が入る
  - `select(別の ID)` で、画像が空になり、`loading` になり、`requestId` が進む
  - `select(同じ ID)` では何も変わらない
  - `refreshStarted` で `requestId` が進み、画像と `status` は変わらない
  - 古い `requestId` の `loaded`・`failed` は無視する（次の2つの場面）
    - 切り替えのあとに、前の衛星の結果が返ったとき
    - `refreshStarted` のあとに、前の要求の `failed` が返ったとき
  - 画像があり `error` の状態で、撮影日時が同じものを `loaded` → 画像はそのままで `ok` になる
  - 撮影日時が古いものを `loaded` → 画像は差し替えない
  - 画像がある状態で `failed` → 画像を残して `error`
  - 画像がない状態で `failed` → `error` で画像は null
  - `shouldReplace`：画像なし → 真。新しい → 真。同じ → 偽。古い → 偽。表記の揺れ（`…00Z` と `…00.000Z`）は「同じ」とみなす
- `freshness`
  - 59分59秒前 → null
  - ちょうど60分前 → 60
  - 61分30秒前 → 61
  - 未来の時刻 → null
  - 日時として読めない値 → null
- `format`
  - `2026-10-14T15:30:00Z` を Asia/Tokyo で表示 → 「2026/10/15 0:30 JST」
  - 同じ時刻を UTC で表示 → 「2026/10/14 15:30 UTC」
- `latestClient`
  - 正常 → `{ ok: true, image }`。要求先は `/api/latest?satellite=goes-east`、`cache` は `no-cache`
  - 次のときは `{ ok: false }`
    - 非2xx
    - 通信エラー
    - JSON でない
    - 必須項目がない
    - `capturedAt` が "not-a-date"
    - `satelliteId` が要求と違う
    - 画像の URL が http
    - 画像の URL が許可外のホスト
    - `width` が 2001
    - `images` が空配列
  - タイムアウト：7.9秒で応答があれば ok、8秒たつと `{ ok: false }`
  - `credit.url` が `javascript:alert(1)` または許可外のホスト → ok だが `linkUrl` は null
- `scheduler`
  - 開始時、表ならすぐ1回呼ぶ。裏なら呼ばない
  - 9分59秒では2回目を呼ばず、10分ちょうどで呼ぶ
  - 裏に回ると止まる
  - 表に戻るとすぐ呼び、そこから10分後にまた呼ぶ
  - 表に戻ったのが前回から1分以内なら、すぐには呼ばない
  - 表の通知が2回続いても、タイマーは二重にならない
  - stop で止まる
- `storage`
  - 保存した値を読み戻せる
  - 次のときは `himawari9` に戻る
    - 未保存
    - 許可外の値
    - `getItem` が例外を投げる
  - `setItem` が例外を投げても、例外が外に出ない
- `view`（jsdom）
  - `ok` のとき、次が入る
    - 衛星名
    - 撮影日時（`<time datetime>` に元の ISO）
    - クレジット（href と `target="_blank"`・`rel="noopener noreferrer"`）
    - `img` の srcset
  - スマホ用の `<source>` には、幅 700 以下の候補だけが入る
  - ボタンは3つで、選択中だけ `aria-pressed="true"`
  - `loading` で画像がないとき、「読み込み中…」を出し、画像を隠す
  - `error` で画像があるときは「更新できませんでした…」を出す。画像がないときは「取得できませんでした…」と選んだ衛星名を出す
  - `ok` のとき、状態のメッセージは空
  - 撮影日時が60分前なら「60分前の画像です」を出す。59分前なら出さない
  - 衛星名とクレジットに `<b>` を含む値を渡しても、要素にならない
  - `linkUrl` が null のとき、クレジットは文字だけで、リンクにならない

E2E（`e2e/viewer.spec.ts`。`/api/latest` と画像はモック、時計は `page.clock`）：

- 開くと、ひまわり9号の画像・衛星名・撮影日時・クレジットが出る（受け入れシナリオ 1-1、FR-001、FR-002、FR-012）
- 初回の取得が 500 だと「取得できませんでした」が出て、空白にならない。10分進めて 200 にすると、画像が出てメッセージが消える（1-3、FR-006）
- 初回の画像 URL が 404 だと「取得できませんでした」が出る（FR-006）
- GOES-East を押すと、画像と衛星名が GOES-East のものになる。再読み込み後も GOES-East で始まる（2-1、FR-003、#4）
- 切り替え先が 500 のとき（2-2、#3）
  - GOES-East の名前と「取得できませんでした」が出て、前のひまわりの画像は見えない
  - 10分進めると `satellite=goes-east` を取り直し、画像が出る
- ひまわりの応答を遅らせている間に GOES-East を押すと、後からひまわりの応答が返っても GOES-East のまま（§6）
- 10分進めると、撮影日時が新しい画像に差し替わる（3-1、FR-004）
- 10分進めても撮影日時が同じなら、画像の要求は増えない（FR-004）
- 更新に失敗すると、前の画像を残したまま「更新できませんでした」が出て、次の成功で消える（3-2、FR-005）
- 更新先の画像 URL が 404 だと、前の画像を残したまま「更新できませんでした」が出る（FR-005）
- 撮影日時が90分前だと「90分前の画像です」が出る（3-3、FR-007）
- 撮影日時が59分前のとき、時計を1分進めると「60分前の画像です」が出る。`/api/latest` の要求は増えない（FR-007）
- スマホ（幅 375px、`deviceScaleFactor: 3`）では、1808px の画像を読み込まない。PC 幅では 1808px を読む（1-2、FR-008）

手動スモーク（実際の配信元。V5）：

- `npm run dev:full` で、3衛星の表示、切り替え、スマホ幅、クレジット、CSP の違反がないことを確かめる
- SC-001：Playwright（Chromium）で回線を絞って測る
  - 条件は WebPageTest の「4G」相当（下り 9Mbps、往復 170ms）
  - ひまわりの初回表示が終わるまで（画像の load）を3回測り、中央値が3秒以内なら合格
  - 計測スクリプトは `scripts/measure-sc001.mjs`
  - 3秒を超えた場合は、結果を記録して【要確認】として作者に判断を仰ぐ
- SC-002（30分以上開いたままにする）：作者が段階 7 で確かめる。手順はプランの付記に書く

## 6. 実装順

1. V1：基盤
   - Playwright・jsdom を追加し、tsconfig と vitest を設定する
   - 空の E2E が通ることを確かめる
   - 要件定義を更新する
   - 担当：単純作業
2. V2：`shared/contract.ts` とサーバー側の参照の付け替え（既存80件が通ること）、`freshness`・`format`・`messages`・`storage` のテスト → Red → 実装（担当：単純作業）
3. V3：`state`・`scheduler`・`latestClient` のテスト → Red → 実装（担当：上位モデル。競合と時計の扱いが中核）
4. V4：`view`・`app`・`main`・CSS・`index.html`・`_headers` のテスト → Red → 実装（担当：上位モデル）
5. V5：E2E → Red → 不足の修正、手動スモークと SC-001 の計測（担当：上位モデル）
6. 実装完了後、/review-impl で観点別レビュー3体を並列実行し、P0/P1 を修正

コミットはタスク単位で、先頭にタスク番号を付ける（例：`V3: add viewer state and scheduler`）。

## 7. コミット前テスト実行

- `cd earth-from-satellites && npm run typecheck && npm run lint && npx vitest run`
- `npx playwright test e2e/viewer.spec.ts`

## 8. スコープ外

- 拡大・パン、タイムラプス、全画面（P2）
- 過去の日付、観測バンドの切り替え（P3）
- ひまわりの高解像度（タイル結合）
- 画像の保存・共有
- オフライン対応、Service Worker
- pre-commit フックの導入（未確定事項 #12）
- `/api/latest` の振る舞いの変更（共有の定数への付け替えだけを行う）
- 「○分前」を時間単位で表示すること（要件は「○分前」）

## レビューへの対応（/review-plan・/review-tests、2026-10-15）

- 反映した主なもの
  - P0
    - スマホで 1808px を読む問題 → `<picture>` で解決
    - 鮮度 → `no-cache` で解決
    - `refreshStarted` の遷移を決めた
  - P1
    - 共有モジュール
    - 画面側の許可ホストの検証
    - クレジットのリンクの検証と target／rel
    - scheduler への visibility の注入
    - 1分ごとの表示更新に scheduler を再利用
    - tsconfig の範囲
    - 要件定義の更新
    - SC-001 の計測条件
    - テストの追加：再試行の回復、競合、decode の失敗、しきい値の下側、1分ごとの更新、status の復帰、書き込みの例外、GOES-West・ボタン3つ
  - P2
    - CSP
    - タイムゾーンの表記
    - 再試行の案内文
    - 応答の `satelliteId` の照合
    - タブの行き来の間引き
    - 文言の分離
    - `Date.parse` での比較
    - 同じ衛星の再選択
- 見送ったもの
  - 「○分前」の時間単位の表示（要件どおり分で出す）
  - SC-002 の自動化（作者の手動確認とする）

## 付記：手動スモークの結果（2026-10-15、V5）

- `npm run dev:full`（wrangler pages dev、実際の配信元）で確かめた
  - 3衛星とも表示できた。ボタンでの切り替えもできた
  - 再読み込みしても、選んだ衛星（GOES-West）で始まった
  - コンソールのエラーと CSP の違反はなかった
  - 本番相当の応答ヘッダー（CSP・nosniff・Referrer-Policy）が付いていた
- スマホ幅（375px、画素密度2）では、GOES の 678px だけを読み込んだ
- SC-001：`node scripts/measure-sc001.mjs`（Pixel 7 相当、下り 9Mbps・往復 170ms、ブラウザのキャッシュは無効）で3回測り、2088／2133／2069ms、中央値 2.09秒で合格
  - サーバーはローカルで動かしており、`/api/latest` はローカルのエッジキャッシュに当たった可能性がある。本番での計測は公開後に作者が行う
- E2E は、実装が先にあったため、最初から通るものが多かった。そこで、わざとコードを壊して落ちるかを確かめた（競合の無視、スマホのサイズ、画像の読み込み失敗）
  - 競合のテストは、撮影日時が同じで assert が弱かったので直した
- SC-002（30分以上開いたままにして、遅れが約15分以内か）は、作者が段階 7 で確かめる
  - 手順：アプリを開いたまま30分以上置く
  - そのあいだに1回、タブを裏に回して戻す
  - 最後に、表示中の撮影日時と、CIRA の `latest_times.json` の先頭を比べる

## 付記：実装時の判断（V1〜V5）

- jsdom は `vitest.config.ts` ではなく、DOM を使うテストファイル（`view.test.ts`・`app.test.ts`）の先頭に `// @vitest-environment jsdom` と書いて指定した。§3・§4 の「vitest.config で設定」とは書き方が違うが、jsdom で動かす対象は同じ
- ブラウザに依存する部分（実際の時計、`visibilitychange`、画像の先読み）は、`src/features/viewer/browser.ts` に分けた（プランにないファイル）。`app.ts` には注入で渡す
- 先読みは、`new Image()` に `<picture>` と同じ srcset と sizes を与えて `decode()` する。ブラウザに同じ候補を選ばせ、キャッシュを効かせるため
- `fetchpriority="high"` は `index.html` ではなく `view.ts` で付けた（画像の要素を JS で作るため）
- スマホ用の `<source>` に 700px 以下の候補がないときは、全候補を入れる（今の配信元では起きない）
- `_headers` には、プランの CSP に加えて `default-src`・`style-src`・`frame-ancestors`、`X-Content-Type-Options`、`Referrer-Policy`（ブラウザの既定と同じ値）を足した
- Playwright のポートは 4174 にした（location/ の 4173 と取り違えないため）
- 要件定義の更新は、FR-001 の「自然な色の可視画像」を GeoColor の説明に直したことと、§6 の「撮影日時が取れない」の仮置きを外したことの分、V1 の一覧より広い（どちらも決定済みの事項）
- `STAR_HOST`・`CIRA_HOST`（URL の組み立て用）と `IMAGE_HOSTS`（許可リスト）は、値が二か所にある。ずれても検証ではじかれる（安全側）

## 付記：/review-impl への対応（2026-10-15、V6）

- P1（異常系）
  - 画像の先読みに 20 秒の上限を設けた。超えたら取得の失敗として扱う（`app.ts` の `PRELOAD_TIMEOUT_MS`）
  - `app.ts` の単体テストを足した。API 待ちや先読み待ちの最中に切り替える場合、前の要求の失敗が後から返る場合、先読みの上限の両側、切り替え後の周期
  - わざとコードを壊して、落ちることを確かめた
  - 競合の E2E は、ひまわりの応答を待ってから判定する形にした
- P1（境界値）：`latestClient` の境界の両側を足した。幅（0／1／2000／小数）、件数（5／6）、文字数（2048／2049）、credit の欠落、ISO 8601 でない日時
- P1（プランとのずれ）：上の「実装時の判断」を記録した
- P2 のうち直したもの
  - 時計が戻ったときは、すぐ確認する
  - 切り替えたら、周期をその時点から数え直す（「10分後に自動で再試行します」と合わせる）
  - 撮影日時は ISO 8601 の形式に限る
  - 同じ内容なら DOM を作り直さない（フォーカスと読み上げのため）
- 直したついでに見つかったもの：V5 でコミットした `scripts/measure-sc001.mjs` に lint のエラーがあった（ブラウザのグローバルを宣言していなかった）。確認のときに見落としてコミットしていたので、V6 で直した
- 見送った P2
  - CSP を E2E で自動検査すること
  - CSP の `form-action`
  - 画面側で撮影日時の未来を判定すること（サーバーで弾いている）
  - ホストの定義の二重化
  - `res.json()` のサイズ上限
  - 表のままスリープしたときの復帰後の即時確認
  - 表示中の `<img>` の読み込み失敗の検知
  - E2E の「同じなら取り直さない」の判定をキャッシュに左右されない形にすること
  - タブの表裏の E2E
  - 失敗中の手動再試行
