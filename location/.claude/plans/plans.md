# みちすがら（location）実装計画

- 対象リポジトリ：`uchu-jin/poc`（ローカル：`~/Documents/poc`）。アプリは `location/` 配下に閉じる
- 作成日：2026-10-13
- 入力：要件定義書 v1.0（2026-10-11）＋ 質問への回答（Q1〜Q25）
- 凡例：**［仮定］** は「すべて推奨で」と回答された項目。あとから見直してよい

---

## 1. 概要

観光地を歩いているユーザーの現在地をもとに、周辺の観光地（OSM / Overpass）と天気（Open-Meteo）を取得し、Claude と会話しながら街を発見するスマホ向けの 1 画面 Web アプリを作る。

| 項目 | 決定 |
|---|---|
| 構成 | Vite ＋ TypeScript（フレームワークなし）＋ Cloudflare Pages ＋ Pages Functions（`/api/chat`） |
| AI | 既定 `claude-haiku-5-5`、環境変数 `CLAUDE_MODEL` で `claude-sonnet-5-5` に切替。SSE でストリーミング |
| 観光地 | Overpass をクライアントから直接呼ぶ。ミラーへフォールバック。カテゴリは 寺社（寺院＋神社）/ 博物館 / 展望台 / レストラン |
| 天気 | Open-Meteo をクライアントから直接呼ぶ。15 分キャッシュ |
| 永続化 | localStorage（履歴は最大 100 件、最後の位置、送信待ちキュー） |
| テスト | Vitest（ユニット、Functions）、Playwright（E2E。geolocation と外部 API をモック） |
| 品質ゲート | husky（`location/.husky`）の pre-commit で typecheck / lint / unit を実行。E2E は手動 |

---

## 2. 背景

### 2.1 目的
要件定義書 1.2 のとおり。ガイドブックよりも自然に、スマホ 1 台で周辺の魅力を知る体験を作る。

### 2.2 要件からの変更・解釈（合意済み）

要件書のままでは実装できない、または矛盾している箇所を次のように確定した。実装の前に、この内容を `location/docs/requirements/requirements.md` に反映する（T0）。

| # | 要件の記述 | 問題 | 決定 |
|---|---|---|---|
| Q4 | 4.4「GPS 座標はサーバーに送らない」 | AI に位置を渡すには、バックエンドを経由せざるを得ない | `/api/chat` に送る座標は**小数 3 桁（約 100m）に丸める**。サーバーは保存もログ出力もしない。Open-Meteo にも丸めた座標を送る。4.4 の文言を修正する |
| Q5 | F-7「送信ボタンを disabled」と AC-8「待機中のメッセージを自動送信」 | 両立しない | オフライン中も送信を受け付けて**キューに積む**（localStorage に保存）。復帰したら、たまった分を**1 リクエストにまとめて**送る |
| Q6 | F-7「住所を手入力」と AC-1b「ボタンで選択」 | 自由入力にはジオコーディングが必要 | **地方 → 都道府県 → 市区町村のボタン選択のみ**にする |
| Q7 | F-2「上位 5 件」と F-4「全件を AI に渡す」 | 都心ではレストランだけで埋まる。全件ではトークン数が膨らむ | **カテゴリごとに近い順で最大 5 件（合計 20 件まで）**を AI に渡す。画面には折りたたみ式のチップ一覧を出す |
| Q8 | `claude-3-5-sonnet` | 提供が終了している | 既定は `claude-haiku-5-5`、Sonnet 5.5 に切替可能。ストリーミングで表示する |
| Q9 | 4.1「起動から 5 秒以内」 | Overpass は混雑時に 5〜10 秒以上かかる | Overpass は **4 秒で待つのを打ち切り**、先に挨拶する。POI が後から届いたらチップを更新し、通知を出す |
| Q10 | temple | 日本の観光には神社が欠かせない | 「寺社」として仏教寺院と神社を含める。名前のない POI は除外する |
| Q11 | 位置が変わるたびに再取得 | Overpass の制限にかかる | GPS は 1 分ごとに取得する。**300m 以上**動いたときだけ観光地と天気を取り直し、通知する。精度が 100m より悪い測位は無視する |
| Q12 | F-4「場所の移動を会話コンテキストに反映」 | AI が自発的に話すかどうかが未定 | システム通知と「この辺りを教えて」ボタンを出す。AI は自発的には話さない［仮定］ |
| Q13 | 初回メッセージ | 再起動時の扱いが未定 | 履歴がない、前回位置から 300m 以上離れた、または 6 時間以上経った場合だけ挨拶を生成する［仮定］ |
| Q14 | 「全件 または 直近 10 件」 | どちらか未定 | **直近 20 件**を AI に渡す。システム通知は履歴に含めない［仮定］ |
| Q15 | AC-4b のおすすめエリア | ハルシネーションの危険がある | プロンプトで断定を禁じ、UI に「AI による提案です」と注記する［仮定］ |
| Q16 | 4.6 地理データ | 出典と網羅範囲が未定 | **全市区町村**を対象にする。公的データ（国土数値情報の市町村役場等データ）を変換スクリプトで生成し、手書きや LLM 生成はしない。ライセンスは T3 で確認する［仮定］ |
| Q17 | 「デフォルト座標は東京」 | 黙って東京として扱うと誤案内になる | 住所選択の画面を出し、東京は初期選択値にとどめる。代表点は東京駅（35.6812, 139.7671）［仮定］ |
| Q18 | 手入力のあとに GPS が復活した場合 | 未定 | GPS が成功したら自動で GPS に戻し、通知する［仮定］ |
| Q19 | ヘッダーの住所表示 | 逆ジオコーディングが必要 | 手入力時は市区町村名、GPS 時は「緯度, 経度」を表示する［仮定］ |
| Q22 | Enter で送信 | 日本語 IME の確定 Enter と衝突する | `isComposing` 中は送信しない。PC は Enter で送信、タッチ端末（`pointer: coarse`）は Enter で改行し、ボタンで送信［仮定］ |
| Q23 | 要件にない機能 | — | 「履歴をすべて消去」ボタンを追加する。429 / 529 はサーバー側の SDK で 1 回だけ再試行する［仮定］ |
| 8 | スケジュール（10-11） | 日付がすでに過ぎている | 締め切りは設けず、品質を優先する |

