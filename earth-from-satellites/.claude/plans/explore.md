# プラン：拡大・地域のアップ・宇宙から見た地球

状態：承認済み（作者が種類・見せ方・進め方に回答。2026-10-15）。/review-plan（3観点）と /review-tests の P0・P1 を反映済み（末尾の「レビューへの対応」）｜元資料：docs/requirements/requirements.md（ストーリー4・9・10、FR-008、FR-013〜FR-017）

## 1. 概要

画面に3つの見方を足す。

- 全球画像の拡大：5段階で拡大でき、ドラッグで移動できる
- 衛星ごとの地域のアップ：たとえば、ひまわりの「日本」
- 宇宙から見た地球：NASA EPIC。4つ目の選択肢として足す

拡大と地域は、CIRA SLIDER の拡大タイルを、表示に必要な範囲だけ読み込んで作る。タイルの下には、表示中の全球画像を同じ位置・倍率で敷き、読み込みの途中でも空白にしない。撮影時刻は、いまの `latest_times.json` から取るので、Cloudflare の無料枠の使い方は変わらない。

取得に失敗したときの振る舞いは、ストーリー1〜3と同じにする。初めて読み込むタイルが失敗したときは、その場所は下に敷いた全球画像のまま見せる。

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
    - 1枚は約250〜550KB の PNG
  - NASA EPIC
    - `api/natural` は約13KB（1件約1KB、1日に最大22件ほど）
    - 画像は 1080px の JPEG で、約210KB
    - 公開まで1〜2日遅れる
    - キー不要
    - `image` に入っている時刻と `date` の時刻は、数十秒ずれる（例：`epic_1b_20261013003633` と `2026-10-13 00:31:45`）
  - GOES の地域画像（STAR の CONUS・セクター）は使わない
    - 地域ごとにファイル名や周期がばらばら
    - 撮影時刻を取るには、大きなディレクトリ一覧を読む必要があり、無料プランの CPU 上限にかかる
- 要件定義は、ストーリー4・9・10 と FR-013〜FR-017 に更新済み。地域の一覧と EPIC のしきい値は仮置き（未確定事項 #13）

## 3. 詳細設計

### 共有の取り決め（`shared/contract.ts`）

- 衛星の一覧
  - `SATELLITE_IDS` に `epic` を足す
  - ボタンの文言 `SATELLITE_LABELS`（「宇宙から」）と、衛星名 `SATELLITE_NAMES`（「DSCOVR（EPIC）」）を分ける
- ホストの許可リスト
  - 画像のホストは、衛星ごとの表 `IMAGE_HOSTS_BY_SATELLITE` にする（ひまわり＝CIRA、GOES＝STAR、epic＝`epic.gsfc.nasa.gov`）
  - `CREDIT_HOSTS` には `epic.gsfc.nasa.gov` を足す
- 静止衛星の投影の設定 `GEOSTATIONARY`：衛星 ID をキーにした `{ subLon, scanExtent, sweep }`。機体が替わったら、ここと `functions/_lib/satellites.ts` を直す
  - ひまわり：140.7、±0.1518、sweep `y`【要確認：CIRA の切り出し範囲。手動スモークで確かめる】
  - GOES-East：−75.2、±0.151844、sweep `x`
  - GOES-West：−137.2、±0.151844、sweep `x`
- タイル
  - `LatestImage` に、省略できる `tiles?: { baseUrl: string; tileSize: number; maxZoom: number }` を足す
  - `TILE_BASE_URL` は、完全一致で検証する正規表現
    - 形：`^https://slider\.cira\.colostate\.edu/data/imagery/\d{4}/\d{2}/\d{2}/[a-z0-9-]+---full_disk/geocolor/\d{14}/$`
  - 定数：`MIN_TILE_SIZE = 600`、`MAX_TILE_SIZE = 700`、`MAX_ZOOM = 4`
  - `tileUrl(baseUrl, z, row, col)`
    - 形：`${baseUrl}${zz}/${行3桁}_${列3桁}.png`
    - z・row・col は整数で、範囲（0〜MAX_ZOOM、0〜2^z−1）を外れたら例外を投げる

### サーバー（`/api/latest` の拡張）

- `functions/_lib/satellites.ts`
  - `epic` を足す（`source: 'nasa-epic'`）
  - クレジットは `NASA EPIC Team`（リンク先は `https://epic.gsfc.nasa.gov/`）
  - `SatelliteConfig` は判別できる共用体にし、`nasa-epic` には `sliderSat` を持たせない
