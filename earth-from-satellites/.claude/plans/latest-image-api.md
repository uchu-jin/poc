# プラン：配信元の調査と最新画像 API（/api/latest）

状態：承認済み｜元資料：docs/requirements/requirements.md（ストーリー1〜3、FR-008〜FR-012、未確定事項 #1・#2・#10）

## 1. 概要

`/api/latest?satellite=<ID>` を Cloudflare Pages Functions で作る。許可リストにある3つの衛星について、配信元から最新の撮影日時を調べ、画像 URL（複数サイズ）・撮影日時・衛星名・クレジットを JSON で返す。結果は5分キャッシュする。ID が不正なら配信元に問い合わせずに 400 を返す。配信元が失敗したら 502、タイムアウトしたら 504 を返す。最初のタスクで、プロジェクトの土台（package.json など）も `location/` に揃えて用意する。

## 2. 背景

- FR-009〜FR-011 を満たす、画面の前提になる API。FR-008（長辺 2000px 以下）と FR-012（クレジット）のためのデータもここで返す
- 未確定事項 #1（配信元）と #2（夜の側の見せ方）を、2026-10-14 の実地調査で次のように決めた

### 配信元の調査結果（2026-10-14 に実際の配信元を叩いて確認）

| 衛星                 | 配信元                                 | 最新の撮影日時の取り方                                                                                                                                                                                                                                                                                                                  | 画像 URL                                                                                                              | サイズ・容量                                 | 備考                                                                                                                                                                                                                                                                                                               |
| -------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GOES-East（GOES-19） | 時刻：CIRA SLIDER／画像：NOAA STAR CDN | `https://slider.cira.colostate.edu/data/json/goes-19/full_disk/geocolor/latest_times.json`（約2.4KB）の `timestamps_int` の先頭（例 `20261014143020`）。これを STAR のファイル名の時刻 `YYYYDDDHHMM`（DDD は年内の通算日。例 `20262871430`）に変換し、678px の画像に HEAD を送って存在を確かめる。無ければ次の時刻を試す（最大3つまで） | `https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/GEOCOLOR/<ts>_GOES19-ABI-FD-GEOCOLOR-{339x339,678x678,1808x1808}.jpg` | 339px 約127KB／678px 約444KB／1808px 約2.5MB | 10分周期。`access-control-allow-origin: *`。CIRA と STAR の時刻が分単位で一致することは GOES-18／19 の両方で確認済み。STAR のディレクトリ一覧は約1.6MB あり、Range 指定も効かない。無料プランの CPU 上限（10ms）を超えるおそれがあるので使わない。`latest.jpg` は Last-Modified が撮影時刻と一致しないので使わない |
| GOES-West（GOES-18） | 同上                                   | 同上（`goes-18`／`GOES18`）                                                                                                                                                                                                                                                                                                             | 同上                                                                                                                  | 同上                                         | 同上                                                                                                                                                                                                                                                                                                               |
| ひまわり9号          | CIRA SLIDER                            | `https://slider.cira.colostate.edu/data/json/himawari/full_disk/geocolor/latest_times.json` の `timestamps_int`（`YYYYMMDDhhmmss` の降順配列）の先頭                                                                                                                                                                                    | `https://slider.cira.colostate.edu/data/imagery/YYYY/MM/DD/himawari---full_disk/geocolor/<ts>/00/000_000.png`         | 688px、約530KB（PNG）                        | `rammb-slider.cira…` は `slider.cira…` へ 302 で飛ぶので、最初から後者を使う。NICT より約10分遅い                                                                                                                                                                                                                  |

不採用：NICT ひまわりリアルタイム Web。自然な色の画像で夜側が真っ暗になる。550px のタイルなので、大きな画像にするには結合が要る。`no-store` 指定で、利用条件の明記も見つからなかった。

### 無料の範囲で使うための約束（作者の指示：API は必ず無料の範囲で使う）

- 外部の配信元は、無料・API キーなし・登録なしのものだけを使う（NOAA STAR CDN、CIRA SLIDER）。有料の API や、キー登録が必要な API は使わない
- Cloudflare は Workers Free／Pages Free の範囲に収める。有料プランの機能（Workers Paid、KV や R2 の有料枠、Images など）は使わない。KV・D1・R2 も使わず、キャッシュは無料の Cache API（`caches.default`）だけにする
- 無料プランの上限に収まる設計にする
  - リクエスト数（Functions は1日10万件）：1人が開きっぱなしにしても、10分ごとで1日144回。画像本体は配信元を直接参照するので、Functions の呼び出しには数えられない
  - 1回の呼び出しの CPU 時間（10ms）：読むのは約2.4KB の JSON だけ。大きな HTML の解析はしない
  - 1回の呼び出しのサブリクエスト（50件）：多くても JSON 1回と HEAD 3回で、計4回まで