### 2.3 リポジトリの前提
- `poc` は複数の PoC を並べるモノレポ（Q25）。**このアプリのファイルはすべて `location/` 内に置き、リポジトリ直下には何も作らない**（`.claude/` も `location/.claude/` に置く）。依存関係も `location/package.json` に閉じる
- git hook は `.git/config` の `core.hooksPath` を `location/.husky` に向ける方式にする。lefthook は設定ファイルをリポジトリ直下に置く必要があるため採用しない
- 現時点でリポジトリにコミットはない。既存コードはなく、新規作成になる

---

## 3. 詳細設計

### 3.1 ディレクトリ構成

```
poc/                              # 直下には何も置かない
└── location/
    ├── .claude/plans/plans.md    # 本計画
    ├── .husky/pre-commit         # location/ 配下の変更があるときだけチェックを実行
    ├── README.md                 # セットアップ、デプロイ、データ出典
    ├── package.json  tsconfig.json  vite.config.ts  vitest.config.ts  playwright.config.ts
    ├── wrangler.toml  .dev.vars.example (ANTHROPIC_API_KEY, CLAUDE_MODEL, ALLOWED_ORIGINS)
    ├── CLAUDE.md                 # location 固有のルール（コマンド、設計方針）
    ├── docs/requirements/requirements.md   # 要件定義書（2.2 の変更を反映）
    ├── docs/decisions.md         # 決定ログ（本計画 2.2 の表）
    ├── index.html
    ├── src/
    │   ├── main.ts               # 起動処理とオーケストレーション
    │   ├── state/store.ts        # 単一ストア（購読型）。UI はここだけを見る
    │   ├── domain/
    │   │   ├── types.ts          # Message, Location, Poi, Weather, PlaceContext
    │   │   ├── geo.ts            # haversine、方位（8 方位）、座標の丸め
    │   │   ├── movement.ts       # 300m 閾値と精度フィルタ
    │   │   └── history.ts        # 直近 N 件の抽出、送信待ちの合流
    │   ├── location/
    │   │   ├── gps.ts            # 1 分ポーリング、visibilitychange で即時取得、エラー分類
    │   │   └── manual.ts         # 地方 → 都道府県 → 市区町村の選択
    │   ├── poi/
    │   │   ├── overpass.ts       # クエリ生成、ミラーへのフォールバック、タイムアウト、1km → 5km
    │   │   └── categories.ts     # OSM タグとカテゴリの対応
    │   ├── weather/
    │   │   ├── openMeteo.ts      # current=temperature_2m,relative_humidity_2m,weather_code
    │   │   └── wmoCodes.ts       # WMO コードと日本語の対応表
    │   ├── chat/
    │   │   ├── client.ts         # /api/chat の SSE 受信。AbortController を使う
    │   │   ├── queue.ts          # オフライン用と生成中用の送信待ちキュー
    │   │   └── network.ts        # online/offline イベントと fetch 失敗の判定
    │   ├── storage/local.ts      # 名前空間 michisugara:v1:*、壊れた JSON や容量超過に対応
    │   ├── data/municipalities.json   # 生成物（T3）
    │   └── ui/                   # header.ts, poiChips.ts, messages.ts, composer.ts, picker.ts, spinner.ts, styles.css
    ├── functions/
    │   ├── api/chat.ts           # Pages Function
    │   └── _lib/
    │       ├── schema.ts         # リクエスト検証（zod）
    │       ├── prompt.ts         # システムプロンプト（固定）とコンテキストの自然言語化
    │       ├── anthropic.ts      # SDK 呼び出し、ストリーミング、エラーの分類
    │       └── guard.ts          # Origin チェック、レート制限、本文サイズ
    ├── scripts/build-municipalities.ts
    ├── tests/unit/**  tests/functions/**
    └── e2e/**
```

### 3.2 状態とデータモデル

```ts
type LocationSource = 'gps' | 'manual' | 'restored';
interface AppLocation { lat: number; lng: number; accuracy?: number; source: LocationSource; label?: string; at: string /* ISO 8601 */ }

type MessageRole = 'user' | 'assistant' | 'notice';        // notice は UI 専用で、AI には送らない
type MessageStatus = 'sent' | 'queued' | 'streaming' | 'partial' | 'error';
interface Message { id: string; role: MessageRole; text: string; ts: string /* ISO 8601 */; status: MessageStatus; badge?: 'ai-suggestion' }

interface Poi { id: string; name: string; category: 'shrine_temple'|'museum'|'viewpoint'|'restaurant'; lat: number; lng: number; distanceM: number; bearing: string }
interface Weather { tempC: number; humidity: number; code: number; label: string; fetchedAt: string }

type PoiState = { kind: 'loading' } | { kind: 'ok'; radius: 1000|5000; pois: Poi[] } | { kind: 'empty' } | { kind: 'error' } | { kind: 'timeout-pending' };
```