- `functions/_lib/fetchSource.ts`：`fetchJson(url, deps, maxBytes = MAX_BODY_BYTES)` と、上限を引数で渡せるようにする（既定は 16KB のまま）
- `functions/_lib/sources/nasaEpic.ts`（新規）：`resolveNasaEpic(id, sat, deps)`
  - `https://epic.gsfc.nasa.gov/api/natural` を、上限 64KB で取得する
  - zod で、1〜40件の配列 `{ image: /^epic_1b_(\d{8})\d{6}$/, date: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/ }` を検証する
  - `date` は UTC として `Date.UTC` で組み立て、元の値に戻ることを確かめる（`parseCiraTimestamp` と同じやり方）
  - `now + MAX_FUTURE_SKEW_MS` より先の日時は除き、日時が最大のものを選ぶ
  - 画像 URL の日付は、`image` の8桁から作る（アーカイブは画像名の日付で並ぶため）
    - 形：`https://epic.gsfc.nasa.gov/archive/natural/YYYY/MM/DD/jpg/<image>.jpg`（幅 1080）
  - `tiles` は付けない
- `resolveCiraSlider`・`resolveNoaaStar`
  - 種類を確かめてから `sliderSat` を読む
  - 選んだ撮影時刻の CIRA のタイル情報を `tiles` に入れる
    - `tileSize`：ひまわり 688、GOES 678
    - `maxZoom`：4
  - GOES は、HEAD で確かめた時刻と同じ時刻を使う
- `functions/_lib/validate.ts`
  - 画像 URL は、その衛星の `IMAGE_HOSTS_BY_SATELLITE` だけを許す
  - `tiles` があれば、次を確かめる
    - `baseUrl` が `TILE_BASE_URL` に一致し、14桁の時刻が `capturedAt` の秒単位と一致する
    - `tileSize` は整数で 600〜700
    - `maxZoom` は整数で 0〜4
- `functions/api/latest.ts`：振り分けを `switch (sat.source)` にし、`nasa-epic` を足す
- 無料枠への影響
  - サブリクエストは、EPIC で GET 1回
  - CPU は、40件以下の JSON の解析だけ
  - タイルは CIRA から直接読むので、Functions の呼び出しは増えない

### 画面（`src/features/viewer/`）

- `sources.ts`（新規）：衛星ごとの表示の性質を1つの表にまとめる
  - 地域を持つか
  - 注記（EPIC：「公開まで1〜2日かかります」）
  - 古さの注意の規則
    - 静止衛星：60分以上で「○分前」
    - EPIC：72時間以上で「○日前」
  - 保存してよいか（EPIC は保存しない）
- `geo.ts`（新規）：`projectGeostationary(lat, lon, geometry)` は、全球画像の正規化座標 `{x, y}`（0〜1、x は東、y は南）を返す。見えない側なら null を返す
  - 式は PROJ の geos（sweep `x`／`y`）に合わせる
  - 経度は −180〜180 に直してから計算する
- `regions.ts`（新規）：衛星ごとの地域の一覧 `{ id, label, lat, lon, zoom }`（仮置き。#13）
  - ひまわり9号：日本（36, 138, z2.6）、オーストラリア（−25, 134, z1.6）
  - GOES-East：北米（38, −95, z1.6）、南米（−15, −60, z1.3）
  - GOES-West：北米西部（42, −120, z2.0）、ハワイ（20.5, −157, z3.0）
- `viewport.ts`（新規）：表示範囲の純粋な計算
  - 状態は `{ cx, cy, zoom }`。`cx`・`cy` は 0〜1 の中心、`zoom` は 0〜4 の連続値
  - `FULL_VIEW` は (0.5, 0.5, 0)。`isFull(vp)` は、これと一致すれば真
  - `regionView(region, geometry)`：地域の中心と倍率にする
  - `zoomAt(vp, delta, focus)`：指やカーソルの位置（枠の中の 0〜1）が画面上で動かないように拡大・縮小し、zoom を 0〜4 に収める
  - `panBy(vp, dxPx, dyPx, framePx)`：ドラッグで移動する
    - 中心は、表示の枠が画像の外に出ない範囲に収める
    - zoom 0 では動かない
  - `tileLevel(framePx, vp, tileSize, maxZoom, dpr)`：読み込む段 `z` を決める
    - 表示の画素数 `need = framePx × 2^zoom × min(dpr, 2)`
    - `z` は、`tileSize × 2^z ≥ need × 0.75` を満たす最小の整数。0〜`maxZoom` に収める
    - 例：688・dpr 1・zoom 0 で、枠 917px → z0、918px → z1
  - `visibleTiles(framePx, vp, tileSize, maxZoom, dpr)`：表示範囲に入るタイル `{ z, row, col, left, top, size }` を返す
    - 範囲外の行・列は返さない
    - `MAX_TILES = 16` を超えるときは、段を1つ下げる
