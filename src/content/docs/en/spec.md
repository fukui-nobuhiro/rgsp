---
title: Full specification
description: RGSP Public API Specification v0.1 (Draft)
---

## 1. What is RGSP?


RGSP is a **common specification for Renju (and Gomoku) game servers.** Any app can connect to any server that follows it, in the same way.

- **Users choose a game server inside the app.** Matchmaking and ratings happen inside the chosen server.
- **Anyone can run a server.** The specification and a reference implementation (open source) will be published.
- **Anyone can build an app.** No app registration is needed. Users of different apps can play each other as long as they choose the same server.

```
        ┌───────────────┐   fetch list         ┌───────────────────────┐
        │    App A      │ ───────────────────▶ │ Directory             │
        │   (client)    │                      │ list of conformant    │
        └──────┬────────┘                      │ servers               │
               │ to the chosen server (HTTPS)  └───────────────────────┘
               ▼
  ┌──────────────────────────────┐   ┌──────────────────────────────┐
  │ Server X (operator P)        │   │ Server Y (operator Q)        │
  │ accounts, lobby, games,      │   │ accounts, lobby, games,      │
  │ ratings, records             │   │ ratings, records             │
  └──────────────────────────────┘   └──────────────────────────────┘
        ▲
        │ Users of different apps can play each other on the same server
   App B
```

| Term | Meaning |
|---|---|
| Server | One game server (one operation) that follows this spec. The unit of accounts, lobby, games and ratings |
| App | The UI users interact with. It only connects to servers; it holds no accounts or ratings |
| Operator | The person or organization that runs a server |
| Directory | A list of conformant servers (§12) |
| Reference implementation | An open-source server implementation, a starting point for other operators (§16; not yet published) |

**In scope:** rules judging, game flow, account acquisition, lobby, ratings, spectating, records, server discovery and conformance.
**Out of scope (v0.1):** cross-server games, tournaments, and non-game features (tsume-renju puzzles, articles, etc.).

---

## 2. Design principles


1. **Server authority.** Move legality, clocks and game end are decided by the server only. Apps send an *intent*; the server returns the result.
2. **Commands and events are separate.** Operations are HTTP POSTs (commands); changes are received via SSE (events).
3. **Events are totally ordered and resumable.** Each game has a sequence number (`seq`); a dropped connection resumes where it left off.
4. **The move log is the truth.** Board, turn and clock can be derived from it.
5. **Evolve additively.** Unknown fields, events and actions are ignored (§14).
6. **Servers self-declare and are verified.** Features are declared at `/.well-known/` and checked by the conformance suite (§12).
7. **Apps may connect to untrusted servers.** Tokens are kept per server (§4).

---

## 3. Minimal flow (example)


The host is `game.example.com`.

```bash
# 1. Read server info (no auth)
curl https://game.example.com/.well-known/renju-game-server

# 2. Rules judging works without login (rate-limited)
curl -X POST https://game.example.com/v1/rules/judge \
  -H 'Content-Type: application/json' \
  -d '{"rule":"renju.free","moves":[{"x":8,"y":8},{"x":8,"y":9}],"candidate":{"x":7,"y":7}}'

# 3. Get a token (§4; open the server's login page in a browser) -> ACCESS_TOKEN

# 4. Create a game (open seek)
curl -X POST https://game.example.com/v1/games \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' \
  -d '{"rule":"renju.free","clock":{"initial_ms":600000,"increment_ms":0},
       "rated":true,"opponent":{"open":true}}'

# 5. Receive game events (SSE)
curl -N https://game.example.com/v1/games/g_01JABCDEF/stream \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Accept: text/event-stream'

# 6. Play a move
curl -X POST https://game.example.com/v1/games/g_01JABCDEF/actions \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' \
  -d '{"type":"move","x":8,"y":8,"expect_move_number":1}'

# 7. Get the record
curl https://game.example.com/v1/games/g_01JABCDEF/record?format=json
```

---

## 4. Discovery and authentication


### 4.1 Discovery (`/.well-known/renju-game-server`)