- GPS のステータスは `acquiring | ok | error(denied|unavailable|timeout) | manual` の 4 種類。ヘッダーに色と文言で表示する（色だけに頼らない）
- 保存する localStorage のキー：`michisugara:v1:messages`、`:lastLocation`、`:queue`、`:lastGreetingAt`
  - 保存の失敗（`QuotaExceededError`）：古いメッセージから 20 件ずつ削除して再試行する
  - JSON が壊れていた場合：該当キーを `:corrupt-<ts>` に退避して初期化する

### 3.3 起動シーケンス

```
起動
 ├─ localStorage から履歴・最後の位置・キューを復元して即座に表示
 ├─ GPS 取得（timeout 10s, maximumAge 30s）
 │    ├─ 成功 → 位置を確定
 │    ├─ denied → 住所選択を表示（初期値：東京駅）。1 分ポーリングは止め、「GPS を再試行」ボタンを出す
 │    └─ timeout/unavailable → 最後の位置があればそれを使い、なければ住所選択。ポーリングは続ける
 ├─ 位置が確定したら、天気と POI（1km）を並列に取得
 │    ├─ 天気：失敗しても「天気なし」として続行
 │    └─ POI：4 秒で待つのを打ち切り（取得は裏で続ける）
 │          ├─ 0 件 → 5km 検索（スピナーの文言を「範囲を広げて探しています」に変える）
 │          │     └─ 0 件 → kind=area_suggestion（AI がおすすめエリアを提案）
 │          └─ 失敗 → 5km 検索はしない。「観光地情報が取得できません」として AI に伝える
 └─ 挨拶の条件（Q13）を満たせば greeting リクエスト
      └─ 打ち切り後に POI が届いたら、チップを更新し「周辺情報が届きました」を通知する（AI は呼ばない）
```

**「取得失敗」と「0 件」は必ず区別する。** 失敗したときに 5km 検索へ進むと、制限中の Overpass をさらに叩くことになるため。

### 3.4 位置の更新（F-1、Q11、Q18）
- 60 秒ごとに `getCurrentPosition` を呼ぶ。`watchPosition` は使わない（電池消費とブレの多さを避けるため）。タブが visible に戻ったときにも即時に取得する
- `accuracy > 100m` の測位は捨てる。ただし最初の 1 回は精度が悪くても受け入れる（何も位置がないよりはよいため）
- 「最後に周辺を取得した地点」から 300m 以上離れたら再取得し、「📍 場所が変わりました（約 ○m 移動）」と通知して「この辺りを教えて」ボタンを出す
- 手入力中に GPS が成功したら GPS に切り替え、通知を出す
- AI が生成中に移動を検知した場合、その生成は止めない。新しいコンテキストは次のリクエストから使う

### 3.5 Overpass（F-2、Q7、Q9、Q10）
- エンドポイント：`https://overpass-api.de/api/interpreter` で 429 / 5xx / タイムアウトのとき `https://overpass.kumi.systems/api/interpreter` に切り替える
- 送信方式は POST（`data=` の form-urlencoded）。クエリに `[out:json][timeout:8]` を付ける
- カテゴリと OSM タグの対応：
  - 寺社：`amenity=place_of_worship` かつ `religion~"^(buddhist|shinto)$"`
  - 博物館：`tourism=museum`
  - 展望台：`tourism=viewpoint`
  - レストラン：`amenity=restaurant`
- `nwr(around:R,lat,lng)[name]` をカテゴリごとに別ステートメントで書き、それぞれ `out center 40;` で件数を制限する。5km では `out center 25;` に下げる
- **プライバシー**：検索の中心は小数 3 桁に丸めた座標にし、半径を 150m 広げて検索する。距離と方位は、手元の生の座標で計算し直して半径外を除外する
- 並べ替えは距離順。カテゴリごとに 5 件、合計 20 件までに絞る
- メモリキャッシュのキーは「丸めた座標＋半径」。移動の判定とは別に、同じ地点を 10 分以内に再検索しないようにする

### 3.6 天気（F-3）
- `https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&current=temperature_2m,relative_humidity_2m,weather_code&timezone=Asia/Tokyo`（座標は丸めたもの）
- 15 分キャッシュ。WMO コードは日本語ラベル（晴れ / くもり / 雨 / 雪 / 雷雨 など）に変換する。未知のコードは「不明」とする

### 3.7 `/api/chat`（F-4、4.4）

**リクエスト**（クライアント → Function。JSON。上限 32KB）

```ts
{
  kind: 'greeting' | 'chat' | 'area_suggestion',
  place: { lat: number /*3桁*/, lng: number, label?: string, source: 'gps'|'manual' },
  pois: { status: 'ok'|'empty'|'error'|'pending', radius?: 1000|5000, items: {name, category, distanceM, bearing}[] /* ≤20 */ },
  weather: { tempC, humidity, label } | null,
  moved?: { meters: number },
  messages: { role: 'user'|'assistant', text: string /* ≤1000字 */ }[] /* ≤20 */
}
```