- `state.ts`：地域と表示範囲を、純粋な遷移として持つ
  - `ViewerState` に `regionId: string | null` と `viewport` を足す
  - `select(id)`：衛星を替え、`regionId = null`、`viewport = FULL_VIEW` にする（ストーリー9-3）
  - `selectRegion(regionId | null, geometry)`
    - null（「全球」）なら `FULL_VIEW` にする。すでに選択中でも、押せば全体に戻す
    - 地域なら `regionView` にする
  - `setViewport(vp)`：利用者の操作で動いたときに使う。`regionId` を null にし、地域の選択を外す
  - `loaded` と `failed` は、`regionId` と `viewport` を変えない（FR-015）
- `latestClient.ts`
  - `tiles` を検証する（サーバーと同じ条件。shared の定数と正規表現を使う）
  - `epic` を受け入れる
  - 画像のホストは、その衛星の許可リストで確かめる
- `freshness.ts`：`stale(capturedAt, now, rule)`。`sources.ts` の規則で「○分前」か「○日前」を返す
- `messages.ts`：次の文言を足す
  - 「公開まで1〜2日かかります」
  - 「○日前の画像です」
  - 「全球」
  - 「拡大」「縮小」（ボタンの名前）
- `storage.ts`：EPIC は保存しない。保存された値が `epic` なら、既定の衛星で始める（初回表示はいつも静止衛星の全球になり、SC-001 の前提が保たれる）
- `tileLayer.ts`（新規）：タイルの描画と操作
  - 状態は持たず、`render(image, viewport, framePx, dpr)` で描き、操作は `onViewportChange(vp)` で知らせる
  - 下に敷く画像：全球画像（`image.images` の最小のもの）を、表示範囲に合わせた位置と大きさで置く
  - タイル
    - `visibleTiles` の分だけ、絶対配置の `<img>` を `createElement` で作り、`src` は `tileUrl` で作る（innerHTML は使わない）
    - 見えなくなったタイルの `<img>` は、`src` を外してから取り除く（読み込みを止める）
  - 世代（`baseUrl`）
    - `baseUrl` が替わったら、各タイルの新しい画像を読み込み、読み込めたものから入れ替える
    - 世代の違う読み込みの結果は捨てる
    - 失敗したタイルは前の画像を残す
    - 失敗したタイルは、次の定期更新まで読み直さない
  - 衛星が替わったら、前のタイルをすべて消す
  - 操作
    - ドラッグで移動、2本指でピンチ、ダブルクリック（ダブルタップ）で1段拡大
    - ホイールは、拡大中か、Ctrl を押しながら（トラックパッドのピンチ）のときだけ拡大・縮小する。それ以外はページのスクロールにする
    - `touch-action` は、zoom 0 では `pan-y`（縦のスクロールはページに任せ、ピンチは拾う）、拡大中は `none` にする
    - 段が変わる操作の途中では、新しい段のタイルを読み込み始めるのを 150ms 待つ
  - 計算はすべて `viewport.ts` で行う
- `view.ts`
  - 衛星のボタンは4つにする（ボタンの文言は `SATELLITE_LABELS`）
  - その下に、地域の選択（「全球」と地域）を出す。`sources.ts` で地域を持たない衛星（epic）では出さない。出すかどうかは衛星で決め、`image` の有無では決めない
  - 拡大・縮小のボタンを、地域を持つ衛星のときだけ出す。押すと、枠の中心で `zoomAt` する
  - `isFull(viewport)` のときは、今の `<picture>` を表示する。それ以外はタイルの層を表示する
  - EPIC のときは注記を出す
- `app.ts`
  - 操作（地域・拡大・ドラッグ）は state の遷移を呼び、描き直すだけにする。`/api/latest` は呼ばない
  - 定期更新の先読み
    - 全球表示（`isFull`）のときは、今と同じく全球画像を先読みする
    - タイル表示のときは、見えているタイルを先読みする（`deps.preloadUrls`）
    - どちらも、成功してから `loaded` にする。撮影日時の表示とタイルの中身がずれないようにするため
    - 先読みに失敗したら `failed` にし、前の画像と表示範囲を保つ
  - 枠の大きさと dpr は `deps.frame()` で受け取る
