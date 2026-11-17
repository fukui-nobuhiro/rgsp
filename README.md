# RGSP — 連珠対局サーバープロトコル（Renju Game Server Protocol）

連珠・五目並べの対局サーバーの共通仕様（ドラフト v0.1）と、その仕様書サイトのソース。**公開中: https://rgsp.renjuportal.com**

サイトは Astro Starlight（日英）＋ Redoc（API リファレンス。`redoc` の単体版をそのまま配る）で作っている。日本語が正で、英語は翻訳。

## 使い方
```bash
npm install
npm run dev      # 開発サーバー
npm run build    # Redoc の単体版を public/reference/ に置き、dist/ に静的ファイルを出す
npm run deploy   # Cloudflare Workers（静的アセット）へ公開（Worker 名 rgsp-site、ドメイン rgsp.renjuportal.com）。wrangler のログインが要る
```

`main` への push で、Cloudflare Workers Builds が自動でビルドして公開する（`npm run build` → `npx wrangler deploy`）。手元から出すときだけ `npm run deploy` を使う。

## 構成
| 場所 | 内容 |
|---|---|
| `src/content/docs/` | 日本語（正）。`en/` に英語の翻訳 |
| `src/content/docs/spec.md` | 仕様書の全文（`rgsp-public-spec.md` から作った） |
| `src/content/docs/errors/` | エラーコード 1 件 1 ページ（`type` の URI `https://rgsp.renjuportal.com/errors/<code>` の行き先） |
| `public/openapi.yaml` | OpenAPI |
| `public/reference/index.html` | API リファレンス（Redoc。グレースケールの配色・Noto Sans JP） |
| `public/servers.json` | サーバー一覧（いまは空） |
| `wrangler.jsonc` | Workers の静的アセット配信の設定 |

## まだないもの
- 仕様書の節ごとのページ分割（いまは全文が 1 ページ）
- エラーコードの詳しい説明（いまは意味の 1 行だけ）
- 日英の文章の同期の仕組み（日本語が正）
- `servers.json` の形の確定（ディレクトリの公開までに決める）

## ライセンス
- 仕様書・OpenAPI・サーバー一覧（`src/content/docs/`、`public/openapi.yaml`、`public/servers.json`）: **CC0 1.0**（[LICENSE-CC0](./LICENSE-CC0)）
- それ以外（サイトのコード・設定、将来の適合性テストと参照実装）: **MIT**（[LICENSE](./LICENSE)）

## 変更の提案
Issue / PR は誰でも出せる。議論は公開で、採否はプロトコルの管理者（ふくふく）が決める。変更は、適合性テストの更新とセットで出す。