- **システムプロンプトはサーバー側で固定する。** クライアントからは指示文を受け取らない。こうすることで、プロキシが汎用の LLM 窓口として悪用されるのを防ぐ
- コンテキストの組み立て（自然言語、要件 F-4）：`prompt.ts` が place / pois / weather / moved を日本語の文章にする。例：「現在地：東京都千代田区付近（緯度 35.681, 経度 139.767）。天気：くもり、18℃、湿度 65%。周辺 1km の寺社：〇〇神社（北東に約 250m）…」
- メッセージの並べ方：

  ```
  system  = [固定のペルソナ・ルール（512 トークン以上にして cache_control を付ける）]
  messages = [...直近の履歴, 最新のユーザー発話, {role:'system', content: コンテキスト文}]
  ```

  - 毎回変わるコンテキストは、末尾に**会話途中のシステムメッセージ**として置く（Haiku 5.5 と Sonnet 5.5 が対応）。これで固定のシステムプロンプトのキャッシュを壊さない
  - 履歴を正規化する：先頭が assistant なら、合成の user ターン「（会話開始）」を前に置く。同じ role が続いたら結合する。送信待ちを合流させた複数のユーザー発話は改行でつなぐ
  - `greeting` と `area_suggestion` ではユーザー発話がないので、サーバーが「（アプリを開きました。挨拶して周辺を紹介してください）」などの合成ターンを作る。このターンは UI には出さず、履歴にも保存しない
- モデルのパラメータ：
  - Haiku 5.5：`thinking: {type:'disabled'}` と `output_config.effort: 'low'`（high 以下なので disabled が使える）
  - Sonnet 5.5：`thinking: {type:'between_tools'}` と `effort: 'low'`
  - 共通：`max_tokens: 1024`。プロンプトで返答を 200〜400 字程度に指示し、3〜5 秒に収める
  - thinking を無効にしているので、thinking ブロックを保持する必要はない。直近 20 件で窓をずらしても、「保存済みの thinking の改変」チェックには引っかからない
- **プロンプトのルール**（Opus が執筆。T6a）：
  - 旅のコンパニオンとして振る舞う
  - 渡された POI 以外の具体的な施設は、実在が確実なものに限る
  - 営業時間や料金は断定しない
  - 天気に合わせて提案する（雨なら屋内）
  - `area_suggestion` では、エリア名と公共交通での行き方を示し、「最新情報は現地で確認を」と添える
  - Markdown は使わず、プレーンテキスト（改行は可）で返す
- **レスポンス**：`text/event-stream` で次のイベントを流す
  - `data: {"type":"delta","text":"…"}`
  - `data: {"type":"done","stop":"end_turn"|"max_tokens"|"refusal"}`
  - `data: {"type":"error","code":"…"}`
  - ストリーム開始前のエラーは、HTTP ステータスと JSON `{code}` で返す
- **エラーの対応**（SDK の型付き例外を、具体的なものから順に catch する）：

| 状況 | code | UI の文言（要件 F-7） |
|---|---|---|
| `RateLimitError`（429）、自前のレート制限 | `rate_limited` | 「リクエストが多いです。少し待ってから試してください」 |
| `overloaded_error`（529）、その他の 5xx、`APIConnectionError` | `upstream` | 「接続エラーが発生しました。もう一度送信してください」 |
| 検証エラー（400） | `bad_request` | 同上（ログはクライアントのコンソールにのみ出す） |
| `stop_reason=refusal` | `refusal` | 「その話題にはお答えできません。別の質問をどうぞ」 |
| ストリームの途中で切断 | — | 受信済みの部分を `partial` として残し、「途中で切れました・再送」ボタンを出す |

- SDK の設定は `maxRetries: 1`、`timeout: 20s`
- **ガード**（`guard.ts`）：
  - `ALLOWED_ORIGINS` で Origin を照合する
  - Cloudflare Rate Limiting バインディングで、IP ごとに 20 リクエスト / 分に制限する（使えない環境では KV で代替）
  - 本文サイズと各フィールドの上限を zod で検証する
  - Anthropic コンソールで月額上限を設定する（運用手順として README に書く）
- **ログ**：座標、POI、本文はログに出さない。出すのはステータスコード、所要時間、トークン数だけ

### 3.8 クライアントのチャット処理（F-4、F-5、F-7、Q5）
- 同時に処理するリクエストは常に 1 つ。生成中や挨拶中に送られたメッセージは `queued` 状態でキューに積み、完了したら順に処理する
- オフライン（`navigator.onLine === false`、または fetch の TypeError）：メッセージを `queued` にして localStorage にも保存し、送信ボタンには「送信待ち」と表示する。`online` イベントが来たら、キューにあるすべてのユーザー発話を 1 リクエストにまとめて送る
- 二重送信の防止：送信直後に入力欄を空にし、id を付けて冪等にする
- キューの内容はリロードしても消えない。起動時にオンラインならすぐに送る
- 自動スクロール：ユーザーが末尾付近（下端から 80px 以内）にいるときだけ追従する

