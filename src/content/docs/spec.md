---
title: 仕様書（全文）
description: RGSP 公開用 API 仕様書 v0.1（ドラフト）
---

## 1. RGSP とは


連珠（と五目並べ）の**対局サーバーの共通仕様**です。この仕様に沿ったサーバーなら、どのアプリからでも、同じ方法でつなげます。

- **ユーザーは、アプリの中で「対局するサーバー」を選びます。** マッチングとレーティングは、選んだサーバーの中で行います。
- **サーバーは、誰でも運営できます。** 仕様と、参照実装（ソース公開の実装）が公開されます。
- **アプリも、誰でも作れます。** アプリの事前登録は要りません。同じサーバーを選べば、別のアプリのユーザーどうしでも対戦できます。

```
        ┌───────────────┐   一覧を取得        ┌───────────────────┐
        │   アプリ A    │ ─────────────────▶ │ ディレクトリ         │
        │ （クライアント）│                     │ 準拠したサーバーの一覧 │
        └──────┬────────┘                     └───────────────────┘
               │ 選んだサーバーへ（HTTPS）
               ▼
  ┌──────────────────────────┐        ┌──────────────────────────┐
  │ サーバー X（運営者 P）      │        │ サーバー Y（運営者 Q）      │
  │ アカウント・ロビー・対局・   │        │ アカウント・ロビー・対局・   │
  │ レーティング・棋譜          │        │ レーティング・棋譜          │
  └──────────────────────────┘        └──────────────────────────┘
        ▲
        │ 同じサーバーを選べば、別のアプリの人どうしでも対戦できる
   アプリ B
```

| 用語 | 意味 |
|---|---|
| サーバー | この仕様に準拠する対局サーバー 1 台（1 運営）。アカウント・ロビー・対局・レーティングの単位 |
| アプリ | ユーザーが使う画面。サーバーにつなぐだけで、アカウントもレーティングも持たない |
| 運営者 | サーバーを立てて運営する人・団体 |
| ディレクトリ | 準拠したサーバーの一覧（§12） |
| 参照実装 | ソースを公開するサーバー実装。他の運営者が立てるときの出発点（§16。未公開） |

**範囲**: 規則判定、対局の進行、アカウントの取得、ロビー、レーティング、観戦、棋譜、サーバーの発見と準拠確認。
**範囲外（v0.1）**: サーバー間の対局（別サーバーの人どうしの対戦）、トーナメント、詰め連珠・記事などの対局以外の機能。

---

## 2. 設計の考え方


1. **サーバー権威。** 着手の合法性・時計・終局は、サーバーだけが決める。アプリは「意図」を送り、サーバーが結果を返す。
2. **コマンドとイベントを分ける。** 操作は HTTP の POST（コマンド）、変化の受信は SSE（イベント）。
3. **イベントは全順序で、再開できる。** 対局ごとに連番（`seq`）を振り、切れても続きから受け取れる。
4. **着手ログが正。** 盤面・手番・時計は、着手ログから導ける。
5. **加算的に進化する。** 未知のフィールド・イベント・アクションは無視する（§14）。
6. **サーバーは自己申告し、検証される。** 対応する機能は `/.well-known/` で名乗り、適合性テストで確かめる（§12）。
7. **アプリは、信頼できないサーバーにつなぐことがある。** トークンはサーバーごとに分ける（§4）。

---

## 3. 最小の流れ（例）


ホストは `game.example.com` とする。

```bash
# 1. サーバーの情報を読む（認証なし）
curl https://game.example.com/.well-known/renju-game-server

# 2. 規則判定は、ログインなしで使える（制限あり）
curl -X POST https://game.example.com/v1/rules/judge \
  -H 'Content-Type: application/json' \
  -d '{"rule":"renju.free","moves":[{"x":8,"y":8},{"x":8,"y":9}],"candidate":{"x":7,"y":7}}'

# 3. トークンを得る（§4。ブラウザでサーバーのログイン画面を開く）→ ACCESS_TOKEN

# 4. 対局を作る（募集）
curl -X POST https://game.example.com/v1/games \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' \
  -d '{"rule":"renju.free","clock":{"initial_ms":600000,"increment_ms":0},
       "rated":true,"opponent":{"open":true}}'

# 5. 対局のイベントを受け取る（SSE）
curl -N https://game.example.com/v1/games/g_01JABCDEF/stream \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Accept: text/event-stream'

# 6. 着手する
curl -X POST https://game.example.com/v1/games/g_01JABCDEF/actions \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' \
  -d '{"type":"move","x":8,"y":8,"expect_move_number":1}'

# 7. 棋譜を取る
curl https://game.example.com/v1/games/g_01JABCDEF/record?format=json
```

---

## 4. サーバーの発見と認証


### 4.1 発見（`/.well-known/renju-game-server`）

サーバーは、自分のドメインの `/.well-known/renju-game-server`（JSON、認証なし）で自己申告する。