- 配信元への負荷も抑える：衛星ごとに5分キャッシュするので、配信元への問い合わせは閲覧者の数によらず、1衛星あたり多くても5分に1回程度（データセンターごとのキャッシュのため、その数だけ増える）
- 依存パッケージは無料の OSS だけ（location/ と同じ構成）

## 3. 詳細設計

変更するファイル（すべて `earth-from-satellites/` の中）：

- T1 の土台（location/ と同じ版・設定）：`package.json`、`tsconfig.json`、`functions/tsconfig.json`、`vite.config.ts`、`vitest.config.ts`、`eslint.config.js`、`.prettierrc`、`wrangler.toml`（`name = "earth-from-satellites"`）、`.gitignore`、最小の `index.html`。依存は vite / vitest / typescript / eslint / prettier / wrangler / @cloudflare/workers-types と、ランタイムの zod だけ（Playwright・husky は画面のプランで入れる）
- `functions/_lib/satellites.ts`：許可リスト。`SATELLITE_IDS = ['himawari9','goes-east','goes-west'] as const`。各衛星の表示名（「ひまわり9号」「GOES-East」「GOES-West」）、配信元の種別、パラメータ（`GOES19` / `GOES18`）、クレジット
- `functions/_lib/types.ts`：共通の形 `LatestImage = { satelliteId, satelliteName, capturedAt: string(ISO UTC), images: {url, width}[]（width の昇順）, credit: {text, url} }`
- `functions/_lib/sources/ciraTimes.ts`：`fetchCiraTimes(sliderSat, deps)`。CIRA の `latest_times.json` を取得し、zod で `{ timestamps_int: number[] (1件以上) }` を検証して降順の時刻列を返す。純粋関数 `parseCiraTimestamp(20261014143020)` で UTC の Date に変換する（ひまわりと GOES で共通に使う）
- `functions/_lib/sources/ciraSlider.ts`：`resolveCiraSlider(sat, deps)`（ひまわり）。先頭の時刻から 688px の画像 URL を組み立てる
- `functions/_lib/sources/noaaStar.ts`：`resolveNoaaStar(sat, deps)`（GOES）。CIRA の時刻を、純粋関数 `toStarTimestamp(date)` で `YYYYDDDHHMM` に変換する。そのうえで 678px の画像に HEAD を送り、200 ならその時刻の3サイズの URL を返す。404 なら次の時刻を試し、最大3つまで（サブリクエストは計4回まで）。3つとも無ければ upstream エラーにする
- `functions/_lib/fetchSource.ts`：`deps.fetch` に AbortSignal を付け、呼び出し全体で5秒でタイムアウトさせる。応答本文は 16KB を上限に読む（JSON は約2.4KB。レビュー後に 64KB から下げた）。失敗は `SourceError('upstream' | 'timeout' | 'invalid')` にそろえる
- `functions/_lib/validate.ts`：返す前の検証
  - 画像 URL のホストは `cdn.star.nesdis.noaa.gov` / `slider.cira.colostate.edu` だけを許し、https に限る
  - 撮影日時は、`now + 10分` より未来なら invalid とする（時計は注入）。古いぶんには返す（「○分前」の判定は画面側の FR-007）
  - images の幅はすべて 2000 以下（FR-008）
- `functions/api/latest.ts`：`handleLatest(request, deps)` と `onRequestGet`。location/ の `handleChat` と同じく、依存（`fetch`、`now`、`cache`）を注入する
  - `satellite` を `z.enum(SATELLITE_IDS)` で検証する。不正・欠落・重複指定なら 400 `{code:'invalid_satellite'}` を返し、fetch は呼ばない（FR-010）
  - キャッシュ：`caches.default` を、正規化したキー `https://cache.internal/api/latest?satellite=<id>` で引く。当たればそのまま返す。外れたら配信元を見て、成功時だけ `Cache-Control: public, max-age=300` を付けて `cache.put` する（FR-009）
  - エラー：upstream / invalid は 502、timeout は 504。どちらも `Cache-Control: no-store` で `{code}` だけを返し、配信元の URL や本文は出さない（FR-011）
  - 成功：200 で `LatestImage` を返す

