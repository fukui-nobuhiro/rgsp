---
title: エラーコード
description: RGSP 公開用 API 仕様書 v0.1（ドラフト）
---

エラーは `application/problem+json`（RFC 9457）で返ります。アプリは `code` で判断し、自分の言語で表示します。

| `code` | status | 意味 |
|---|---|---|
| [`invalid_token`](./invalid-token/) | 401 | トークンが不正・期限切れ |
| [`forbidden`](./forbidden/) | 403 | 権限がない（参加者でない・scope が足りない） |
| [`not_found`](./not-found/) | 404 | 存在しない（見せたくないものも同じ応答にしてよい） |
| [`not_your_turn`](./not-your-turn/) | 409 | 自分の手番でない |
| [`stale_move`](./stale-move/) | 409 | `expect_move_number` が合わない |
| [`illegal_move`](./illegal-move/) | 422 | 規則上打てない |
| [`forbidden_point`](./forbidden-point/) | 422 | 禁手の点 |
| [`invalid_action_for_phase`](./invalid-action-for-phase/) | 422 | いまのフェーズで無効なアクション |
| [`game_over`](./game-over/) | 409 | 終局済み |
| [`rate_limited`](./rate-limited/) | 429 | 制限超過（`Retry-After`） |
| [`unsupported_rule`](./unsupported-rule/) | 422 | このサーバーが対応しない規則 |
| [`clock_not_allowed`](./clock-not-allowed/) | 422 | このサーバーが受け付けない時間設定 |
| [`already_queued`](./already-queued/) | 409 | すでにマッチングの待ち行列にいる |