### 3.9 UI（6 章、4.5）
- 構成：ヘッダー（アプリ名、GPS ステータス、位置表示、天気の小表示、POI チップ「周辺 12 件 ▼」）＋メッセージエリア＋入力欄
- チップを開くと、名前・カテゴリ・距離・方位の一覧が出る。タップすると「〇〇について教えて」が入力欄に入る
- 吹き出しの見た目：ユーザーは右寄せで紫背景（`#5B3FD1`）に白文字（コントラスト比 4.5 以上を確認）。AI は左寄せで白背景に濃い灰色の文字。システム通知は中央寄せの小さい文字。時刻は HH:MM（端末のタイムゾーン）
- 本文は 16px 以上。`dvh` と `env(safe-area-inset-*)` を使い、iOS のキーボード表示に対応する
- スピナーの文言：「現在地を取得中」「周辺を検索中」「範囲を広げて検索中」「考え中…」
- メニューに「履歴をすべて消去」を置く（確認ダイアログあり）
- AI の提案には「AI による提案です。最新情報は現地でご確認ください」というバッジを付ける

### 3.10 地理データ（4.6、Q16）
- `scripts/build-municipalities.ts` で、国土数値情報の公的データから `{ region, prefecture, municipality, lat, lng }[]` を生成する
- 政令市は区単位まで持つ。地方は 8 区分（北海道 / 東北 / 関東 / 中部 / 近畿 / 中国 / 四国 / 九州・沖縄）
- 生成物はコミットする。出典とライセンスの表記は README と UI のフッターに入れる
- **元データのダウンロードは T3 の開始時にユーザーの承認を得てから行う**
- サイズの目安は、gzip 後で約 60KB。`import()` で遅延読み込みし、住所選択を開いたときだけ読む

---

## 4. テスト影響範囲

新規作成なので、既存コードの退行リスクはない。影響が及ぶのは次の範囲。

| 範囲 | 影響 | 対策 |
|---|---|---|
| git hook（`core.hooksPath=location/.husky`） | `core.hooksPath` はリポジトリ全体の設定なので、ほかの PoC のコミットにもこの hook が走る | hook の冒頭で `git diff --cached --name-only` を見て、`location/` 配下の変更がなければ何もせず終了する。ほかの PoC が hook を必要としたら、そのときに共通の振り分け方式を検討する |
| `location/.claude/` | Claude Code の作業フォルダを `location/` にしたときだけ有効になる | 作業は `location/` を作業フォルダにして行う |
| 外部 API（Overpass / Open-Meteo / Anthropic） | テストで実際に呼ぶと不安定になり、課金も発生する | ユニットと E2E では**すべてモックする**。実 API の疎通確認は手動のスモークテスト（`npm run smoke`、任意）に分ける |
| ブラウザの差異（iOS Safari の geolocation と localStorage） | Playwright の WebKit でも完全には再現できない | E2E は chromium と webkit の 2 プロジェクトで回す。実機の手動確認チェックリストを用意する（T12） |
| 要件定義書 | 2.2 の変更で受け入れ基準の一部が変わる | T0 で要件書と AC を更新し、テストケースの番号を AC に対応させる |

---

## 5. 新規テストケース

`.claude/plans/review.md` の指摘（P0〜P2）を反映済み。各行の末尾の【 】は、反映した指摘の ID。

### 5.1 ユニット（Vitest、`tests/unit`）

| ID | 対象 | ケース |
|---|---|---|
| U-geo-1〜4 | geo.ts | 2 点間距離（東京駅 → 皇居 ≈ 1.1km、許容 1%）／方位 8 区分の境界／小数 3 桁への丸め（35.6812364 → 35.681）／日本の東西の端（与那国島 → 南鳥島）の距離【P2-01】 |
| U-mv-1〜6 | movement.ts | 299m では移動扱いしない、300m で移動扱い（境界は「300m 以上」）／精度 100m は採用、100.1m は破棄【P1-01】／最初の 1 回は精度が悪くても採用／手入力から GPS 成功への切替／GPS のブレ（往復 50m の連続）では通知しない |
| U-loc-1〜2 | gps.ts | 成功 → timeout の順で、位置は前回のまま、ステータスは失敗、移動通知は出ない【P0-01】／エラーの分類：code 1 → denied でポーリング停止、code 2 / 3 → ポーリング継続【P1-05】 |
| U-op-1〜10 | overpass.ts | クエリ文字列のスナップショット（1km と 5km）／レスポンスの解析（node と way の center）／名前のない POI の除外／`religion=christian` は含めない【P2-06】／カテゴリごとに 5 件は残り、6 件目は落ちる【P2-07】／半径外の除外（丸め誤差の補正）／429 でミラーへ切替／両方失敗したら `error`／**0 件のときだけ 5km に進み、失敗のときは進まない**／1km でレストランが 1 件だけ → 5km に進まない（呼び出し 1 回）【P1-03】 |
| U-wx-1〜4 | weather | WMO コード表の網羅（全コードに対してテーブル駆動）／未知のコードは「不明」／キャッシュ：14 分 59 秒なら再取得しない、15 分なら再取得する【P2-02】／レスポンスから気温・湿度・コードを取り出す【P2-08】 |
| U-hist-1〜5 | history.ts | 20 件ならすべて送り、21 件なら最古を落とす（F-4 の 21 件で 400 と対）【P2-04】／notice の除外／送信待ちの合流（3 件を 1 つの user ターンに）／先頭が assistant のときの補正／同じ role の連続を結合 |
| U-st-1〜5 | storage | 保存と復元の往復／壊れた JSON を退避して初期化／`QuotaExceededError` で古いものを削除して再試行／100 件目は残り、101 件目を追加すると最古が消える【P2-03】／localStorage が使えない環境（例外を投げる）でもアプリが動く |
| U-q-1〜4 | queue.ts | オフライン中に積む／online イベントで 1 回だけ送る（二重発火への耐性）／生成中に送られたものを後で送る／リロード後に復元 |
| U-cmp-1〜3 | composer | IME で変換中の Enter では送信しない／Shift＋Enter で改行／タッチ端末では Enter で改行 |
| U-greet-1〜4 | 挨拶の判定 | 履歴なし → 生成する／経過 5 時間 59 分かつ移動 299m → 生成しない／経過 6 時間 0 分 → 生成する／移動 300m → 生成する【P2-05】 |
| U-ctx-1〜2 | 時刻 | ISO 8601 で保存されること／HH:MM 表示（タイムゾーンを固定してテスト） |
| U-data-1〜6 | municipalities.json | 都道府県がちょうど 47／地方 8 区分にすべての都道府県が属する／すべての座標が日本の範囲内（緯度 20〜46、経度 122〜154）／(都道府県, 市区町村) の重複なし／政令市は区単位（横浜市の 18 区があり、横浜市単独の項目はない）／東京駅を初期値として選べる【P1-12】 |

