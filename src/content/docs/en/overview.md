---
title: Overview
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


## 2. Design principles
1. **Server authority.** Move legality, clocks and game end are decided by the server only. Apps send an *intent*; the server returns the result.
2. **Commands and events are separate.** Operations are HTTP POSTs (commands); changes are received via SSE (events).
3. **Events are totally ordered and resumable.** Each game has a sequence number (`seq`); a dropped connection resumes where it left off.
4. **The move log is the truth.** Board, turn and clock can be derived from it.
5. **Evolve additively.** Unknown fields, events and actions are ignored (§14).
6. **Servers self-declare and are verified.** Features are declared at `/.well-known/` and checked by the conformance suite (§12).
7. **Apps may connect to untrusted servers.** Tokens are kept per server (§4).

