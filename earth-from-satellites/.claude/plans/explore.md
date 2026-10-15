# プラン：拡大・地域のアップ・宇宙から見た地球

状態：承認済み（作者が種類・見せ方・進め方に回答。2026-10-15）｜元資料：docs/requirements/requirements.md（ストーリー4・9・10、FR-008、FR-013〜FR-017）

## 1. 概要

画面に3つの見方を足す。

- 全球画像の拡大：5段階で拡大でき、ドラッグで移動できる
- 衛星ごとの地域のアップ：たとえば、ひまわりの「日本」
- 宇宙から見た地球：NASA EPIC。4つ目の選択肢として足す

拡大と地域は、CIRA SLIDER の拡大タイルを、表示に必要な範囲だけ読み込んで作る。撮影時刻は、いまの `latest_times.json` から取るので、サーバーの負荷も無料枠の使い方も変わらない。

取得や読み込みに失敗したときの振る舞いは、ストーリー1〜3と同じにする。タイルの読み込みに失敗したときは、その場所だけ前のタイルを残す。

## 2. 背景

- 作者の要望（2026-10-15）：「もっとアップの写真や、背景の宇宙も含めた写真、様々な角度の写真」
- 作者が選んだもの
  - 地域のアップ・宇宙から・拡大の3つ。ISS の過去の写真は入れない
  - 見せ方は「衛星＋全球／地域の2段」
  - 実装まで進める
- 配信元の調査（2026-10-15、実際に問い合わせて確かめた）
  - CIRA SLIDER の全球の拡大タイル
    - z0〜z4 で、3衛星とも同じ形式
    - z の段では 2^z × 2^z 枚
    - 1枚の大きさは、ひまわり 688px、GOES 678px
    - ファイル名は `{行}_{列}.png`。`000_001` が右上、`001_000` が左下であることを、画像を見て確かめた
  - NASA EPIC
    - `api/natural` は約13KB（1件約1KB、1日に最大22件ほど）
    - 画像は 1080px の JPEG で、約210KB
    - 公開まで1〜2日遅れる
    - キー不要
  - GOES の地域画像（STAR の CONUS・セクター）は使わない
    - 地域ごとにファイル名や周期がばらばら
    - 撮影時刻を取るには、大きなディレクトリ一覧を読む必要があり、無料プランの CPU 上限にかかる
- 要件定義は、ストーリー4・9・10 と FR-013〜FR-017 に更新済み。地域の一覧と EPIC のしきい値は仮置き（未確定事項 #13）

## 3. 詳細設計

### 共有の取り決め（`shared/contract.ts`）

- `SATELLITE_IDS` に `epic` を足す（表示名「宇宙から（DSCOVR）」）
- `IMAGE_HOSTS` と `CREDIT_HOSTS` に `epic.gsfc.nasa.gov` を足す
- `LatestImage` に、省略できる `tiles?: { baseUrl: string; tileSize: number; maxZoom: number }` を足す
  - `baseUrl` は `https://slider.cira.colostate.edu/…/{撮影時刻}/` の形
  - タイルの URL は `${baseUrl}${zz}/${行3桁}_${列3桁}.png`
- `TILE_HOSTS` を足す（`slider.cira.colostate.edu` のみ）。`MAX_ZOOM = 4`

### サーバー（`/api/latest` の拡張）

- `functions/_lib/satellites.ts`：`epic` を足す
  - `source: 'nasa-epic'`
  - クレジットは `NASA EPIC Team`（リンク先は `https://epic.gsfc.nasa.gov/`）
- `functions/_lib/sources/nasaEpic.ts`（新規）：`resolveNasaEpic(id, sat, deps)`
  - `https://epic.gsfc.nasa.gov/api/natural` を、本文の上限 64KB で取得する（`fetchJson` に上限の引数を足す。既定は 16KB のまま）
  - zod で `[{ image: /^epic_1b_\d{14}$/, date: 'YYYY-MM-DD HH:MM:SS' }]`（1〜60件）を検証する
  - `now+10分` より先の日時は除き、日時が最大のものを選ぶ
  - 画像の URL は `https://epic.gsfc.nasa.gov/archive/natural/YYYY/MM/DD/jpg/<image>.jpg`（幅 1080）
  - `tiles` は付けない