- `browser.ts`：`preloadUrls(urls)`（各 `<img>` の `decode`）と `frame()` を足す
- `public/_headers`：`img-src` に `https://epic.gsfc.nasa.gov` を足す
- 要件定義：未確定事項 #1 に、「CIRA の拡大タイルの直接参照」と「NASA EPIC の直接参照とクレジット表記」を足す

### 判断済みの論点

- 拡大と地域は、同じタイルの仕組みで作る。地域は「中心と倍率の初期値」にすぎない
- タイルは1枚 700px 以下なので、FR-008（長辺 2000px 以下）を満たす
- 1回の表示で読むタイルの枚数と通信量
  - 枚数は `MAX_TILES = 16` 以下。段の計算で dpr を最大2に抑えるので、スマホ（375px、dpr 3）で「日本」なら z3 の 2×2〜3×3 枚（約1〜4MB）
  - 拡大は利用者が選んだ操作なので、SC-001（初回表示）の対象外とする
  - タイル表示のまま開いておくと、10分ごとに同じ枚数を読み直す（多くても1時間に約6回分）
- 地域の撮影時刻は全球と同じ。地域を切り替えても `/api/latest` は呼ばない
- 地域を選んだあとに利用者がドラッグや拡大をしたら、地域の選択を外す（戻るときは「全球」か地域を押す）
- EPIC は1〜2日遅れるので、「○分前」は出さない。注記と、72時間以上での「○日前」にする（#13 で仮置き）。手動スモークで、ふだんの EPIC の経過時間を記録する
- EPIC は保存しない（初回表示の速さを保つため）
- 地域の中心の座標は概算でよい。ずれたら、まず投影の設定（`GEOSTATIONARY`）を疑い、次に `regions.ts` の値を直す

## 4. テスト影響範囲

- `tests/functions`
  - `SATELLITE_IDS` が4つになるので、3つであることを確かめているテストを更新する
  - `resolveCiraSlider`・`resolveNoaaStar` の期待値に `tiles` を足す
  - 画像のホストを衛星ごとに確かめるので、validate のテストを更新する
- `tests/unit`
  - `contract`・`view`（ボタン4つ）・`latestClient`（`tiles`）・`state`（新しい項目）・`freshness`（規則の引数）・`storage`（EPIC を保存しない）を更新する
- E2E：`latest()` のモックに `tiles` を足す

## 5. 新規テストケース

単体（サーバー）：

- `resolveNasaEpic`
  - 最新の日時の画像 URL（1080、日付は画像名から）と、撮影日時（UTC）を返す
  - 日時が新しい順に並んでいなくても、最大のものを選ぶ
  - 件数：1件・40件は ok、0件・41件は invalid
  - 未来の日時：now+10分ちょうどは採用し、+10分1秒は除く。すべて未来なら invalid
  - 次のときは invalid
    - `date` の形が違う（`2026/10/14 00:00:00`）
    - 存在しない日付（`2026-13-01 00:00:00`）
    - `image` の形が違う（`epic_1b_x`、`../x`）
  - 本文の大きさ：64KB ちょうどは読め、超えると invalid
  - 失敗の扱い
    - 非2xx・通信エラー → upstream
    - 5秒たっても応答がない → timeout
- `resolveCiraSlider`／`resolveNoaaStar`
  - `tiles.baseUrl` が選んだ撮影時刻を含み、`TILE_BASE_URL` に一致する
  - `tileSize` は、ひまわり 688、GOES 678
- `validate`
  - `tiles.baseUrl` が次のときは invalid
    - http
    - 許可外のホスト
    - `slider.cira.colostate.edu.evil.com`
    - `user@` 付き
    - `?` や `#` 付き
    - `..` を含む
    - パスの形が違う
    - `/` で終わらない
    - 時刻が `capturedAt` と違う
  - `tileSize`：600 と 700 は OK。599・701・688.5 は invalid
  - `maxZoom`：0 と 4 は OK。−1・5・2.5 は invalid
  - ひまわりの応答に EPIC のホストの画像 URL がある → invalid
- `handleLatest`
  - `?satellite=epic` → 200 で、`tiles` がない
  - EPIC の配信元が失敗 → 502

単体（共有）：

- `tileUrl`
  - z4・行10・列15 → `…/04/010_015.png`
  - 範囲外（z5、行−1、行 2^z）→ 例外