### 5.2 Functions（Vitest ＋ SDK のモック、`tests/functions`）

| ID | ケース |
|---|---|
| F-1 | 正常系：delta が SSE で順に流れ、`done` で終わる |
| F-2 | 自然言語のコンテキスト：pois / weather / moved が文章に入っている。weather が null のときに天気の行がない。POI が `error` のときは「取得できませんでした」の文になる |
| F-3 | 会話途中のシステムメッセージが末尾に 1 つだけあり、固定のシステムプロンプトに `cache_control` が付いている |
| F-4 | 検証：messages が 20 件なら 200、21 件なら 400／本文が 1000 字なら 200、1001 字なら 400／座標が 3 桁なら 200、4 桁なら 400／本文サイズが 32KB なら 200、32KB＋1B なら 413【P2-10】／未知の kind なら 400 |
| F-5 | Origin が許可リストにない → 403 |
| F-6 | 同じ IP からの 20 回目は 200、21 回目は 429 `rate_limited`。別の IP からは 200【P1-13】 |
| F-7 | SDK の `RateLimitError` → `rate_limited`、529 → `upstream`、`APIConnectionError` → `upstream` |
| F-8 | `stop_reason=refusal` → `done{stop:'refusal'}` |
| F-9 | ログに座標・本文が出ていない（console をスパイして確認） |
| F-10 | `CLAUDE_MODEL=claude-sonnet-5-5` のときに thinking が `between_tools` になる |
| F-11 | `radius: 5000` のとき、コンテキスト文に「1km 以内には見つからず、5km 圏内」と書かれる。`area_suggestion` では、エリア名と行き方を求める合成ターンが付く【P0-03】 |
| F-12 | Origin ヘッダーがない → 403。許可された Origin → 200【P1-14】 |
| F-13 | 既定（Haiku）のとき、thinking は `disabled`、effort は `low`、max_tokens は 1024【P2-09】 |

### 5.3 E2E（Playwright、`e2e/`。geolocation は `context.setGeolocation`、外部 API は `page.route` でモック）