```json
{
  "protocol": "rgsp",
  "versions": ["1"],
  "name": "Example Server",
  "operator": { "name": "Example", "url": "https://example.com", "contact": "mailto:ops@example.com" },
  "api_base": "https://game.example.com/v1",
  "rules": ["renju.free", "renju.taraguchi10", "gomoku", "gomoku.swap2"],
  "features": { "guest": true, "rated": true, "lobby": true, "spectate": true, "bots": true },
  "auth": {
    "authorization_endpoint": "https://game.example.com/oauth/authorize",
    "token_endpoint": "https://game.example.com/oauth/token",
    "guest_endpoint": "https://game.example.com/v1/auth/guest",
    "personal_token_url": "https://game.example.com/settings/tokens",
    "scopes": ["game:read", "game:play", "lobby:write", "rating:read"]
  },
  "rating": { "algorithm": "glicko2", "initial": 1500, "scope": "server" },
  "limits": { "max_concurrent_games_per_player": 3 },
  "clocks": {
    "presets": [
      { "id": "fischer-5m", "name": "5分+3秒", "clock": { "initial_ms": 300000, "increment_ms": 3000 } },
      { "id": "move-60s", "name": "一手60秒", "clock": { "per_move_ms": 60000 } }
    ],
    "custom": { "allowed": true, "max_initial_ms": 3600000, "max_per_move_ms": 600000 }
  },
  "terms_url": "https://game.example.com/terms",
  "support": { "url": "https://game.example.com/support", "message": "このサーバーの運営を支援してください" },
  "conformance": { "level": "play", "suite_version": "0.1.0" },
  "server_time": "2026-11-17T10:00:00.000Z"
}
```

- `conformance` は自己申告。**「準拠」の印はディレクトリの側が付ける**（§12）。
- `GET {api_base}/meta` でも同じ情報（と現在の上限・サーバー時刻）を取れる。
- `support` は寄付の案内（任意）。§13。

### 4.2 トークンの取得（OAuth 2.0 認可コード＋PKCE）

アプリは、**選んだサーバー**に対して、RFC 6749 の認可コードフローと PKCE（RFC 7636）でトークンを得る。ログインの画面と方法（パスワード・外部ログイン）は、サーバーが決める。**ユーザーのパスワードや外部アカウントの情報は、アプリを通らない。**

- **アプリの登録は不要。** `client_id` はアプリが決める任意の文字列（推奨: アプリの識別 URL）。サーバーは、未知の `client_id` を拒否してはならない（MUST NOT）。
- 安全は、次の 2 つで守る。**`redirect_uri` は厳密一致で検証**し、**PKCE（`S256`）を必須**にする。偽装を防ぎたい運営者は、クライアントのメタデータ文書（URL を `client_id` にする方式）を任意で足せる。
- `redirect_uri` に使える形: アプリが `https://` で持つ URL（推奨）、`http://127.0.0.1:<port>`（ループバック）、アプリ固有のスキーム（モバイル）。
- `scope`: `game:read`（観戦・棋譜の取得）、`game:play`（対局の操作）、`lobby:write`（募集・応募）、`rating:read`（自分のレーティング）。既定は最小。ユーザーが同意画面で承認する。
- アクセストークンは短命（15 分〜1 時間）、リフレッシュトークンは長め（30〜90 日）。サーバーが決める。トークンは**そのサーバー専用**で、他のサーバーに送ってはならない。
- 認証は `Authorization: Bearer <token>`（RFC 6750）。不正・期限切れなら `401`＋`WWW-Authenticate: Bearer error="invalid_token"`。

アカウントは**サーバーごと**に持つ。ログインの方法（メール・外部のログインなど）は、各サーバーが決める。共通の ID は、将来、サーバーのログイン方法の 1 つとして足せる（仕様の変更なし）。

### 4.3 ゲスト（任意）

`features.guest = true` のサーバーは、`POST {api_base}/auth/guest` で、ゲストのプレイヤー（レートなし・数時間で失効）を作れる。ゲストはカジュアル対局のみ。アプリは、ゲストを始める前に、ユーザーに「ゲストで続ける」ことを示す（SHOULD）。

### 4.4 アプリ側の注意（SHOULD）

- トークンは、サーバーごとに別の保管場所に置く（端末の安全な保管場所を使う）。
- サーバーの表示（名前・運営者・規約）を、接続前にユーザーに見せる。
- ディレクトリにないサーバーへの接続は、警告を出す。

### 4.5 個人用トークン（任意）

サーバーは、ログイン中のユーザーが**自分専用のアクセストークン**を作れる画面を、任意で提供できる（`auth.personal_token_url`）。OAuth を通さずに、ユーザー自身のスクリプトや Bot からサーバーを使うためのもの。

- 使い方は OAuth のトークンと同じ（`Authorization: Bearer`）。`scope` は作るときにユーザーが選ぶ。
- トークンは作ったときだけ表示し、ユーザーがいつでも失効できる。有効期限は、サーバーが決める。
- **個人用トークンは、他の人に配るアプリに埋め込んではならない（MUST NOT）。** アプリは OAuth を使う。ユーザーに「トークンを貼ってください」と求めるのも避ける（SHOULD NOT）。
- Bot は、Bot のアカウント（`kind: "bot"`）で個人用トークンを使うのが推奨（§11）。