判断済みの論点：

- ひまわりは CIRA SLIDER の GeoColor を使う。GOES（STAR の GeoColor）と見た目が揃い、夜側は街明かりの合成で見える → 未確定事項 #2 は「昼夜合成画像」で決着
- 画像は複数サイズの URL を返し、画面は `srcset` で選ぶ（スマホは約700px、PC は 1808px）。ひまわりは v1 では 688px の1種だけ。高解像度はストーリー4のプランで検討する
- 画像本体は配信元を直接参照する（`<img>` が直接読む）。Functions で中継しない
- 撮影日時は、3衛星とも CIRA の小さな JSON から取る。GOES の画像は、サイズが選べる STAR を使う。無料プランの CPU 上限とサブリクエスト上限に収めるため
- 時刻の変換は純粋関数にして、テストで固定の JSON を与える
- CIRA と STAR の時刻が分単位で一致することは、T5 の手動スモーク（2026-10-14 15:50 UTC の回）でも確かめた。3衛星とも 200 を返し、返した画像 URL 7つはすべて 200。HEAD の再試行は起きなかった。ずれる場合は、HEAD による再試行（最大3つの時刻）で吸収する
- 【要確認】利用条件：NOAA の画像は米国政府著作物だが、GeoColor は CIRA の製品。CIRA は「CSU/CIRA & NOAA」（ひまわりは「CSU/CIRA & JMA」）の表記を求めている（https://satlib.cira.colostate.edu/credit-media）。クレジットは仮に GOES＝`NOAA/NESDIS/STAR, CSU/CIRA`、ひまわり＝`CSU/CIRA & JMA` とする。外部サイトからの直接参照の可否は、公開前に作者が確認する
- 【要確認】GOES-East/West の機体（現在は GOES-19 / GOES-18）が交代したら、`satellites.ts` の1か所を直す運用にする
- 【要確認】pre-commit：リポジトリの `core.hooksPath` は `location/.husky/_` で、location 専用のフックになっている。ほかの POC のフォルダには触れないため、この POC の husky は今回入れない。共有フックをどう扱うかは作者が決める

## 4. テスト影響範囲

- なし（既存のコードとテストがない新規プロジェクトのため）

## 5. 新規テストケース

単体（`tests/functions/`、fetch・時計・キャッシュはすべてモック）：

- `parseCiraTimestamp`：`20261014143020` → 2026-10-14T14:30:20Z。13月・25時・桁数の誤りは失敗
- `toStarTimestamp`：2026-10-14T14:30:20Z → `'20262871430'`。通算日の境界（1月1日＝`001`、うるう年の12月31日＝`366`、平年の12月31日＝`365`）
- `fetchCiraTimes`：正常／`timestamps_int` が空・型違い・JSON でない → invalid
- `resolveCiraSlider`：先頭の時刻から、688px の URL と撮影日時を返す
- `resolveNoaaStar`：先頭の時刻の HEAD が 200 なら3サイズを返す／先頭が 404 で2番目が 200 なら2番目を返す／3つとも 404 なら upstream／HEAD は最大3回で、4回目は呼ばない（サブリクエストは計4回以内）
- `validate`：許可外ホスト・http の URL → invalid／撮影日時が now+10分ちょうどなら OK、+10分1秒なら invalid／幅 2000 は OK、2001 は invalid
- `fetchSource`：5秒で 504 相当の timeout になる（タイマーはフェイク）／非2xx → upstream／本文が 16KB を超えたら invalid
- `handleLatest`：
  - 3つの ID でそれぞれ 200 と期待する JSON を返す（FR-009）
  - 不正な ID・ID なし・`satellite=goes-east&satellite=x`・`https://evil` → 400 を返し、fetch が0回呼ばれる（FR-010）
  - 配信元が 500 → 502 で no-store、キャッシュに書かない／タイムアウト → 504（FR-011）
  - キャッシュに当たると fetch は0回／外れたら put され、応答に `max-age=300` が付く（FR-009）
  - 余計なクエリが付いても同じキャッシュキーになる