| ID | 対応 AC | シナリオ |
|---|---|---|
| E-1 | AC-1, AC-4 | 許可 → 「成功」表示 → 座標を小数 4 桁で表示 → 挨拶がストリーミングで表示される |
| E-2 | AC-1 | 時間を 60 秒進めると再取得される（`page.clock`）。350m 移動させると「場所が変わりました」が出て、POI チップが更新される |
| E-3 | AC-1b, AC-8 | 許可を拒否 → 住所選択（地方 → 都道府県 → 市区町村） → ヘッダーに市区町村名 → 挨拶 |
| E-4 | AC-2, AC-4b | 1km で 0 件 → 「範囲を広げて検索中」 → 5km でも 0 件 → `area_suggestion` と注記バッジ |
| E-5 | AC-2 | Overpass が 5 秒遅延 → 4 秒で挨拶が出る → 後から「周辺情報が届きました」が出て、`/api/chat` は再び呼ばれない【P1-02】 |
| E-6 | AC-3 | Open-Meteo が 500 → 天気なしで会話を続けられる |
| E-7 | AC-8 | `/api/chat` が 429 または 529 → 対応する文言が出る。refusal → 「その話題にはお答えできません」【P2-11】 |
| E-8 | AC-8 | オフラインで 2 件送信 → 「送信待ち」表示 → オンライン化 → 1 リクエストで送られ、返答が 1 つだけ |
| E-9 | AC-7 | 会話 → リロード → 履歴が復元され、挨拶は再生成されない |
| E-10 | AC-6 | Enter で送信すると入力欄が空になり、末尾までスクロールする。IME で変換中の Enter では送信されない。上にスクロールしているときは追従しない【P2-12】 |
| E-11 | F-7 | ストリームの途中で切断 → `partial` 表示と再送ボタン |
| E-12 | 4.5 | axe-core でコントラストとラベルの違反が 0 件 |
| E-13 | AC-8 | 成功の後に geolocation を失敗させて 60 秒進める → 座標の表示は変わらず、ステータスが「失敗」になり、住所選択は出ない【P0-01】 |
| E-14 | AC-1b | GPS を拒否して何も選ばずに 10 秒待つ → `/api/chat`、Overpass、Open-Meteo へのリクエストが 0 件で、住所選択の初期選択が「関東 / 東京都」【P0-02】 |
| E-15 | AC-4, AC-4b | 1km で 0 件 → 5km で 3 件 → `/api/chat` の本文が `pois.radius === 5000` かつ `kind === 'greeting'`。チップに 3 件が出る【P0-03】 |
| E-16 | AC-2 | Overpass が 3 秒で応答 → 挨拶のリクエストに POI が含まれ、「周辺情報が届きました」は出ない【P1-02】 |
| E-17 | AC-2, F-7 | Overpass の 2 つのミラーがどちらも 500 → Overpass へのリクエストは 1km の 2 回だけ（5km なし）。`/api/chat` に `pois.status === 'error'` が送られ、会話は続けられる【P1-04】 |
| E-18 | F-7, AC-8 | 初回から timeout で、前回の位置がない → 住所選択を表示【P1-05】 |
| E-19 | AC-1b | timeout → 手入力で選ぶ → geolocation を成功させて 60 秒進める → ヘッダーが座標表示に変わり、GPS に戻ったことを知らせる通知が出る【P1-06】 |
| E-20 | F-7 | 拒否 → 「GPS を再試行」が出る → 権限を付与してボタンを押す → ステータスが「成功」【P1-07】 |
| E-21 | AC-5 | 外部 API を遅延させ、「現在地を取得中」「周辺を検索中」「考え中…」が順に表示され、完了したら消える【P1-08】 |
| E-22 | F-5 | 履歴の消去 → キャンセルなら残る／OK なら画面と localStorage（messages、queue）が空になり、リロードしても戻らない。消去した後は挨拶を再生成する（D-13 の「履歴がない」）【P1-09】 |
| E-23 | F-2 | チップを開いて項目をタップ → 入力欄に「〇〇について教えて」が入り、自動送信はされない【P1-10】 |
| E-24 | F-4 | 移動通知の「この辺りを教えて」を押す → `/api/chat` が 1 回呼ばれ、新しい位置のコンテキストが付いている【P1-10】 |
| E-25 | AC-4, 4.1 | モックが即座に応答する条件で、起動から挨拶の最初の文字が出るまで 1 秒以内（クライアント側の処理時間の予算）【P1-11】 |
| E-26 | AC-9, 4.4 | geolocation を (35.681236, 139.767125) に設定 → Open-Meteo の latitude / longitude、Overpass の `around` の中心、`/api/chat` の place が、すべて小数 3 桁以下【P1-15】 |
| E-27 | AC-7 | `/api/chat` を通信エラーにして送信 → 「送信待ち」→ オンラインのままリロード → 「送信待ち」が残る → 通信を戻すと自動で送られる【P1-16】 |

### 5.4 ビルド検査とスモークテスト

| ID | 種別 | ケース |
|---|---|---|
| B-1 | `npm run check:bundle`（build の後に実行。T12 と PR 前に必須） | `dist/` の中に `sk-ant-`、`ANTHROPIC_API_KEY`、`x-api-key`、`api.anthropic.com` が含まれない【P0-04】 |
| S-1 | `npm run smoke`（手動。課金あり） | 実際の Haiku に 5 回送り、最初の文字までの時間と、出終わるまでの時間の中央値を出す。基準（3 秒 / 5 秒）を超えたら警告する【P1-11】 |

## 6. 実装順（担当モデル・サブエージェントの割り当て）

方針：
- **メイン（Opus 5.5）** が担うのは、設計判断、プロンプトの執筆、統合、レビュー
- 実装は `general-purpose` のサブエージェント（`model: sonnet`）に任せる
- 機械的な作業は Haiku に任せる
- 互いに独立したタスクは `isolation: "worktree"` で並列に進める
- 各タスクの完了条件は「そのタスク分のユニットテストが緑」かつ「pre-commit が通る」こと。完了後にメインが差分をレビューしてからコミットする