### 4.6 アプリの識別（`User-Agent`）

- **ブラウザ以外のアプリは、すべてのリクエストの `User-Agent` に、サイトの URL・アプリ名・連絡先のメールのいずれかを入れる（MUST）。** 例: `User-Agent: https://myrenjuapp.example.com/`。運営者が、問題のあるアプリの作者に連絡し、破壊的変更を知らせるため。
- ブラウザのアプリは、`User-Agent` を設定できないので、`Origin` で識別する。
- サーバーは、`User-Agent` のないリクエストを、拒否するか制限してもよい（MAY）。

---

## 5. 語彙


### 5.1 規則名

| 規則名 | 意味 |
|---|---|
| `renju` | 黒に三三・四四・長連の禁手。白は 5 連以上で勝ち。開局の指定なし |
| `renju.free` | `renju` に、初手天元・2 手目 3×3 内・3 手目 5×5 内 |
| `renju.taraguchi10` | 禁手あり・Taraguchi-10 開局（スワップ 5 回、10 候補手 or 9×9 内） |
| `gomoku` | 禁手なし・ぴったり 5 連で勝ち |
| `gomoku.swap2` | `gomoku` に Swap2 開局 |

- サーバーは、対応する規則を `rules` に列挙する。**`renju.free` と `gomoku` は、準拠のために対応が必須。**
- `freestyle` という名前は、この仕様では使わない（Gomocup の freestyle は「禁手なし・5 連以上」で、連珠の自由打ちと別物のため）。
- 拡張規則は `x.<運営者のドメイン>.<名前>`（例 `x.example.com.rapid`）。アプリは、未知の規則名を「対応していない」として扱う。

### 5.2 座標・色・盤

- 盤は 15×15。座標は 1 始まりで、`x` は 1〜15（左から A〜O）、`y` は 1〜15（**上から**）。天元は `(8, 8)`。
- 色は `black` / `white`（小文字）。黒が 1 手目。
- 着手: `{ "n": 12, "x": 8, "y": 8, "color": "black", "t_ms": 3200 }`。`t_ms` はその手に使った時間（ミリ秒）。
- 時刻は UTC の ISO 8601（ミリ秒まで）。持ち時間は整数ミリ秒。

**他の形式との変換**

| 形式 | 変換 |
|---|---|
| 連珠棋譜文字列（`H8`） | 列 = `x` を A〜O、行 = `16 - y`。`(8,8) → H8` |
| SGF（`GM[4]`、`SZ[15]`） | `x-1`・`y-1` を `a`〜`o` にする。`(8,8) → hh`（x → y の順） |
| Gomocup/Piskvork | `(x-1, y-1)`（0 始まり、左上が `0,0`） |

### 5.3 結果

`winner`（`black` / `white` / `draw` / `none`）と `reason` に分ける。

| `winner` | `reason` | 意味 |
|---|---|---|
| 黒 / 白 | `five` | 五連（白は連珠規則で 5 連以上） |
| 黒 / 白 | `resign` | 相手の投了 |
| 黒 / 白 | `timeout` | 相手の時間切れ |
| 黒 / 白 | `forfeit` | 相手の不戦敗 |
| 黒 / 白 | `disconnect` | 相手の切断（§7.4） |
| `draw` | `agreement` / `board_full` | 合意 / 盤面が埋まった |
| `none` | `aborted` | 無効局（レート対象外） |

---

## 6. 対局の API


ベース URL は `api_base`。すべて JSON。詳細は [openapi.yaml](/openapi.yaml)。

### 6.1 エンドポイント

| メソッド・パス | 内容 | 認証 | 準拠レベル |
|---|---|---|---|
| `GET /meta` | サーバーの情報・上限・サーバー時刻 | 不要 | Core |
| `POST /rules/judge` | ステートレスな規則判定（§6.2） | 不要（制限あり） | Core |
| `POST /auth/guest` | ゲストの作成 | 不要 | 任意 |
| `GET /players/me` | 自分のプレイヤー情報・レーティング | `game:read` | Play |
| `GET /players/{id}` | 公開プロフィール・レーティング | 不要 | Play |
| `POST /games` | 対局を作る（相手指定・募集・リンク） | `game:play` | Play |
| `GET /games/{id}` | 対局のスナップショット | 公開は不要 | Play |
| `POST /games/{id}/actions` | 着手・開局の操作・投了・引き分け等（§6.3） | `game:play` | Play |
| `GET /games/{id}/stream` | イベント（SSE。NDJSON は任意。§6.4） | 公開は不要 | Play |
| `GET /games/{id}/record?format=` | 棋譜の書き出し（§8） | 公開は不要 | Play |
| `GET /games?status=live` | 観戦一覧（カーソル式ページング） | 不要 | Play（`spectate`） |
| `POST /challenges`／`GET /challenges`／`POST /challenges/{id}/accept` | 募集・一覧・応募 | `lobby:write` | Lobby |
| `GET /stream/events` | 自分宛のイベント（挑戦を受けた・対局が始まった） | `game:read` | Lobby |
| `GET /ratings?rule=&format=` | サーバーのレーティング上位 | 不要 | Lobby（任意） |