単体（画面）：

- `geo`
  - 衛星直下の点 → (0.5, 0.5)
  - 北の点は y < 0.5、東の点は x > 0.5
  - 直下から経度 80° の点は null でない。90° の点は null
  - 北極 → null
  - GOES-West から経度 170° と −190° を見ると、同じ結果になる
  - 東京をひまわりで変換すると、x は 0.47〜0.5、y は 0.15〜0.3
- `regions`
  - 3衛星の地域の名前と並びが、FR-013 の一覧と一致する
  - すべての地域の中心が、その衛星から見える
  - zoom は 0〜4 に入る
- `viewport`
  - `zoomAt`
    - 注目した点が、画面の同じ位置に残る（誤差 1e-6）
    - −0.01 → 0、4.01 → 4 に収める
  - `panBy`
    - zoom 0 では動かない
    - 上限ちょうどまでは動き、超えた分は止まる
  - `tileLevel`：688・dpr 1・zoom 0 で、枠 917px → z0、918px → z1。dpr 3 は 2 として計算する
  - `visibleTiles`
    - 右下の隅を表示したとき、行・列 2^z−1 は返し、2^z は返さない
    - zoom 2.6 の位置（left・top・size）が、計算どおり
    - 枠 375px・dpr 3・日本 → z3 で、9枚以下
    - 枠 1440px・dpr 2 でも、16枚以下
    - 行・列は整数
- `sources`・`freshness`
  - 静止衛星：59分 → なし、60分 → 「60分前」、61分 → 「61分前」
  - epic：61分 → なし、71時間59分 → なし、72時間 → 「3日前」
- `latestClient`
  - `tiles` の検証は、サーバーの validate と同じ境界で確かめる
  - `tiles` がなくても ok
  - `epic` の応答を受け入れる
- `state`
  - `selectRegion(地域)` で `regionView` になる
  - `selectRegion(null)` で `FULL_VIEW` になる（選択中でも）
  - `setViewport` で `regionId` が null になる
  - `select` で、地域も表示範囲も全体に戻る
  - `loaded`・`failed` は、地域と表示範囲を変えない
- `storage`：`epic` は保存しない。保存された値が `epic` なら、`himawari9` で始める
- `view`（jsdom）
  - 衛星のボタンは4つで、文言は「宇宙から」を含む。alt は「DSCOVR（EPIC） が撮影した地球」
  - 地域の選択
    - ひまわりで「全球・日本・オーストラリア」、GOES-East で「全球・北米・南米」、GOES-West で「全球・北米西部・ハワイ」
    - epic では、地域の選択も、拡大・縮小のボタンも出ない
    - 読み込み中（画像が null）でも、地域の選択は出たまま
  - EPIC の注記が出る
  - `isFull` のときは `<picture>` を表示し、タイルの層を隠す。それ以外は逆にする
- `tileLayer`（jsdom）
  - 表示範囲のタイルの `<img>` が、正しい URL と位置で並ぶ
  - 下に全球画像を敷く
  - 操作と `onViewportChange`
    - ＋ → zoom が1上がる。− → 1下がる
    - zoom 4 で＋ → 4 のまま。zoom 0 で− → 0 のまま
    - ホイール（拡大中）で deltaY が負なら拡大、正なら縮小。カーソルの位置は動かない
    - zoom 0 で Ctrl なしのホイール → 呼ばれない
    - ダブルクリック → その点を中心に1段拡大
    - 2本指の間隔が2倍になる → zoom が1上がる
  - 世代と後片付け
    - `baseUrl` が A→B→A の順に替わっても、最後の分だけが反映される
    - 新しい世代で失敗したタイルは、前の URL のまま残る
    - 衛星が替わったら、前の衛星のタイルは残らない
    - 見えなくなったタイルの `<img>` は取り除かれる
- `app`（jsdom）
  - 地域を選んでも `/api/latest` を呼ばず、撮影日時の表示も変わらない
  - 衛星を切り替えると、全球に戻る
  - タイル表示のときの定期更新
    - 撮影時刻が替わっても、地域と表示範囲を保ち、見えているタイルを先読みしてから入れ替える
    - タイルの先読みに失敗したら、画像と表示範囲を保ったまま「更新できませんでした」を出す
  - EPIC で表示中に更新が失敗したら、画像を残して「更新できませんでした」を出す。次に成功したら消える
  - 定期更新で `tiles` がなくなったら、落ちずに全球の `<picture>` に戻る

E2E（モック）：