A server self-declares at `/.well-known/renju-game-server` on its own domain (JSON, no auth).

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
      { "id": "fischer-5m", "name": "5 min + 3 s", "clock": { "initial_ms": 300000, "increment_ms": 3000 } },
      { "id": "move-60s", "name": "60 s per move", "clock": { "per_move_ms": 60000 } }
    ],
    "custom": { "allowed": true, "max_initial_ms": 3600000, "max_per_move_ms": 600000 }
  },
  "terms_url": "https://game.example.com/terms",
  "support": { "url": "https://game.example.com/support", "message": "Please support this server." },
  "conformance": { "level": "play", "suite_version": "0.1.0" },
  "server_time": "2026-11-17T10:00:00.000Z"
}
```

- `conformance` is self-declared. **The "conformant" mark is granted by the directory side** (§12).
- `GET {api_base}/meta` returns the same information (plus current limits and server time).
- `support` is an optional donation notice (§13).

### 4.2 Obtaining a token (OAuth 2.0 authorization code + PKCE)

An app obtains a token **from the chosen server** using the RFC 6749 authorization code flow with PKCE (RFC 7636). The login screen and method (password, external login) are up to the server. **The user's password and external-account details never pass through the app.**

- **App registration is not required.** `client_id` is an arbitrary string chosen by the app (recommended: the app's identifying URL). A server MUST NOT reject an unknown `client_id`.
- Security rests on two things: **`redirect_uri` is verified by exact match**, and **PKCE (`S256`) is required.** Operators who want to prevent app impersonation may optionally add client metadata documents (a URL used as `client_id`).
- Allowed `redirect_uri` forms: an `https://` URL owned by the app (recommended), `http://127.0.0.1:<port>` (loopback), or an app-specific scheme (mobile).
- `scope`: `game:read` (spectate, fetch records), `game:play` (play), `lobby:write` (seeks, accepts), `rating:read` (own ratings). Default is minimal; the user approves on a consent screen.
- Access tokens are short-lived (15 min–1 h); refresh tokens longer (30–90 days). The server decides. A token is **valid only for that server** and MUST NOT be sent to other servers.
- Authentication uses `Authorization: Bearer <token>` (RFC 6750). Invalid or expired: `401` + `WWW-Authenticate: Bearer error="invalid_token"`.

Accounts are **per server.** Login methods (email, external login, etc.) are each server's choice. A shared ID may later be added as one login method (no spec change).

### 4.3 Guests (optional)

A server with `features.guest = true` can create guest players via `POST {api_base}/auth/guest` (unrated, expire after a few hours). Guests play casual games only. Before starting as a guest, the app SHOULD make clear to the user that they are continuing as a guest.

### 4.4 Notes for apps (SHOULD)