- `resolveCiraSlider`・`resolveNoaaStar`：選んだ撮影時刻の CIRA のタイル情報を `tiles` に入れる
  - ひまわりは 688、GOES は 678。`maxZoom` は 4
  - GOES は、HEAD で確かめた時刻と同じ時刻を使う
- `functions/_lib/validate.ts`：`tiles` があれば次を確かめる
  - `baseUrl` が https で、ホストが `TILE_HOSTS` のどれかで、`/` で終わる
  - `tileSize` は 1〜700
  - `maxZoom` は 0〜4
- `functions/api/latest.ts`：振り分けに `nasa-epic` を足す
- サブリクエストは EPIC で GET 1回。CPU は 13〜25KB の JSON の解析だけ

### 画面（`src/features/viewer/`）

- `geo.ts`（新規）：`projectGeostationary(lat, lon, subLon)` は、静止衛星の全球画像上の正規化座標 `{x, y}`（0〜1）を返す。見えない側なら null を返す
  - GOES-R PUG の固定格子の式を使う
  - 走査角の範囲は ±0.151844 rad
  - 衛星直下の経度は、ひまわり 140.7、GOES-East −75.2、GOES-West −137.0
- `regions.ts`（新規）：衛星ごとの地域の一覧 `{ id, label, lat, lon, zoom }`（仮置き。#13）
  - ひまわり9号：日本（36, 138, z2.6）、オーストラリア（−25, 134, z1.6）
  - GOES-East：北米（38, −95, z1.6）、南米（−15, −60, z1.3）
  - GOES-West：北米西部（42, −120, z2.0）、ハワイ（20.5, −157, z3.0）
- `viewport.ts`（新規）：表示範囲の純粋な計算
  - 状態は `{ cx, cy, zoom }`。`cx`・`cy` は 0〜1 の中心、`zoom` は 0〜4 の連続値
  - `fullView()`：全体を表示する
  - `regionView(region, subLon)`：地域の中心と倍率にする
  - `zoomAt(vp, delta, focus)`：指やカーソルの位置を中心に拡大・縮小する
  - `panBy(vp, dxPx, dyPx, sizePx)`：ドラッグで移動する
  - 中心は、画像の外が見えすぎない範囲に収める
  - `visibleTiles(vp, sizePx, tileSize, maxZoom, dpr)`：読み込むタイルの段 `z` と `{row, col, left, top, size}` を返す
    - 段 `z` は、表示の画素数（dpr を考慮）を満たす最小の段。上限は `maxZoom`
    - 表示範囲に入るタイルだけを返す
- `latestClient.ts`：`tiles` を検証する（サーバーと同じ条件）。`epic` を受け入れる
- `freshness.ts`：注意の出し方を、衛星ごとに決める
  - 静止衛星は、60分以上で「○分前」
  - `epic` は、72時間以上で「○時間前」
- `messages.ts`：次の文言を足す
  - EPIC の注記「公開まで1〜2日かかります」
  - 「全球」
  - 拡大・縮小ボタンの名前
- `state.ts`：`select` は今のまま
  - 地域と拡大は、画面の状態（`viewport`）として `app.ts` で持つ
  - 衛星を切り替えたら、全球に戻す（ストーリー9-3）
- `tileLayer.ts`（新規）：タイルの描画と操作
  - 枠の中に、絶対配置の `<img>` を並べる
  - 操作：ドラッグで移動、2本指でピンチ、ダブルクリック（ダブルタップ）、ホイール、＋／−ボタン
  - 操作はすべて `viewport.ts` の関数で計算する
  - 新しい撮影時刻に替わるときは、表示中の各タイルについて新しい画像を読み込み、読み込めたものから入れ替える。失敗したタイルは前の画像を残す（FR-015）
  - タイルの要素は、見えている分だけ持つ
- `view.ts`
  - 衛星のボタンを4つにする（「宇宙から（DSCOVR）」を足す）
  - その下に、地域の選択（「全球」と地域）を出す。`tiles` がない衛星（epic）では出さない
  - 全球で倍率が0のときは、今の `<picture>` を表示する（初回表示の速さと FR-008 を保つ）
  - 地域を選んだときと拡大したときは、タイルの層を表示する
  - EPIC のときは注記を出す
