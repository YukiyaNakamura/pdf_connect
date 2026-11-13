# PDF結合・URL短縮

画面上部のタブで「PDF結合」と「URL短縮」を切り替えられるWebアプリです（初期表示は「PDF結合」）。

## 機能

### PDF結合（ブラウザ内だけで処理し、ファイルは送信しません）

- **PDFを追加** — ドラッグ＆ドロップ、またはファイル選択（複数可）
- **順番を変更** — 各ファイルの ↑ / ↓ ボタン（スマホ対応）、✕ で削除
- **結合してダウンロード** — ファイル名を指定して保存（`.pdf` は自動付与、使えない文字は `_` に置換）
- **エラー表示** — パスワード付き・破損・PDF以外のファイルは一覧上で赤く表示し、理由を表示

### URL短縮

- 任意の http / https URL から短縮リンク（`/s/xxxxxxx`）を作成
- 短縮リンクを開くと、検索条件（`?`以降）・ページ内の位置（`#`以降）を含めて元のURLへ 302 リダイレクト
- 同じURLには同じ短縮リンクを返す
- 無効なURL、自分の短縮リンクの再短縮、通信失敗などは分かりやすいエラーを表示
- 1つのIPアドレスから1分あたり30件まで（乱用対策）

## 使い方

Node.js 22.13 以上が必要です（内蔵の SQLite を使うため）。

```sh
npm install
npm run dev      # 開発サーバー（URL短縮APIも組み込み済み）
npm test         # テスト
npm run build    # dist/ にビルド
npm start        # 本番用サーバー（dist/ の配信 + URL短縮）
```

### 本番用サーバーの環境変数

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `PORT` | `3000` | 待ち受けポート |
| `DB_PATH` | `data/links.db` | 短縮リンクを保存するSQLiteファイル |
| `PUBLIC_BASE_URL` | （リクエストのホスト） | 短縮リンクのドメイン。例 `https://example.com` |

URL短縮にはサーバーが必要なため、GitHub Pages などの静的ホスティングでは動きません。
Render・Railway・Fly.io など Node.js が動き、`DB_PATH` を永続ディスクに置ける環境に配置してください。

## 構成

- `src/pdf.js` — PDFの検証・結合・ファイル名処理（[pdf-lib](https://pdf-lib.js.org/) を使用）
- `src/main.js` — PDF結合画面
- `src/tabs.js` — タブ切り替え
- `src/shorten.js` — URL短縮画面
- `src/url.js` — URLの検証（画面とサーバーで共通）
- `server/app.js` — URL短縮API・リダイレクト
- `server/index.js` — 本番用サーバー
- `vite.config.js` — 開発サーバーにURL短縮APIを組み込む設定
- `test/` — テスト