E2E：画面がないため、このプランでは作らない（画面のプランで、受け入れシナリオ1-1・2-1・3-2 を担保する）
手動スモーク：`npm run dev:full` で3衛星の `/api/latest` を叩き、返った URL をブラウザで開けて撮影日時がもっともらしいことを確認する（実際の配信元はこの手動確認だけで呼ぶ）

## 6. 実装順

0. このプランを `earth-from-satellites/.claude/plans/latest-image-api.md` に書き写す（担当：Haiku）
1. T1：土台の初期化（package.json、各 config、`npm install`。typecheck / lint / vitest が空で通ることを確認）（担当：Sonnet サブエージェント。location/ の設定を写すだけの単純作業）
2. T2：`satellites.ts`・`types.ts`、時刻の純粋関数のテスト → Red → 実装（担当：Sonnet）
3. T3：`fetchCiraTimes`・`resolveNoaaStar`・`resolveCiraSlider`・`fetchSource` のテスト → Red → 実装（担当：Opus 上位モデル。配信元の形式の扱いが中核）
4. T4：`validate.ts` と `handleLatest`（400 / 502 / 504、キャッシュ）のテスト → Red → 実装（担当：Opus 上位モデル。SSRF とキャッシュの設計を守る）
5. T5：手動スモーク、要件定義の未確定事項 #1・#2・#10 を更新し、CLAUDE.md の【要確認】のうちコマンド・ディレクトリを確定（担当：Sonnet）
6. 実装完了後、/review-impl で観点別レビュー3体を並列実行し、P0/P1 を修正

コミットはタスク単位で、先頭にタスク番号を付ける（例：`T3: add NOAA STAR and CIRA SLIDER resolvers`）。

## 7. コミット前テスト実行

- `cd earth-from-satellites && npm run typecheck && npm run lint && npx vitest run`
- E2E は対象なし

## 8. スコープ外

- 画面（画像表示、衛星の切り替え、10分ごとの更新、「○分前」表示、クレジット表示の UI）→ 次のプラン
- Playwright と husky の導入（画面のプランで、共有フックの扱いを決めてから入れる）
- ひまわりの高解像度（タイル結合）、拡大、タイムラプス
- 画像本体の中継・変換・リサイズ
- NICT・JMA・Meteosat など、ほかの配信元への切り替えや予備の配信元
- 有料の API・有料プランの機能（Cloudflare の Workers Paid、KV／R2／D1／Images など）

## 付記：実装の記録

### 実装時の判断（T1〜T5）

- resolver の引数に衛星 ID を足した（`resolveCiraSlider(id, sat, deps)`）。返す `satelliteId` に要るため
- `toCiraTimestamp` を足した（ひまわりの画像 URL を組み立てるため）
- 配信元の振り分けは `functions/api/latest.ts` の `resolve()` に書いた。新しい種類の配信元を足すときは、ここも直す
- エラー応答の code は、400＝`invalid_satellite`、502＝`upstream_error`、504＝`upstream_timeout`。画面はこの値に頼ってよい
- 担当モデルの割り当ては使わず、すべて同じモデルで実装した

### /review-impl の指摘への対応（2026-10-15、T6）

- 配信元への問い合わせは `redirect: 'manual'` にした。GET の 3xx は upstream にする。HEAD の 3xx は「まだ無い」とみなす
- HEAD の 403 も「まだ無い」とみなし、次の時刻を試す【要確認：STAR が未公開のファイルに 403 を返すかは未確認。返さないなら 404 だけに戻してよい】
- 678px で公開を確かめた時刻について、339px・1808px も HEAD で確かめる。確かめられたサイズだけを返す（サブリクエストは最大 GET 1＋HEAD 3＋2＝6回）
- タイムアウトは abort に加えて Promise.race で打ち切る。本文の読み込みが止まったときも 504 になる
- キャッシュの読み出し・書き込みが失敗しても、配信元から取った結果を返す
- CIRA の時刻一覧から、未来（now+10分より先）の時刻と重複を除く。件数の上限は1000件、本文の上限は 16KB
- エラー応答の本文は読み捨てる。すべての応答に `X-Content-Type-Options: nosniff` を付ける
- 見送った指摘（P2）：ブラウザ向けの max-age を短くすること（画面のプランで、更新周期とあわせて決める）、レート制限（無料の範囲では受け入れるリスク）、型違いの値が1件でもあれば一覧全体を invalid にする扱い（今のままにする）、ルートの tsconfig で tests を外していること（画面のプランで `tests/unit` を足すときに直す）