- `app.ts`
  - `viewport` と、選んでいる地域を持つ
  - 地域を選んだら `regionView` にする
  - 衛星を切り替えたら全球に戻す
  - 定期更新のあとも `viewport` は保つ
- `index.html`：`epic.gsfc.nasa.gov` への `preconnect` は入れない（初回表示に使わないため）
- `public/_headers`：`img-src` に `https://epic.gsfc.nasa.gov` を足す
- `scripts/measure-sc001.mjs`：今のまま（初回表示は全球の `<picture>` のまま）

### 判断済みの論点

- 拡大と地域は、同じタイルの仕組みで作る。地域は「中心と倍率の初期値」にすぎない
- タイルは1枚 700px 以下なので、FR-008（長辺 2000px 以下）を満たす
- 拡大中に読み込むタイルは、多くても「表示の枠を覆う分＋1列」。スマホ（360px、dpr 3）で z4 なら3×3枚ほど（約500KB×9）。拡大は利用者が選んだ操作なので、SC-001（初回表示）の対象外とする
- 地域の撮影時刻は全球と同じ。地域を切り替えても `/api/latest` は呼ばない
- EPIC は1〜2日遅れるので、「○分前」は出さず、注記と72時間のしきい値にする（#13 で仮置き）
- 地域の中心の座標は概算でよい（見た目で確かめ、ずれていれば値を直す）

## 4. テスト影響範囲

- `tests/functions`
  - `SATELLITE_IDS` が4つになるので、3つであることを確かめているテストを更新する
  - `resolveCiraSlider`・`resolveNoaaStar` の期待値に `tiles` を足す
- `tests/unit`
  - `contract`・`view`（ボタン4つ）・`latestClient`（`tiles`）の期待値を更新する
- E2E：「ボタン3つ」に頼るものはない。`latest()` のモックに `tiles` を足す

## 5. 新規テストケース

単体（サーバー）：

- `resolveNasaEpic`
  - 最新の日時の画像 URL（1080）と撮影日時を返す
  - 日時が新しい順に並んでいなくても、最大のものを選ぶ
  - 未来（now+10分を超える）の日時は除く
  - 0件・型違い・`image` の形が違う・61件 → invalid
  - 本文が 64KB を超えたら invalid、ちょうど 64KB は読める
- `resolveCiraSlider`／`resolveNoaaStar`：`tiles.baseUrl` が選んだ撮影時刻を含む。`tileSize` はひまわり 688、GOES 678
- `validate`
  - `tiles.baseUrl` が http・許可外のホスト・`/` で終わらない → invalid
  - `tileSize` 700 は OK、701 は invalid
  - `maxZoom` 4 は OK、5 は invalid
- `handleLatest`：`?satellite=epic` → 200。`epic` の応答に `tiles` がない

単体（画面）：

- `geo`
  - 衛星直下の点（緯度0、経度＝直下の経度）→ (0.5, 0.5)
  - 北にある点は y < 0.5、東にある点は x > 0.5
  - 直下から 90° 離れた経度 → null（見えない）
  - 東京（35.7, 139.7）をひまわりで変換 → x は 0.48〜0.5、y は 0.15〜0.3
- `viewport`
  - `fullView` は (0.5, 0.5, 0)
  - `zoomAt` は、注目した点が画面の同じ位置に残る（誤差 1e-6）
  - zoom は 0 未満にも 4 超にもならない
  - `panBy` で、zoom 0 のときは動かない
  - 端では画像の外が見えすぎない（中心が範囲内に収まる）
  - `visibleTiles`
    - 枠 720px・dpr 1・zoom 0 → z0 の1枚
    - 枠 720px・dpr 1・zoom 1 → z1（688×2 ≥ 1440）で、見える範囲の枚数だけ
    - 枠 360px・dpr 3・zoom 2 → z3 で、枚数は 3×3 以下
    - zoom 4 で、必要な段が上限を超えても z4 に留まる
    - 範囲外のタイル（負の行・列や 2^z 以上）を返さない