**準拠レベル**: **Core**（`meta`・`rules/judge`・棋譜の取得）／**Play**（Core＋対局・SSE・観戦）／**Lobby**（Play＋募集・応募・レーティング）。

### 6.2 規則判定 `POST /rules/judge`

```json
// リクエスト
{ "rule": "renju.free", "moves": [ { "x": 8, "y": 8 }, { "x": 8, "y": 9 } ],
  "candidate": { "x": 7, "y": 7 } }
// 応答
{ "legal": true, "reason": null, "next_color": "black", "phase": "move_3",
  "forbidden_points": [ { "x": 5, "y": 5, "kind": "double_three" } ],
  "winner": null }
```

- `moves` は着手の列（色は手順から決まる。スワップなど色が変わる規則は、`opening_actions` を併せて渡す）。`candidate` は「この点に打てるか」を調べる任意の点。
- **禁手点の一覧**（`forbidden_points`）を一括で返す。アプリが盤上に印を出すのに使う。`kind`: `double_three`（三三）、`double_four`（四四）、`overline`（長連）。

### 6.3 アクション `POST /games/{id}/actions`

本文は `type` で分ける。

```json
{ "type": "move", "x": 8, "y": 8, "expect_move_number": 12 }
{ "type": "swap_decision", "decision": "swap" }
{ "type": "choose_color", "color": "black" }
{ "type": "choose_branch", "branch": "candidates" }
{ "type": "submit_candidates", "points": [ { "x": 5, "y": 5 } ] }
{ "type": "select_candidate", "index": 2 }
{ "type": "swap2_choice", "route": "A" }
{ "type": "resign" }
{ "type": "draw_offer" }   { "type": "draw_accept" }   { "type": "draw_decline" }
{ "type": "takeback_offer" }   { "type": "takeback_accept" }   { "type": "takeback_decline" }
{ "type": "claim_disconnect_win" }
```

- 応答: `200 { "state": <スナップショット>, "seq": 13 }`。
- `expect_move_number`: 期待する次の手数。合わなければ `409`（`stale_move`）。着手では付けるのが SHOULD。
- **冪等性**: `Idempotency-Key` ヘッダーを受けたら、同じキーの再送に同じ応答を返す（SHOULD）。
- どのフェーズでどのアクションが有効かは、§7.2 の表を正とする。

### 6.4 イベント配信（SSE）

`GET /games/{id}/stream`（`Accept: text/event-stream`）。WHATWG の Server-Sent Events に従う。**接続直後に必ず全状態を 1 件**送り、以降は差分を送る。

```
event: game.state
id: 0
data: {"v":1,"game_id":"g_1","seq":0,"state":{...スナップショット...},"server_time":"2026-11-17T10:00:00.123Z"}

event: move
id: 12
data: {"v":1,"seq":12,"move":{"n":12,"x":8,"y":8,"color":"black","t_ms":3200},"turn":"white","phase":"playing","clock":{"black_ms":412300,"white_ms":398800,"running":"white","as_of":"2026-11-17T10:05:01.000Z"}}

event: game.end
id: 31
data: {"v":1,"seq":31,"result":{"winner":"black","reason":"five"},"rating":{"black":{"before":1620,"after":1634},"white":{"before":1588,"after":1575}}}
```

| イベント | 内容 |
|---|---|
| `game.state` | 全状態（接続直後・再開時） |
| `move` | 着手（手番・フェーズ・時計を相乗り） |
| `opening` | 開局の操作（スワップ・候補・色選択・Swap2） |
| `offer` | 引き分け・待ったの申し出と応答 |
| `presence` | 相手の接続状態（`online` / `offline`） |
| `game.end` | 終局（結果・レート変動） |

- 全イベントに、手番・フェーズ・時計を相乗りさせ、受信側が 1 件で同期できるようにする。
- `seq` は 0 から連番。**飛んだら、アプリは `GET /games/{id}` で取り直す。** `Last-Event-ID` つきで再接続したら、サーバーは欠けた分を再送する（保持できない場合は、先頭に `game.state` を送る）。
- 15〜30 秒ごとに `: ping` のコメント行を送る（SHOULD）。
- `GET /stream/events` は、プレイヤー宛のイベント（`challenge.received`・`challenge.accepted`・`game.start`）を同じ形式で流す。

#### NDJSON（任意）

サーバーは、同じ URL で NDJSON でも配信してよい（MAY）。**SSE は必須、NDJSON は任意。**