| # | タスク | 担当 | 依存 | 並列 | 成果物 |
|---|---|---|---|---|---|
| T0 | 要件書の取り込みと変更の反映、決定ログ、`location/README.md`・`location/CLAUDE.md` | **メイン Opus** | — | — | `docs/requirements/requirements.md`、`docs/decisions.md` |
| T1 | 雛形：Vite＋TS、ESLint＋Prettier、Vitest、Playwright、wrangler、husky（`prepare`: `cd .. && husky location/.husky`）、`.dev.vars.example` | general-purpose / **Sonnet** | T0 | — | `npm run dev / typecheck / lint / test / e2e` が動く |
| T2 | ドメイン層：`types` / `geo` / `movement` / `history` / `storage`（TDD。U-geo、U-mv、U-hist、U-st） | general-purpose / **Sonnet**（worktree） | T1 | T3、T5 と並列 | `src/domain/*`、`src/storage/*` |
| T3 | 市区町村データ：データ源とライセンスの確認 → **ダウンロードはユーザーの承認後** → 変換スクリプト → JSON 生成 → 件数と座標範囲（日本の領域内か）の検証テスト | general-purpose / **Haiku**（worktree）。メインが抽出した 10 件を地図と照合 | T1 | T2、T5 と並列 | `scripts/build-municipalities.ts`、`src/data/municipalities.json` |
| T4 | Overpass クライアント（U-op。0 件と失敗の区別、ミラー、丸めの補正） | general-purpose / **Sonnet**（worktree） | T2 | T5、T6 と並列 | `src/poi/*` |
| T5 | Open-Meteo と WMO コード表（U-wx。コード表のテーブルテストは機械的に作る） | general-purpose / **Haiku**（worktree） | T1 | T2、T3 と並列 | `src/weather/*` |
| T6a | システムプロンプトとコンテキスト文のテンプレートの執筆（ペルソナ、禁止事項、area_suggestion の書式） | **メイン Opus** | T0 | T4 と並列 | `functions/_lib/prompt.ts`（文面） |
| T6b | `/api/chat`：zod スキーマ、SDK のストリーミング、エラー分類、ガード、ログ方針（F-1〜F-10） | general-purpose / **Sonnet**（worktree） | T6a | T4 と並列 | `functions/**` |
| T7 | 位置の制御：GPS のポーリング、エラーの分類、手入力の選択、GPS 復帰 | general-purpose / **Sonnet** | T2、T3 | T8 と並列 | `src/location/*` |
| T8 | チャットのクライアント：SSE の受信、キュー、オフライン、同時実行の制御（U-q） | general-purpose / **Sonnet** | T2、T6b | T7 と並列 | `src/chat/*` |
| T9 | UI 一式：ヘッダー、チップ、吹き出し、入力欄（IME）、スピナー、住所選択、履歴消去、a11y（U-cmp） | general-purpose / **Sonnet** | T7、T8 | — | `src/ui/*`、`index.html` |
| T10 | 起動のオーケストレーション（3.3 の流れ、4 秒の打ち切り、挨拶の判定 U-greet）と結合 | **メイン Opus** が設計とレビュー、実装は general-purpose / **Sonnet** | T4、T5、T9 | — | `src/main.ts`、`src/state/store.ts` |
| T11 | E2E の E-1〜E-12 | general-purpose / **Sonnet** | T10 | — | `e2e/**` |
| T12 | レビュー：`/code-review high`、`/security-review`（キーの露出、Origin、ログ、プロンプトインジェクション）、実機の手動確認チェックリスト | **メイン Opus** | T11 | — | 修正コミット、`docs/manual-qa.md` |
| T13 | デプロイ手順（Cloudflare Pages の作成、Root=`location`、Secrets、Rate Limiting バインディング、月額上限）を README に書く | general-purpose / **Haiku** | T12 | — | `location/README.md` |

補足：
- コードベースの横断調査（命名の不整合や重複の検出など）が必要になったら、都度 `Explore` エージェントを使う
- `Plan` エージェントは使わない（本計画が設計の正本）
- 専用のエージェント定義（`.claude/agents/`）は作らない。必要になったら T12 の後に検討する

---

## 7. コミット前テストの実行

`location/.husky/pre-commit`（`npm install` 時に `prepare` スクリプトが `core.hooksPath` を設定する）：

```sh
# location/ 配下にステージされた変更がなければ何もしない
git diff --cached --name-only | grep -q '^location/' || exit 0
cd location
npm run typecheck
npx lint-staged          # 対象は eslint --fix と prettier --check（location 内のステージ済みファイルのみ）
npm run test -- --run
```

手動で実行するもの（PR の前と、T10 以降の各コミット前に推奨）：

```bash
npm --prefix location run e2e
```

`location/package.json` の scripts：

| script | 内容 |
|---|---|
| `typecheck` | `tsc --noEmit -p . && tsc --noEmit -p functions` |
| `lint` | `eslint . && prettier --check .` |
| `test` | `vitest`（unit ＋ functions） |
| `e2e` | `playwright test`（chromium ＋ webkit。`wrangler pages dev` を webServer として起動） |
| `smoke`（任意） | S-1。実際の Overpass / Open-Meteo / Anthropic に問い合わせて応答時間を測る。課金が発生するため手動でのみ実行 |
| `check:bundle` | B-1。ビルド成果物に API キー関連の文字列が含まれないことを検査する |

ルール：hook を `--no-verify` で迂回しない。失敗したら直してからコミットする。

---

## 8. スコープ外

- 要件 3.2 の項目：音声入出力、多言語対応、認証とクラウド同期、地図表示、混雑情報
- 住所の自由入力と外部ジオコーディング（Q6）
- 場所が変わったときに AI から自発的に話しかける機能（Q12）
- バックグラウンドでの位置追跡（iOS や Android でタブが裏に回ったときは停止する。前面に戻ったら即時に取得する）
- Service Worker によるアプリ本体のオフラインキャッシュと PWA 化。**オフラインでリロードするとアプリ自体が開かない**ことを既知の制約として記録する
- Turnstile などのボット対策（Origin チェックとレート制限で代替）
- 生成中の中断ボタン（内部では AbortController を使うが、UI には出さない）
- POI の営業時間や評価の取得、ほかのデータソース（Google Places など）
- 会話の要約やコンパクション（直近 20 件の窓で十分）
- 利用状況の解析やテレメトリ
