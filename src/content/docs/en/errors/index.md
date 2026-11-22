---
title: Error codes
description: RGSP Public API Specification v0.1 (Draft)
---

Errors are returned as `application/problem+json` (RFC 9457). Apps decide by `code` and display text in their own language.

| `code` | status | Meaning |
|---|---|---|
| [`invalid_token`](./invalid-token/) | 401 | Token invalid or expired |
| [`forbidden`](./forbidden/) | 403 | No permission (not a participant / missing scope) |
| [`not_found`](./not-found/) | 404 | Does not exist (may also be returned for things that should stay hidden) |
| [`not_your_turn`](./not-your-turn/) | 409 | Not your turn |
| [`stale_move`](./stale-move/) | 409 | `expect_move_number` mismatch |
| [`illegal_move`](./illegal-move/) | 422 | Not allowed by the rules |
| [`forbidden_point`](./forbidden-point/) | 422 | Forbidden point |
| [`invalid_action_for_phase`](./invalid-action-for-phase/) | 422 | Action not valid in the current phase |
| [`game_over`](./game-over/) | 409 | Game already ended |
| [`rate_limited`](./rate-limited/) | 429 | Limit exceeded (`Retry-After`) |
| [`unsupported_rule`](./unsupported-rule/) | 422 | Rule not supported by this server |
| [`clock_not_allowed`](./clock-not-allowed/) | 422 | Time setting not accepted by this server |
| [`already_queued`](./already-queued/) | 409 | Already in the matchmaking queue |