- クライアントが `Accept: application/x-ndjson` を送ったときだけ NDJSON で返す。それ以外（`Accept` なし・`text/event-stream`・`*/*`）は SSE で返す。
- NDJSON を実装しないサーバーは、`Accept: application/x-ndjson` に SSE で返してよい。**クライアントは、応答の `Content-Type` を見て形式を決める。**
- 1 行が 1 イベントで、中身は SSE の `data` と同じ JSON。**イベント名は `type` フィールドに入れる**（例: `{"type":"move","v":1,"seq":12,...}`）。
- 接続直後に `game.state` を 1 行送る点、`seq` の意味、飛んだときの取り直しは SSE と同じ。
- 再開は、`Last-Event-ID` ヘッダー、または `since=<seq>` クエリ（最後に受け取った `seq`）で行う。
- 空行を、ハートビートとして 15〜30 秒ごとに送る（SHOULD）。受け取った側は、空行を無視する。

---

## 7. 時計・開局・禁手・切断


### 7.1 時計

- 持ち時間は**サーバー時計だけ**で測る。通信の遅れの補償はしない（着手がサーバーに届いた時刻で数える）。
- **設定**（`clock_config`）は、次の 3 つを自由に組める。**`initial_ms` と `per_move_ms` の少なくとも 1 つは必須。**
  - `initial_ms`: 持ち時間（対局全体）。省略すると、全体の制限なし。
  - `increment_ms`: 1 手ごとの加算（フィッシャー方式）。既定 0。持ち時間があるときだけ意味を持つ。
  - `per_move_ms`: 一手の上限。手番ごとに毎回この値に戻る。省略すると、一手の制限なし。
- 時間切れは、**持ち時間が 0 になったとき、または一手が `per_move_ms` を超えたとき**の早いほう。
- 組み合わせの例: 5 分＋加算 3 秒 → `{"initial_ms":300000,"increment_ms":3000}`／一手 60 秒だけ → `{"per_move_ms":60000}`／持ち時間 10 分＋一手 30 秒まで → `{"initial_ms":600000,"per_move_ms":30000}`。
- 表現: `{ "black_ms", "white_ms", "move_ms", "running": "black"|"white"|null, "as_of" }`。`black_ms`・`white_ms` は持ち時間の残り（`initial_ms` がなければ `null`）、`move_ms` は手番側のその手の残り（`per_move_ms` がなければ `null`）。アプリは `残り = ms − (サーバー時刻 − as_of)` で自前に表示する。サーバーは、0.5 秒ごとの更新を送らなくてよい。
- **サーバーが出す時間設定は `meta.clocks` で公開する。** `presets` は、そのサーバーが勧める組（`id`・表示名・設定）。アプリは、これを選択肢として見せる。`custom` は、プリセット以外の値を受け付けるか（`allowed`）と、その上限。サーバーの国や好みに合わせて、プリセットを自由に決めてよい。範囲外は `422`（`clock_not_allowed`）。
- 時間切れは、期限にサーバーが 1 度だけ判定して終局にする。サーバーが再起動したら、起動時に期限切れの対局を走査して処理する（MUST）。

### 7.2 開局フェーズ

詳細な状態遷移は、参照実装と適合性テストで定義する（v0.1 では要点のみ）。

| 規則 | フェーズの流れ | 有効なアクション |
|---|---|---|
| `renju` | `playing` | `move` |
| `renju.free` | `move_1` → `move_2`（3×3 内）→ `move_3`（5×5 内）→ `playing` | `move` |
| `renju.taraguchi10` | `move_1` → `swap_1` → `move_2` → `swap_2` → `move_3` → `swap_3` → `move_4` → `swap_4` → `move_5_choice`（通常 or 10 候補）→ … → `swap_5` → `move_6` → `playing` | `move`・`swap_decision`・`choose_branch`・`submit_candidates`・`select_candidate` |
| `gomoku` | `playing` | `move` |
| `gomoku.swap2` | `place_3` → `swap2_choice` →（`place_2` → `color_choice`）→ `playing` | `move`・`swap2_choice`・`choose_color` |

### 7.3 禁手

**禁手の点への着手は拒否する**（`422`、`forbidden_point`）。「打つと負け」のモードは、拡張規則（`x.…`）として、サーバーが任意に足せる。

### 7.4 切断

サーバーは、SSE 接続の有無と最後の API 呼び出しの時刻から、相手の `presence` を判断する。一定時間（既定 60 秒＋60 秒。`meta` に公開）オフラインが続いたら、相手に `claim_disconnect_win` を許す。

---

## 8. 棋譜


```json
{
  "v": 1,
  "id": "g_01JABCDEF",
  "server": "https://game.example.com",
  "rule": "renju.taraguchi10",
  "board_size": 15,
  "clock": { "initial_ms": 600000, "increment_ms": 0 },
  "players": {
    "black": { "id": "p_1", "name": "Alice", "rating": 1620 },
    "white": { "id": "p_2", "name": "Bob",   "rating": 1588 }
  },
  "moves": [ { "n": 1, "x": 8, "y": 8, "color": "black", "t_ms": 2100 } ],
  "opening_actions": [
    { "after_move": 1, "type": "swap_decision", "decision": "stay" },
    { "after_move": 4, "type": "candidates", "points": [ { "x": 5, "y": 5 } ], "selected": 0 }
  ],
  "result": { "winner": "black", "reason": "five" },
  "rated": true,
  "started_at": "2026-11-17T10:00:00.000Z",
  "ended_at": "2026-11-17T10:17:42.000Z"
}
```