- Keep tokens in a separate store per server (use the device's secure storage).
- Show the server's name, operator and terms to the user before connecting.
- Warn before connecting to a server not in the directory.

### 4.5 Personal tokens (optional)

A server may optionally offer a page where a logged-in user can create **a personal access token for themselves** (`auth.personal_token_url`). It lets users reach the server from their own scripts or bots without going through OAuth.

- It is used like an OAuth token (`Authorization: Bearer`). The user chooses the `scope` when creating it.
- The token is shown only at creation and the user can revoke it at any time. The server decides any expiry.
- **A personal token MUST NOT be embedded in an app distributed to other people.** Apps use OAuth, and SHOULD NOT ask users to paste a token.
- Bots are encouraged to use personal tokens with a bot account (`kind: "bot"`) (§11).

### 4.6 App identification (`User-Agent`)

- **Non-browser apps MUST put the site URL, the app name, or a contact email in the `User-Agent` of every request.** Example: `User-Agent: https://myrenjuapp.example.com/`. This lets operators contact the authors of problematic apps and announce breaking changes.
- Browser apps cannot set `User-Agent` and are identified by `Origin` instead.
- A server MAY reject or rate-limit requests without a `User-Agent`.

---

## 5. Vocabulary


### 5.1 Rule names

| Rule | Meaning |
|---|---|
| `renju` | Forbidden moves for Black: 3-3, 4-4, overline. White wins with 5 or more. No opening restriction |
| `renju.free` | `renju` plus: 1st move at center, 2nd move inside 3×3, 3rd move inside 5×5 |
| `renju.taraguchi10` | Forbidden moves apply; Taraguchi-10 opening (5 swaps, 10 candidate moves or inside 9×9) |
| `gomoku` | No forbidden moves; exactly 5 in a row wins |
| `gomoku.swap2` | `gomoku` with a Swap2 opening |

- A server lists the rules it supports in `rules`. **Support for `renju.free` and `gomoku` is required for conformance.**
- The name `freestyle` is not used in this spec (Gomocup's freestyle means "no forbidden moves, 5 or more", which differs from Renju's free opening).
- Extension rules are named `x.<operator domain>.<name>` (e.g. `x.example.com.rapid`). Apps treat unknown rule names as "unsupported".

### 5.2 Coordinates, colors, board

- The board is 15×15. Coordinates are 1-based: `x` is 1–15 (A–O from the left), `y` is 1–15 (**from the top**). The center is `(8, 8)`.
- Colors are `black` / `white` (lowercase). Black plays first.
- A move: `{ "n": 12, "x": 8, "y": 8, "color": "black", "t_ms": 3200 }`. `t_ms` is the time spent on that move in milliseconds.
- Timestamps are UTC ISO 8601 (to milliseconds). Time controls are integer milliseconds.

**Conversion to other formats**

| Format | Conversion |
|---|---|
| Renju notation (`H8`) | column = `x` as A–O, row = `16 - y`. `(8,8) → H8` |
| SGF (`GM[4]`, `SZ[15]`) | `x-1`, `y-1` as letters `a`–`o`. `(8,8) → hh` (x then y) |
| Gomocup/Piskvork | `(x-1, y-1)` (0-based, top-left is `0,0`) |

### 5.3 Results

Split into `winner` (`black` / `white` / `draw` / `none`) and `reason`.

| `winner` | `reason` | Meaning |
|---|---|---|
| black / white | `five` | Five in a row (White: 5 or more under Renju rules) |
| black / white | `resign` | Opponent resigned |
| black / white | `timeout` | Opponent ran out of time |
| black / white | `forfeit` | Opponent forfeited |
| black / white | `disconnect` | Opponent disconnected (§7.4) |
| `draw` | `agreement` / `board_full` | Agreed / board full |
| `none` | `aborted` | Void game (not rated) |

---

## 6. Game API


The base URL is `api_base`. All bodies are JSON. See [openapi.yaml](/openapi.yaml) for details.

### 6.1 Endpoints

| Method and path | Purpose | Auth | Level |
|---|---|---|---|
| `GET /meta` | Server info, limits, server time | none | Core |
| `POST /rules/judge` | Stateless rules judging (§6.2) | none (rate-limited) | Core |
| `POST /auth/guest` | Create a guest | none | optional |
| `GET /players/me` | Own player info and ratings | `game:read` | Play |
| `GET /players/{id}` | Public profile and ratings | none | Play |
| `POST /games` | Create a game (invite a player / open seek / link) | `game:play` | Play |
| `GET /games/{id}` | Game snapshot | none if public | Play |
| `POST /games/{id}/actions` | Move, opening actions, resign, draw, etc. (§6.3) | `game:play` | Play |
| `GET /games/{id}/stream` | Events (SSE; NDJSON optional, §6.4) | none if public | Play |
| `GET /games/{id}/record?format=` | Export the record (§8) | none if public | Play |
| `GET /games?status=live` | Live games to spectate (cursor paging) | none | Play (`spectate`) |
| `POST /challenges` / `GET /challenges` / `POST /challenges/{id}/accept` | Seeks: create, list, accept | `lobby:write` | Lobby |
| `GET /stream/events` | Events for me (challenge received, game started) | `game:read` | Lobby |
| `GET /ratings?rule=&format=` | Server leaderboard | none | Lobby (optional) |

**Conformance levels:** **Core** (`meta`, `rules/judge`, record retrieval) / **Play** (Core + games, SSE, spectating) / **Lobby** (Play + seeks, accepts, ratings).

### 6.2 Rules judging `POST /rules/judge`

```json
// request
{ "rule": "renju.free", "moves": [ { "x": 8, "y": 8 }, { "x": 8, "y": 9 } ],
  "candidate": { "x": 7, "y": 7 } }
// response
{ "legal": true, "reason": null, "next_color": "black", "phase": "move_3",
  "forbidden_points": [ { "x": 5, "y": 5, "kind": "double_three" } ],
  "winner": null }
```

- `moves` is the move sequence (colors follow from the order; for rules where colors change, such as swaps, also pass `opening_actions`). `candidate` is an optional point to test.
- **All forbidden points** (`forbidden_points`) are returned at once, so apps can mark them on the board. `kind`: `double_three`, `double_four`, `overline`.

### 6.3 Actions `POST /games/{id}/actions`

The body is discriminated by `type`.

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

- Response: `200 { "state": <snapshot>, "seq": 13 }`.
- `expect_move_number`: the expected next move number. A mismatch gives `409` (`stale_move`). SHOULD be sent with moves.
- **Idempotency:** on receiving an `Idempotency-Key` header, return the same response for a retry with the same key (SHOULD).
- Which actions are valid in which phase is defined by the table in §7.2.

### 6.4 Event stream (SSE)

`GET /games/{id}/stream` (`Accept: text/event-stream`), following WHATWG Server-Sent Events. **Immediately after connecting, the server MUST send one full-state event**, then deltas.

```
event: game.state
id: 0
data: {"v":1,"game_id":"g_1","seq":0,"state":{...snapshot...},"server_time":"2026-11-17T10:00:00.123Z"}

event: move
id: 12
data: {"v":1,"seq":12,"move":{"n":12,"x":8,"y":8,"color":"black","t_ms":3200},"turn":"white","phase":"playing","clock":{"black_ms":412300,"white_ms":398800,"running":"white","as_of":"2026-11-17T10:05:01.000Z"}}

event: game.end
id: 31
data: {"v":1,"seq":31,"result":{"winner":"black","reason":"five"},"rating":{"black":{"before":1620,"after":1634},"white":{"before":1588,"after":1575}}}
```

| Event | Content |
|---|---|
| `game.state` | Full state (on connect / resume) |
| `move` | A move (turn, phase and clock piggybacked) |
| `opening` | An opening action (swap, candidates, color choice, Swap2) |
| `offer` | Draw / takeback offers and responses |
| `presence` | Opponent connection state (`online` / `offline`) |
| `game.end` | Game end (result, rating changes) |

- Every event carries turn, phase and clock so that a receiver can sync from a single event.
- `seq` is consecutive from 0. **On a gap, the app refetches `GET /games/{id}`.** On reconnecting with `Last-Event-ID`, the server resends the missed events (or, if it cannot retain them, starts with a `game.state`).
- Send a `: ping` comment line every 15–30 seconds (SHOULD).
- `GET /stream/events` streams player-addressed events (`challenge.received`, `challenge.accepted`, `game.start`) in the same format.

#### NDJSON (optional)

A server MAY also serve the same URL as NDJSON. **SSE is required; NDJSON is optional.**

- Return NDJSON only when the client sends `Accept: application/x-ndjson`. Otherwise (no `Accept`, `text/event-stream`, or `*/*`) return SSE.
- A server that does not implement NDJSON MAY answer `Accept: application/x-ndjson` with SSE. **Clients MUST decide the format from the response `Content-Type`.**
- One line is one event, with the same JSON as the SSE `data`. **The event name goes in a `type` field** (e.g. `{"type":"move","v":1,"seq":12,...}`).
- A `game.state` line comes first, `seq` means the same, and gap handling is the same as SSE.
- Resume with the `Last-Event-ID` header or a `since=<seq>` query (the last `seq` received).
- Send a blank line as a heartbeat every 15–30 seconds (SHOULD). Receivers ignore blank lines.

---

## 7. Clock, opening, forbidden moves, disconnection


### 7.1 Clock

- Time is measured **by the server clock only.** There is no network-lag compensation (time is counted at the moment a move reaches the server).
- **Configuration** (`clock_config`) combines three fields freely. **At least one of `initial_ms` and `per_move_ms` is required.**
  - `initial_ms`: main time for the whole game. Omit for no total limit.
  - `increment_ms`: time added after each move (Fischer). Default 0. Meaningful only with main time.
  - `per_move_ms`: the limit for a single move. Resets every turn. Omit for no per-move limit.
- A player loses on time when **main time reaches 0 or a single move exceeds `per_move_ms`**, whichever comes first.
- Examples: 5 min + 3 s increment → `{"initial_ms":300000,"increment_ms":3000}`; 60 s per move only → `{"per_move_ms":60000}`; 10 min main with at most 30 s per move → `{"initial_ms":600000,"per_move_ms":30000}`.
- Representation: `{ "black_ms", "white_ms", "move_ms", "running": "black"|"white"|null, "as_of" }`. `black_ms` / `white_ms` are the remaining main time (`null` without `initial_ms`); `move_ms` is the mover's remaining time for the current move (`null` without `per_move_ms`). Apps display `remaining = ms − (server time − as_of)` on their own. Servers need not send updates every 0.5 s.
- **A server publishes the time settings it offers in `meta.clocks`.** `presets` are the settings the server recommends (`id`, display name, config); apps show them as choices. `custom` says whether values outside the presets are accepted (`allowed`) and their upper bounds. Servers may choose presets to suit their country and community. Out-of-range values get `422` (`clock_not_allowed`).
- A timeout is judged once by the server at the deadline and ends the game. After a restart, the server MUST scan for expired games at startup and process them.

### 7.2 Opening phases

Detailed state transitions will be defined by the reference implementation and the conformance suite (v0.1 gives the outline only).

| Rule | Phase flow | Valid actions |
|---|---|---|
| `renju` | `playing` | `move` |
| `renju.free` | `move_1` → `move_2` (inside 3×3) → `move_3` (inside 5×5) → `playing` | `move` |
| `renju.taraguchi10` | `move_1` → `swap_1` → `move_2` → `swap_2` → `move_3` → `swap_3` → `move_4` → `swap_4` → `move_5_choice` (normal or 10 candidates) → … → `swap_5` → `move_6` → `playing` | `move`, `swap_decision`, `choose_branch`, `submit_candidates`, `select_candidate` |
| `gomoku` | `playing` | `move` |
| `gomoku.swap2` | `place_3` → `swap2_choice` → (`place_2` → `color_choice`) → `playing` | `move`, `swap2_choice`, `choose_color` |

### 7.3 Forbidden moves

**A move on a forbidden point is rejected** (`422`, `forbidden_point`). A "lose if played" mode may be added by a server as an extension rule (`x.…`).

### 7.4 Disconnection

The server judges the opponent's `presence` from the SSE connection and the time of the last API call. If the opponent stays offline for a set time (default 60 s + 60 s; published in `meta`), the player may use `claim_disconnect_win`.

---

## 8. Records


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

- Each move carries `color` so that the stone color stays unambiguous even when the "Black player" changes through a swap.
- `opening_actions` keeps swap decisions, candidate moves and Swap2 choices (information that common record formats drop).
- Export formats (`format=`): `json` (canonical, MUST); `text` (space-separated Renju notation), `sgf`, `psq` (Piskvork) are MAY.
- In v0.1 records are not signed. An optional signature field may be added later without breaking compatibility.

---

## 9. Ratings


- **A rating is a per-server value** and is not comparable across servers. Apps MUST display it together with the server name.
- The method is self-declared in `meta.rating`. **Glicko-2 is recommended** (initial 1500, RD 350, τ 0.5). Other methods are allowed but must name themselves in `algorithm`.
- Rating axes are basically rule × format (real-time / correspondence). `GET /players/{id}` returns `rating`, `rd`, `games_played` and `provisional` per axis.
- On the same server, users of different apps are matched using that server's ratings.
- Casual games (`rated: false`) do not change ratings.

---

## 10. Errors


Errors use `application/problem+json` (RFC 9457).

```json
{ "type": "https://rgsp.renjuportal.com/errors/stale-move", "title": "Stale move",
  "status": 409, "code": "stale_move", "detail": "expected move 13, got 12" }
```

| `code` | status | Meaning |
|---|---|---|
| `invalid_token` | 401 | Token invalid or expired |
| `forbidden` | 403 | No permission (not a participant / missing scope) |
| `not_found` | 404 | Does not exist (may also be returned for things that should stay hidden) |
| `not_your_turn` | 409 | Not your turn |
| `stale_move` | 409 | `expect_move_number` mismatch |
| `illegal_move` | 422 | Not allowed by the rules |
| `forbidden_point` | 422 | Forbidden point |
| `invalid_action_for_phase` | 422 | Action not valid in the current phase |
| `game_over` | 409 | Game already ended |
| `rate_limited` | 429 | Limit exceeded (`Retry-After`) |
| `unsupported_rule` | 422 | Rule not supported by this server |

`detail` is for humans. **Apps decide by `code`** and display text in their own language.

---

## 11. Authentication, limits and security

### 11.1 What needs an identity and what does not

| Kind | Examples | Identity (token) | How it is limited |
|---|---|---|---|
| Public reads | `meta`, the spectate list, public records, `GET /players/{id}`, `GET /ratings` | **Not required** | CDN caching (e.g. Cloudflare) and **per-IP rate limits** |
| Writes and play | creating games, moves, seeks, accepts, personal events | **Required** (Bearer token) | **Per-token** limits |
| Heavy operations such as solution trees | reading/writing a solution tree (servers that implement it) | **Required** | **Per-token** limits (may be stricter than reads) |

- **Public reads work without an identity** (MUST). Servers SHOULD make responses cache-friendly (`Cache-Control`, `ETag`).
- **No app registration is required** (§4.2). Instead, **a self-identifying `User-Agent` is mandatory** (§4.6) and **limits are per token**. An abusive token can be **revoked individually** (MUST).
- Servers provide a way to revoke a token (e.g. an operator screen) and reject a revoked token with `401` (`invalid_token`). A single bad token can be stopped before any whole app or user is blocked.
- The table above is the minimum. **A server MAY require a token for public reads too** (MAY); if it does, it says so in `meta`.

### 11.2 Limits

- **Limits are at the server's discretion.** Exceeding them gives `429` + `Retry-After` (MUST); `RateLimit-*` headers are SHOULD. Limits are published in `meta.limits`.
- **On `429`, an app MUST wait for `Retry-After` (about 1 minute if absent) before resuming.** Apps SHOULD keep to **one request in flight at a time** by default — the same etiquette as Lichess.
- Limits are counted per IP for public reads and per token for authenticated operations.

### 11.3 Other security

- **CORS:** return `Access-Control-Allow-Origin` appropriately so browser apps can use the API (allow `Authorization`). Tokens are sent as Bearer rather than cookies, so servers are not exposed to CSRF.
- **Prevent token confusion:** a token is accepted only by the server that issued it (`aud` is the server's `api_base`).
- **Server authority:** colors, move numbers and times claimed by the app are ignored.
- **Visibility of spectating/records:** each game has `visibility` (`private` / `unlisted` / `public`). The server MUST check it on every API call.
- **Bots:** a bot MUST identify itself with `kind: "bot"` and be shown to opponents. A server may forbid bots (`features.bots`). Engines run on the app side (or in a bridge); servers are not required to run third-party executables.
- **Personal data:** keep personal data minimal, and operators SHOULD publish their policy on age. Display names, ratings and server affiliation may be visible to other apps and spectators. Servers SHOULD provide per-player hiding and deletion (anonymization). Age verification and parental consent mechanisms are not required by the spec (each operator's responsibility).

---

## 12. Server directory and conformance checks


The **directory** is a list of conformant servers, managed by the protocol's steward (Fukufuku).

- Format: a static `servers.json` (an API may be added if needed).
- Application: an operator registers the URL of their own server. The steward reads `/.well-known/` and keeps a public record of the check in the repository.

The **conformance suite** has three parts.

- **Golden tests:** fixed data of rules-judging inputs and outputs (about 700 positions including forbidden moves, winners, opening symmetry, coordinate/record conversion); checks that `POST /rules/judge` returns the same answers.
- **Protocol tests:** two test players run the real flow: create game → move → receive SSE (order, resume) → resign / timeout / draw → export record → errors (`problem+json`, `code`).
- **Security checks:** reads of private games without auth, moves in someone else's game, authorization without PKCE, and `redirect_uri` mismatches must be rejected.

The operator runs the suite themselves when applying. The steward re-runs it at application time, on spec updates, and once a year. Results are expressed as a conformance level (Core / Play / Lobby) and a suite version.

| State | Meaning |
|---|---|
| `listed` | Application received and listed (before or during conformance check) |
| `conformant` | Passed the suite. The "conformant" mark is shown with level and suite version |
| `suspended` | A problem was found; not shown in the list (operator is notified of the reason) |

> **Note:** the directory and the suite do not exist yet. See §16.

---

## 13. Donations and badges


### 13.1 Donation notice (`support`)

- A server may optionally include a donation notice as `support` (`url`, `message`) in `meta` and `/.well-known/`. The recipient is **that server's operator.**
- **Apps are encouraged (SHOULD) to display the `support` of the server the user chose.** It is not mandatory. Placement and frequency are up to the app (avoid disrupting play).
- `url` is an `https` URL controlled by the operator. An app MUST NOT replace it with another URL without the operator's approval.
- How donations are received and used is up to the operator and is not covered by this spec.

### 13.2 Supporter badge

A server can attach **badges** to players, returned in `badges` of the player info (`PlayerRef`).

```json
{ "id": "p_1", "name": "Alice", "badges": [
  { "id": "supporter", "label": "Supporter", "since": "2026-11-01T00:00:00.000Z" } ] }
```

- The standard ID is **`supporter`** (someone who supported this server's operation). Server-specific badges start with `x.` (e.g. `x.tournament-winner-2026`).
- Deciding who is a supporter, and how badges are granted or removed, is the operator's business and is not defined by the spec.
- Apps SHOULD display badges. For an unknown ID, show `label` if present; otherwise it may be ignored.
- **Badges are display-only.** They MUST NOT affect game permissions, matchmaking, ratings or time handling.
- A badge is valid only within that server and is not carried over to others (accounts are per server).

---

## 14. Versioning


| Rule | Content |
|---|---|
| Major version in the URL | `api_base` ends with `/v1`. The major version is raised only for breaking changes |
| Additive changes do not bump the version | Adding fields, events, actions, rules. **Apps and servers MUST ignore unknown ones** |
| `versions` | `/.well-known/` lists the supported major versions. Apps use the newest common one |
| Support for old majors | After a new major is released, the old major runs for **at least 6 months**, with notice before shutdown (`Deprecation`, `Sunset` headers). A MUST for the reference implementation, a SHOULD for other servers |
| Extensions | Custom fields, events, rules use the `x.` prefix (fields: `x_`). Drop the prefix when standardized |
| During v0.x | **No compatibility is guaranteed while this is a draft.** Changes may land without notice |

**Change process:** anyone can submit proposals (Issue / PR) and discussion is public. The protocol steward (Fukufuku) decides acceptance. Changes ship together with updates to the conformance suite. A move to consensus-based decisions will be considered as operators increase.

**Future extensions** (out of scope for v0.1): tournaments, WebSocket (same message format), shared ID (as a login method), record signing, cross-server games, sharing of reports/bans across servers.

---

## 15. Comparison with other APIs (Lichess)


Lichess (chess) publishes an API so that third-party apps can use it. This section compares against the OpenAPI that Lichess publishes on GitHub (version 2.0.180, fetched 2026-11-17; `lichess-org/api`). The ideas are close, but there are differences.

| | Lichess | RGSP |
|---|---|---|
| Number of servers | One (`https://lichess.org`) | **A specification. Anyone can run a server; apps let users choose** |
| Accounts and ratings | One pool at Lichess | **Per server** |
| Domain | Chess and variants | **Renju / Gomoku (forbidden moves and opening rules are part of the spec)** |
| Streaming | HTTP NDJSON (`application/x-ndjson`). The first line is `gameFull`, then `gameState`, `chatLine`, `opponentGone` | SSE (required). A `game.state` comes first; resume via `Last-Event-ID`. NDJSON is optional on the same URL, chosen by `Accept` (WebSocket later) |
| Authentication | OAuth 2.0 authorization code + PKCE. **No app registration (any client id)**, `S256` only. Access tokens are long-lived (about a year); no refresh tokens. **Personal access tokens** also exist | OAuth 2.0 authorization code + PKCE; no app registration. Tokens are short-lived with refresh tokens. **Personal tokens** may optionally be offered (§4.5) |
| App identification | **`User-Agent` must carry the site URL, app name or a contact email** (so they can contact developers and announce breaking changes) | **Also required** (browser apps use `Origin`) (§4.6) |
| Sending a move | `POST /api/board/game/{id}/move/{move}` (UCI notation; draw offers via `offeringDraw`) | `POST /games/{id}/actions` (JSON coordinates; `expect_move_number` detects conflicts) |
| Board vs Bot | A Board API for humans and a Bot API that allows engines, separated by endpoint and account type | Distinguished by declaring `kind: "bot"` (no separate endpoints) |
| Limits | One request at a time; wait a minute after a `429` | `429` + `Retry-After`; limits published in `meta.limits` |
| Form of the docs | OpenAPI 3.1, plus a demo app and a list of client libraries | OpenAPI 3.1 (no demo or clients yet) |
| Conformance checks | None (a single implementation) | **Conformance suite and a "conformant" mark** |

In short, Lichess is "one service's API", while RGSP is "**a common spec for many services that speak the same API**": an ordinary API spec plus Renju rules (forbidden moves, openings) and the mechanisms for choosing a server (discovery, directory, conformance).

**Adopted from Lichess:** a required `User-Agent` for apps (§4.6) and personal access tokens (§4.5). Publishing a demo app and client libraries is work outside the spec and has not started.

---

## 16. Current status and open items


**Decided**

| Item | Content |
|---|---|
| Name | RGSP (Renju Game Server Protocol) |
| Structure | Federated: anyone can run a server, apps let users choose. Accounts and ratings are per server |
| Transport | REST + SSE (NDJSON optional; WebSocket later) |
| Rules | `renju.free` and `gomoku` are required. Forbidden moves are rejected |
| Clock | No lag compensation |
| Auth | OAuth 2.0 + PKCE; no app registration. Personal tokens are optional. Non-browser apps MUST send a `User-Agent` |
| License | Spec: CC0. Implementations (conformance suite, reference implementation): MIT |
| Change process | Anyone may propose; Fukufuku decides |
| English version | The Japanese version is the source of truth; this English translation sits alongside it |

**Open (does not exist yet / no date set)**

| Item | Current state |
|---|---|
| **Distribution of `renju-core`** | The implementation of forbidden-move detection, winner detection and ratings (TypeScript). The policy is "publish it under MIT together with the reference implementation", but **the timing and repository are undecided.** Until it is published, other operators must implement rules judging themselves |
| **Reference implementation (server)** | **Not started.** Only design direction exists (independent service, dedicated DB) |
| **Directory (server list)** | The steward is Fukufuku and the format is `servers.json`, but **the public URL and the application contact are undecided.** No list exists yet |
| **Conformance suite** | The process is decided (operator self-runs; steward re-runs), but **the suite is not written.** The golden-test fixtures are not written either |
| **Specification repository** | Decided to publish as an independent repository, but **not created.** Whether the spec and the suite share a repository is undecided |
| Load measurements | Not done |

---

## Appendix: OpenAPI


The machine-readable definition is [openapi.yaml](/openapi.yaml) (OpenAPI 3.1): 14 paths and 24 schemas. The YAML syntax and schema references were checked, but it has **not been tried against a real server.**