- `regions`：すべての地域の中心が、その衛星から見える（`projectGeostationary` が null にならない）
- `freshness`
  - 静止衛星：59分 → なし、60分 → 「60分前」
  - epic：71時間59分 → なし、72時間 → 「72時間前」
- `latestClient`
  - `tiles` の検証：http・許可外のホスト・`tileSize` 701・`maxZoom` 5 → ok: false
  - `tiles` がなくても ok
  - `epic` の応答を受け入れる
- `view`（jsdom）
  - 衛星のボタンは4つ
  - 地域の選択は、ひまわりで「全球・日本・オーストラリア」、epic では出ない
  - EPIC の注記が出る
  - zoom 0・全球のときは `<picture>` を表示し、タイルの層を隠す。地域を選ぶと逆になる
- `tileLayer`（jsdom）
  - 表示範囲のタイルの `<img>` が、正しい URL と位置で並ぶ
  - ＋ボタンで zoom が1段上がる
  - 新しい `baseUrl` に替わると、読み込めたタイルだけ入れ替わり、失敗したタイルは前の URL のまま残る
- `app`（jsdom）
  - 地域を選んでも `/api/latest` を呼ばない
  - 衛星を切り替えると全球に戻る
  - 定期更新で撮影時刻が替わっても、選んだ地域と viewport を保つ

E2E（モック）：

- ひまわりで「日本」を選ぶと、z2 以上のタイルが読み込まれ、`/api/latest` の要求は増えない（9-1）
- 「全球」で `<picture>` に戻る（9-2）。GOES-East に切り替えると、全球になる（9-3）
- ＋ボタンで拡大すると、より高い段のタイルが読み込まれる。ドラッグで別のタイルが読み込まれる（4-1、4-2）
- 地域の表示中に10分たって撮影時刻が替わると、同じ地域のまま新しい時刻のタイルになる（4-3、FR-015）
- 「宇宙から（DSCOVR）」で、EPIC の画像・注記・「NASA EPIC Team」が出て、地域の選択は出ない（10-1、FR-017）
- 「宇宙から」の取得が 502 なら「取得できませんでした」が出る（10-2）
- スマホ（375px、dpr 3）で「日本」を選んでも、読み込むタイルは1枚 700px 以下で、9枚以下（FR-008、FR-014）

手動スモーク（実際の配信元）：

- 3衛星の地域が、その地域を写しているかを目で見て確かめる（座標がずれていれば `regions.ts` の値を直す）
- 拡大・ドラッグ・ピンチを試す（ピンチはスマホ幅の表示で）
- EPIC が表示されることを確かめる
- CSP の違反がないことを確かめる
- SC-001 を測り直す（初回表示が変わっていないこと）

## 6. 実装順

1. X1：共有の取り決め、EPIC の取得、`tiles` の付与と検証（サーバー）のテスト → Red → 実装（担当：上位モデル）
2. X2：`geo`・`regions`・`viewport` のテスト → Red → 実装（担当：上位モデル。座標の計算が中核）
3. X3：`latestClient`・`freshness`・`messages` の拡張のテスト → Red → 実装（担当：単純作業）
4. X4：`tileLayer`・`view`・`app` の拡張、`_headers` のテスト → Red → 実装（担当：上位モデル）
5. X5：E2E → Red → 不足の修正、手動スモーク（地域の座標の調整を含む）と SC-001 の再計測（担当：上位モデル）
6. 実装完了後、/review-impl で観点別レビュー3体を並列実行し、P0/P1 を修正

コミットはタスク単位で、先頭にタスク番号を付ける（例：`X2: add viewport math for tiled zoom`）。

## 7. コミット前テスト実行

- `cd earth-from-satellites && npm run typecheck && npm run lint && npx vitest run`
- `npx playwright test`

## 8. スコープ外

- ISS などの過去の写真、ほかの衛星（Meteosat など）
- 「宇宙から」の拡大と地域の選択
- タイムラプス、全画面
- 地域の追加・編集を利用者ができること
- 拡大した位置を、次回まで覚えること
- タイルの中継や結合（サーバーで画像を加工すること）
