---
title: Status and open items
description: RGSP Public API Specification v0.1 (Draft)
---

**Decided**

| Item | Content |
|---|---|
| Name | RGSP (Renju Game Server Protocol) |
| Structure | Federated: anyone can run a server, apps let users choose. Accounts and ratings are per server |
| Transport | REST + SSE (WebSocket later) |
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