- ひまわりで「日本」を選ぶと、z2 以上のタイルが読み込まれる。`/api/latest` の要求は増えず、撮影日時も変わらない（9-1）
- 「全球」で `<picture>` に戻る（9-2）。GOES-East に切り替えると、全球になる（9-3）
- ＋ボタンで拡大すると、より高い段のタイルが読み込まれる。ドラッグすると、別のタイルが読み込まれる（4-1、4-2）
- 地域の表示中に10分たって撮影時刻が替わると、同じ地域のまま新しい時刻のタイルになる。＋で拡大しただけの状態でも同じ（4-3、FR-015）
- 「宇宙から」
  - EPIC の画像・注記・「NASA EPIC Team」が出て、地域の選択と拡大・縮小のボタンは出ない（10-1、FR-016、FR-017）
  - 取得が 502 なら「取得できませんでした」が出る（10-2）
  - 撮影から72時間たっていれば「3日前の画像です」が出る（FR-016）
- スマホ（375px、dpr 3）で「日本」を選ぶと、要求したタイルは `visibleTiles` の結果と一致し、どれも長辺 700px 以下（FR-008、FR-014）

手動スモーク（実際の配信元）：

- 3衛星の地域が、その地域を写しているかを目で見て確かめる。ずれたら投影の設定か、地域の座標を直す
- 拡大・ドラッグ・ダブルクリック・ホイールを、PC の Chrome で試す
- ピンチ・スクロールとの取り合いを、スマホ幅の表示で試す（実機の Safari は作者が段階 7 で確かめる）
- EPIC が表示されることを確かめ、ふだんの経過時間を記録する
- CSP の違反がないことを確かめる
- SC-001 を測り直す（初回表示が変わっていないこと）

## 6. 実装順

1. X1：共有の取り決め、EPIC の取得、`tiles` の付与と検証（サーバー）のテスト → Red → 実装（担当：上位モデル）
2. X2：`geo`・`regions`・`viewport`・`sources` のテスト → Red → 実装（担当：上位モデル。座標の計算が中核）
3. X3：`state`・`latestClient`・`freshness`・`messages`・`storage` の拡張のテスト → Red → 実装（担当：上位モデル）
4. X4：`tileLayer`・`view`・`app`・`browser` の拡張、`_headers`・要件定義の #1 のテスト → Red → 実装（担当：上位モデル）
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
- 拡大した位置と EPIC の選択を、次回まで覚えること
- タイルの中継や結合（サーバーで画像を加工すること）

## レビューへの対応（/review-plan 3観点・/review-tests、2026-10-15）

- P0
  - タイルの段の規則と期待値の食い違い：規則を決め直した（dpr は最大2、許容 0.75、上限16枚）。期待値も計算し直した
  - タイルの読み込みと、切り替え・定期更新の競合：世代（`baseUrl`）を持たせ、衛星の切り替えでタイルを消すようにした
  - 表示範囲を誰が持つか：state が `regionId` と `viewport` を純粋な遷移として持ち、tileLayer は描画と通知だけにした
  - テストの不足：操作の種類、境界の両側、EPIC の異常系、競合のテストを足した
- P1
  - タイルの URL の検証：正規表現で完全一致にし、時刻の一致、整数、600〜700 を確かめる
  - 枚数の上限、読み込みを止めること、150ms 待つこと、失敗したタイルを読み直さないこと
  - 利用条件：#1 に CIRA のタイルと EPIC を足す
  - EPIC での起動：EPIC は保存しない
  - 下に敷く画像で空白を防ぐ
  - スクロール・ホイールとの取り合い（`touch-action` とホイールの条件）
  - 「全球」はいつでも押せば全体に戻り、利用者が操作したら地域の選択を外す
  - タイル表示の定期更新では、見えているタイルを先読みする
  - 投影の設定を衛星ごとにし、ひまわりは【要確認】にした
  - 衛星直下の経度を共有の取り決めにまとめた（GOES-West は −137.2）
- P2 のうち反映したもの
  - ボタンの文言と衛星名を分けた
  - 表示の性質を1つの表（`sources.ts`）にした
  - 画像のホストを衛星ごとにした
  - EPIC の件数の上限を40件にした
  - `fetchJson` の上限を引数で渡せるようにした
  - `switch` で振り分けるようにした
  - EPIC の注意を「○日前」にした
- 見送ったもの
  - 「全球」を「地球全体」に言い換えること（要件の文言のまま。#13 で作者に聞く）
  - 地域の一覧の選び直し（#13）