- 各着手に `color` を持たせるのは、スワップで「黒番の人」が入れ替わっても、石の色が一意に残るため。
- `opening_actions` に、スワップの判断・候補手・Swap2 の選択を残す（一般の棋譜形式では落ちる情報）。
- 書き出し形式（`format=`）: `json`（正準・MUST）、`text`（連珠表記の空白区切り）・`sgf`・`psq`（Piskvork）は MAY。
- v0.1 では、棋譜に署名はしない。将来、任意の署名欄を足しても互換が壊れないようにする。

---

## 9. レーティング


- **レーティングはサーバーごとの値**で、他のサーバーとは比較できない。アプリは、サーバー名とともに表示する（MUST）。
- 方式は `meta.rating` で自己申告する。**推奨は Glicko-2**（初期 1500・RD 350・τ 0.5）。別の方式を使ってもよいが、`algorithm` に名前を出す。
- 軸は、規則×形式（リアルタイム・通信）を基本にする。`GET /players/{id}` が、軸ごとの `rating`・`rd`・`games_played`・`provisional` を返す。
- 同じサーバーなら、別のアプリのユーザーどうしも、そのサーバーのレーティングでマッチする。
- カジュアル（`rated: false`）はレートを動かさない。

---

## 10. エラー


エラーは `application/problem+json`（RFC 9457）。

```json
{ "type": "https://rgsp.renjuportal.com/errors/stale-move", "title": "Stale move",
  "status": 409, "code": "stale_move", "detail": "expected move 13, got 12" }
```

| `code` | status | 意味 |
|---|---|---|
| `invalid_token` | 401 | トークンが不正・期限切れ |
| `forbidden` | 403 | 権限がない（参加者でない・scope が足りない） |
| `not_found` | 404 | 存在しない（見せたくないものも同じ応答にしてよい） |
| `not_your_turn` | 409 | 自分の手番でない |
| `stale_move` | 409 | `expect_move_number` が合わない |
| `illegal_move` | 422 | 規則上打てない |
| `forbidden_point` | 422 | 禁手の点 |
| `invalid_action_for_phase` | 422 | いまのフェーズで無効なアクション |
| `game_over` | 409 | 終局済み |
| `rate_limited` | 429 | 制限超過（`Retry-After`） |
| `unsupported_rule` | 422 | このサーバーが対応しない規則 |

`detail` は人間向け。**アプリは `code` で判断し**、自分の言語で表示する。

---

## 11. 制限・セキュリティ


- **制限はサーバーの裁量。** 超過は `429`＋`Retry-After`（MUST）。`RateLimit-*` ヘッダーは SHOULD。上限は `meta.limits` に公開する。
- **CORS**: ブラウザのアプリから使えるように、`Access-Control-Allow-Origin` を適切に返す（`Authorization` を許可）。トークンは Cookie ではなく Bearer で送るので、CSRF の対象にならない。
- **トークンの混同を防ぐ**: トークンは、発行したサーバーだけが受け付ける（`aud` をサーバーの `api_base` にする）。
- **サーバー権威**: アプリが申告した色・手数・時刻は無視する。
- **観戦・棋譜の公開範囲**: 対局ごとに `visibility`（`private` / `unlisted` / `public`）を持つ。サーバーは、API で必ず確認する（MUST）。
- **Bot**: プレイヤーの `kind: "bot"` を名乗らせ、対局相手に表示する（MUST）。サーバーは、Bot を禁止してもよい（`features.bots`）。エンジンはアプリ側（またはブリッジ）で動かし、サーバーが第三者の実行ファイルを動かすことは求めない。
- **個人情報**: 個人情報は最小にし、年齢の扱いの方針は運営者が公開する（SHOULD）。表示名・レーティング・所属サーバーは、他のアプリ・観戦者に見えうる。プレイヤー単位の非表示と、削除（匿名化）の手段を提供する（SHOULD）。年齢確認や保護者同意の仕組みは、仕様では求めない（各運営者の責任）。

---

## 12. サーバー一覧と適合性チェック


**ディレクトリ**は、準拠したサーバーの一覧で、プロトコルの管理者（ふくふく）が管理する。

- 形式: 静的な `servers.json`（必要になれば API を足す）。
- 申請: 運営者が自分のサーバーの URL を登録する。管理者が `/.well-known/` を読み、確認の記録を公開リポジトリに残す。

**適合性テスト**は、次の 3 つからなる。

- **ゴールデンテスト**: 規則判定の入出力（禁手を含む約 700 局面、勝敗、開局の対称、座標・棋譜の変換）を固定データにして、`POST /rules/judge` が同じ答えを返すか確かめる。
- **プロトコルテスト**: テスト用の 2 つのプレイヤーで、対局の作成 → 着手 → SSE の受信（順序・再開）→ 投了・時間切れ・引き分け → 棋譜の書き出し → エラー（`problem+json`・`code`）を実際に通す。
- **セキュリティ確認**: 認証なしでの非公開対局の読み取り、他人の対局への着手、PKCE なしの認可、`redirect_uri` の不一致を拒否するか。

運営者が、申請のときに自分でテストを走らせる。管理者が、申請時・仕様の更新時・年 1 回に再実行する。結果は、準拠レベル（Core / Play / Lobby）とテストの版で表す。

| 状態 | 意味 |
|---|---|
| `listed` | 申請を受け、掲載した（準拠の確認前または確認中） |
| `conformant` | 適合性テストに通った。準拠レベルとテストの版つきで「準拠」の印を出す |
| `suspended` | 問題があり、一覧に出さない（理由を運営者に通知） |

> **注意**: ディレクトリとテストは、まだ存在しない。§16 を見てください。

---

## 13. 寄付とバッジ


### 13.1 寄付の案内（`support`）

- サーバーは、運営への支援（寄付）の案内を、`meta`・`/.well-known/` の `support`（`url`・`message`）として、任意で持てる。宛先は、**そのサーバーの運営者**。
- **アプリは、ユーザーが選んだサーバーの `support` を表示するのが推奨**（SHOULD）。必須ではない。表示の場所と頻度は、アプリが決める（対局の邪魔になる出し方は避ける）。
- `url` は運営者が管理する `https` の URL。アプリは、運営者の確認なしに別の URL へ差し替えてはならない。
- 支援の受け取り方・使い道は、運営者が決める。仕様では扱わない。

### 13.2 支援者バッジ

サーバーは、プレイヤーに**印（バッジ）**を付けられる。プレイヤー情報（`PlayerRef`）の `badges` に入れて返す。

```json
{ "id": "p_1", "name": "Alice", "badges": [
  { "id": "supporter", "label": "支援者", "since": "2026-11-01T00:00:00.000Z" } ] }
```

- 標準の ID は **`supporter`**（そのサーバーの運営を支援した人）。サーバー独自の印は `x.` で始める（例 `x.tournament-winner-2026`）。
- 支援者かどうかの判断・付け方・外し方は、サーバーの運営者の仕事で、仕様では決めない。
- アプリは、バッジを表示するのが推奨（SHOULD）。知らない ID は、`label` があれば表示し、なければ無視してよい。
- **バッジは表示専用。** 対局の権限・マッチング・レーティング・時間の扱いに影響させない（MUST）。
- バッジは、そのサーバーの中だけの印で、他のサーバーには引き継がれない（アカウントがサーバーごとのため）。

---

## 14. 版の方針


| 規則 | 内容 |
|---|---|
| URL に主版 | `api_base` の末尾に `/v1`。主版は破壊的変更のときだけ上げる |
| 加算的変更は版を上げない | フィールド・イベント・アクション・規則の追加。**アプリとサーバーは、未知のものを無視する（MUST）** |
| `versions` | `/.well-known/` に、対応する主版を列挙。アプリは、共通する最新の主版を使う |
| 旧主版の保証 | 新しい主版を出してから、**最低 6 か月**は旧主版を動かし、停止の前に予告する（`Deprecation`・`Sunset` ヘッダー）。仕様の約束は、参照実装には MUST、他のサーバーには SHOULD |
| 拡張 | 独自のフィールド・イベント・規則は `x.` 接頭辞（フィールドは `x_`）。標準になったら接頭辞を外す |
| v0.x の間 | **ドラフトの間は、互換性を保証しない。** 変更は、予告なしに入りうる |

**仕様の変更手続き**: 提案（Issue / PR）は誰でも出せ、議論は公開。採否はプロトコルの管理者（ふくふく）が決める。変更は、適合性テストの更新とセットで出す。運営者が増えたら、合意制への移行を検討する。

**将来の拡張**（v0.1 の範囲外）: トーナメント、WebSocket（同じメッセージ形式で追加）、共通 ID（ログイン方法の 1 つとして）、棋譜の署名、サーバー間の対局、サーバーをまたぐ通報・BAN の共有。

---

## 15. ほかの仕様との比べ方（Lichess との違い）


連珠の対局サーバーの共通仕様に近い取り組みとして、チェスの Lichess が、API を公開し、サードパーティーのアプリが使えるようにしている。比べたのは、Lichess が GitHub で公開している OpenAPI（版 2.0.180、2026-11-17 に取得。`lichess-org/api`）。考え方は近いが、違いがある。

| | Lichess | RGSP |
|---|---|---|
| サーバーの数 | 1 つ（`https://lichess.org`） | **仕様。誰でもサーバーを運営でき、アプリがサーバーを選ぶ** |
| アカウントとレーティング | Lichess の 1 つの集合 | **サーバーごと** |
| 対象 | チェスとその派生 | **連珠・五目並べ（禁手・開局規則を仕様に含む）** |
| ストリーミング | HTTP の NDJSON（`application/x-ndjson`）。最初の行が `gameFull`、続いて `gameState`・`chatLine`・`opponentGone` | SSE（必須）。最初に `game.state` を送り、`Last-Event-ID` で再開できる。同じ URL で NDJSON も任意で出せる（`Accept` で選ぶ。WebSocket は将来） |
| 認証 | OAuth 2.0 認可コード＋PKCE。**アプリの登録は不要（任意の client id）**、`S256` のみ。アクセストークンは長命（約 1 年）で、リフレッシュトークンはない。**個人用アクセストークン**もある | OAuth 2.0 認可コード＋PKCE。アプリの登録は不要。トークンは短命で、リフレッシュトークンを使う。**個人用トークン**も任意で提供できる（§4.5） |
| アプリの識別 | **`User-Agent` に、サイトの URL・アプリ名・連絡先メールのいずれかを必須**（連絡と、破壊的変更の知らせのため） | **同じく必須**（ブラウザのアプリは `Origin`）（§4.6） |
| 着手の送り方 | `POST /api/board/game/{id}/move/{move}`（UCI 表記。引き分けの申し出は `offeringDraw`） | `POST /games/{id}/actions`（座標の JSON。`expect_move_number` で競合を検出） |
| Board と Bot | 人間用の Board API と、エンジンの使用を許す Bot API を、エンドポイントとアカウントの種類で分ける | `kind: "bot"` の名乗りで区別する（エンドポイントは分けない） |
| 制限 | 一度に 1 リクエスト。`429` の後は 1 分待つ | `429`＋`Retry-After`、`meta.limits` に上限を公開 |
| 仕様書の形 | OpenAPI 3.1 と、デモアプリ・各言語のクライアントの一覧 | OpenAPI 3.1（デモ・クライアントは未作成） |
| 適合性確認 | なし（実装は 1 つ） | **適合性テストと「準拠」の印** |

要するに、Lichess は「1 つのサービスの API」で、RGSP は「**同じ API を話す、複数のサービスの共通仕様**」。ふつうの API 仕様書に、連珠の規則（禁手・開局）と、サーバーを選ぶための仕組み（発見・一覧・適合性）が加わったものと考えてよい。

**Lichess から取り入れた点**: アプリの `User-Agent` の必須化（§4.6）、個人用アクセストークン（§4.5）。デモアプリとクライアントライブラリの公開は、仕様の外の作業として、未着手。

---

## 16. いまの状況と、未定のこと


**決まっていること**

| 項目 | 内容 |
|---|---|
| 名前 | RGSP（Renju Game Server Protocol） |
| 構造 | 連合型。誰でもサーバーを運営でき、アプリはサーバーを選ぶ。アカウント・レーティングはサーバーごと |
| 通信 | REST ＋ SSE（NDJSON は任意。WebSocket は将来） |
| 規則 | 必須は `renju.free` と `gomoku`。禁手は着手を拒否 |
| 時計 | 遅延補償なし |
| 認証 | OAuth 2.0 ＋ PKCE。アプリの登録は不要。個人用トークンは任意。非ブラウザのアプリは `User-Agent` が必須 |
| ライセンス | 仕様は CC0、実装（適合性テスト・参照実装）は MIT |
| 変更手続き | 提案は誰でも、採否はふくふく |

**未定のこと（まだ存在しない・日程が決まっていない）**

| 項目 | いまの状態 |
|---|---|
| **`renju-core` の配布** | 禁手判定・勝敗・レーティングの実装（TypeScript）。方針は「参照実装と一緒に、MIT で公開」と決めたが、**公開の時期・リポジトリは未定**。公開されるまで、他の運営者は、規則判定を自分で実装する必要がある |
| **参照実装（サーバー）** | **未着手**。設計の方針（独立サービス・専用 DB）だけある |
| **ディレクトリ（サーバー一覧）** | 管理者はふくふく、形式は `servers.json`、と決めたが、**公開先の URL・申請の窓口は未定**。いまは一覧が存在しない |
| **適合性テスト** | 実施の方法（運営者が自分で走らせ、管理者が再実行）は決めたが、**テストスイートは未作成**。ゴールデンテストの固定データも未作成 |
| **仕様のリポジトリ** | 独立リポジトリで公開すると決めたが、**未作成**。仕様とテストを同じリポジトリにするかは未定 |
| 英語版 | 日本語を正とし、英語の翻訳を並べて置く（[rgsp-public-spec.en.md](/en/spec/)）。日本語と食い違ったら、日本語が正 |
| 負荷の実測 | 未実施 |

---

## 付録: OpenAPI


機械可読の定義は [openapi.yaml](/openapi.yaml)（OpenAPI 3.1）。パス 14 本、スキーマ 24 件。YAML の構文とスキーマの参照は検査したが、**実際のサーバーに対しては試していない**。
