# Slack Multi-Window Task Management

Slackの複数ワークスペースにまたがるメンション・スレッドを、マルチウィンドウ形式で一元管理するWebアプリ。

## 主な機能

### タスク管理
- **グリッドレイアウト**: 複数タスクウィンドウをCSS Gridで自動整列表示（重なりなし）
- **ドラッグ並べ替え**: ウィンドウ間のドラッグ＆ドロップで表示順序を変更
- **リアルタイム更新**: SSE（Server-Sent Events）でスレッド返信を即時反映、ポーリングフォールバック対応
- **タスクステータス管理**: 未完了/完了ステータスの切り替え、完了タスクへの投稿で自動再オープン
- **ウィンドウ状態保持**: 閉じたウィンドウはスレッド更新時も閉じたまま維持

### メッセージ機能
- **スレッド返信**: タスクウィンドウ内から直接スレッド返信
- **自分として返信**: User Tokenを使い、ボットではなく自分の名前で返信
- **ファイル添付**: 画像・ドキュメント等のファイルアップロード対応
- **絵文字投稿**: メッセージ作成時に絵文字ピッカーからテキスト挿入
- **絵文字リアクション**: メッセージへのリアクション表示・追加
- **@メンション補完**: ユーザー名・チャネル名のオートコンプリート
- **Markdown変換**: Slack mrkdwn形式の自動変換（太字、リンク等）

### チャネルビュー
- **チャネル閲覧**: サイドバーからチャネルを選択してメッセージ一覧を表示
- **チャネル投稿**: チャネルへの直接投稿（ファイル添付・絵文字対応）
- **スレッド表示**: メッセージのスレッド返信をサイドパネルで表示
- **スレッドフィルタ**: スレッド返信の表示/非表示切り替え、ソート順変更
- **チャネルキャッシュ**: メッセージのキャッシュによる高速表示

### プロジェクトメモ
- **メモ保存**: タスクウィンドウ・チャネルビュー両方からメッセージをプロジェクトメモに保存
- **プロジェクト管理**: プロジェクトの作成・名前変更・削除
- **メモ編集**: 保存したメモのテキスト・ノートをインライン編集
- **ドキュメント添付**: プロジェクトにファイルをアップロード（最大30MB、PDF/DOCX/XLSX/PPTX/MD/TXT等対応）
- **テキスト抽出**: アップロードされたドキュメントからテキストを自動抽出（AI分析のコンテキストに利用）
- **AI分析**: Claude APIによるメモ・ドキュメントの要約・Q&A機能

### 検索・その他
- **メッセージ検索**: タスク横断のキーワード検索（ステータスフィルタ対応）
- **検索ハイライト**: 検索結果でマッチしたワードをハイライト表示
- **AI返信補助**: Claude APIによる返信候補の自動生成
- **マルチワークスペース**: 複数Slackワークスペースを同時管理
- **全チャンネル自動参加**: ボットを全パブリックチャンネルに一括参加
- **認証**: パスワード認証 / Google OAuth対応

## 技術スタック

- **Frontend**: Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS, Zustand 5
- **Backend**: Next.js API Routes, SQLite (better-sqlite3)
- **Slack連携**: @slack/bolt (Socket Mode / Events API)
- **AI**: Anthropic Claude API
- **ドキュメント処理**: pdf-parse, officeparser（PDF/DOCX/XLSX/PPTX テキスト抽出）
- **リアルタイム通信**: SSE (Server-Sent Events)

## ローカル開発

### 前提条件

- Node.js 18+
- **pnpm**（パッケージマネージャー）
- Slack App（Bot Token, Signing Secret, App Token）

> **⚠️ 重要: pnpm を使用してください**
> セキュリティ上の理由から、本プロジェクトでは `npm` ではなく **`pnpm`** を使用しています。`npm install` は使用しないでください。pnpm は厳格な依存関係管理により、サプライチェーン攻撃のリスクを軽減します。

### セットアップ

```bash
# pnpm がインストールされていない場合
corepack enable pnpm

# 依存関係インストール（※ npm install は使用しないこと）
pnpm install

# 環境変数設定
cp .env.local.example .env.local
# .env.local を編集して各キーを設定

# 開発サーバー起動
pnpm dev
```

`http://localhost:3000` にアクセスしてワークスペースを登録。

### Slack App の設定

1. [Slack API](https://api.slack.com/apps) で新しいアプリを作成

2. **Bot Token Scopes** を追加（OAuth & Permissions → Scopes → Bot Token Scopes）:
   - `app_mentions:read` — メンション検知
   - `channels:history` — チャンネルメッセージ取得
   - `channels:read` — チャンネル一覧取得
   - `channels:join` — 全パブリックチャンネルへの自動参加
   - `chat:write` — ボットとしてメッセージ送信
   - `reactions:read` — リアクション取得
   - `reactions:write` — リアクション追加/削除
   - `files:write` — ファイルアップロード
   - `users:read` — ユーザー情報取得（アバター・表示名）

3. **User Token Scopes** を追加（自分自身として操作する場合）:
   - `chat:write` — 自分の名前でメッセージ送信
   - `files:write` — 自分の名前でファイルアップロード
   - `reactions:write` — 自分の名前でリアクション追加/削除

4. **Event Subscriptions** を有効化:
   - `app_mention`
   - `message.channels`

5. **Socket Mode** を有効化（ローカル開発用）

6. ワークスペースにインストール

7. トークンを取得（OAuth & Permissions ページ）:
   - **Bot User OAuth Token**（`xoxb-...`）→ 環境変数 `SLACK_BOT_TOKEN` に設定
   - **User OAuth Token**（`xoxp-...`）→ ワークスペース設定画面の「User Token」欄に入力

> **💡 User Token について**: User Token を設定すると、アプリからの返信がボットではなく自分自身の名前で送信されます。設定しない場合はボットとして返信します。

> **💡 全チャンネル自動参加**: ワークスペース設定画面の「全チャンネルに参加」ボタンで、ボットを全パブリックチャンネルに一括参加させることができます。チャンネルごとに手動でアプリを追加する必要がなくなります。

## Railway デプロイ

### 1. Railway プロジェクト作成

```bash
# Railway CLI インストール
pnpm add -g @railway/cli

# ログイン
railway login

# プロジェクト作成
railway init
```

### 2. Persistent Volume 設定

Railway ダッシュボードで:
1. サービスの **Settings** > **Volumes** へ
2. **Add Volume** をクリック
3. Mount Path: `/data`
4. Volume を作成

### 3. 環境変数設定

Railway ダッシュボードまたは CLI で以下を設定:

```
SLACK_SIGNING_SECRET=your_signing_secret
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
ANTHROPIC_API_KEY=your_anthropic_api_key
DATABASE_PATH=/data/app.db
APP_PASSWORD=your-team-password
PORT=3000
```

### 4. デプロイ

```bash
# GitHubリポジトリ連携でデプロイ（推奨）
# Railway ダッシュボードでGitHubリポジトリを接続

# または CLI でデプロイ
railway up
```

### 5. Slack Events API 設定（本番）

デプロイ後、Slack App の Event Subscriptions の Request URL を設定:
```
https://your-app.railway.app/api/slack/events
```

## 環境変数一覧

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `SLACK_SIGNING_SECRET` | Yes | Slack Signing Secret |
| `SLACK_BOT_TOKEN` | Yes | Slack Bot Token (xoxb-) |
| `SLACK_APP_TOKEN` | No | Slack App Token (xapp-) Socket Mode用 |
| `ANTHROPIC_API_KEY` | No | Claude API Key（AI補助機能用） |
| `DATABASE_PATH` | No | SQLiteファイルパス（デフォルト: ./app.db） |
| `APP_PASSWORD` | No | チーム認証パスワード（未設定時は認証なし） |
| `PORT` | No | サーバーポート（デフォルト: 3000） |

## ファイルアップロード

- プロジェクトドキュメントは `uploads/projects/{projectId}/` に保存
- アップロード上限: **30MB**（`next.config.ts` の `proxyClientMaxBodySize` で設定）
- 対応形式: PDF, DOCX, XLSX, PPTX, ODT, ODP, ODS, MD, TXT, CSV, JSON
- アップロード時にテキストを自動抽出し、AI分析のコンテキストとして利用

## プロジェクト構成

```
slack-multiwindow/
├── app/
│   ├── api/
│   │   ├── ai/
│   │   │   ├── assist/        # AI返信補助
│   │   │   └── memo/          # AIメモ分析（要約・Q&A）
│   │   ├── auth/
│   │   │   ├── [...nextauth]/ # NextAuth (Google OAuth)
│   │   │   ├── password/      # パスワード認証
│   │   │   └── status/        # 認証状態確認
│   │   ├── channels/
│   │   │   └── monitored/     # 監視チャネル管理
│   │   ├── health/            # ヘルスチェック
│   │   ├── projects/
│   │   │   ├── route.ts       # プロジェクトCRUD
│   │   │   ├── memos/         # プロジェクトメモCRUD
│   │   │   └── documents/     # ドキュメントアップロード・管理（最大30MB）
│   │   ├── slack/
│   │   │   ├── channels/      # チャネル一覧・メンバー・メッセージ取得
│   │   │   ├── debug/         # デバッグ用
│   │   │   ├── emoji/         # カスタム絵文字取得
│   │   │   ├── events/        # Slackイベント受信
│   │   │   ├── files/         # ファイル取得・アップロード
│   │   │   ├── messages/      # メッセージ送信（User Token対応）
│   │   │   ├── reactions/     # リアクション追加
│   │   │   ├── scan/          # 未読メンション一括スキャン
│   │   │   ├── stream/        # SSEストリーム
│   │   │   └── users/         # ユーザー情報取得
│   │   ├── tasks/
│   │   │   ├── route.ts       # タスクCRUD
│   │   │   └── search/        # タスク検索
│   │   └── workspaces/        # ワークスペースCRUD・接続テスト
│   ├── project/
│   │   └── page.tsx           # プロジェクト管理画面（メモ・ドキュメント・AI分析）
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx               # メイン画面（タスク・チャネル）
├── components/
│   ├── AiAssistPanel.tsx      # AI返信補助パネル
│   ├── ChannelSidebar.tsx     # チャネル一覧サイドバー
│   ├── ChannelView.tsx        # チャネルメッセージ表示・投稿
│   ├── ChatWindow.tsx         # タスクウィンドウ（グリッド対応）
│   ├── EmojiPicker.tsx        # 絵文字ピッカー（Portal描画）
│   ├── FileAttachment.tsx     # ファイル添付表示
│   ├── ImageModal.tsx         # 画像拡大モーダル
│   ├── LoginScreen.tsx        # ログイン画面
│   ├── MessageComposer.tsx    # メッセージ入力（絵文字・ファイル・メンション）
│   ├── Providers.tsx          # NextAuth SessionProvider
│   ├── SearchBar.tsx          # メッセージ検索（ハイライト対応）
│   ├── SidebarTabs.tsx        # タスク/チャネル切り替えタブ
│   ├── SlackMessageText.tsx   # Slack mrkdwnリッチテキスト表示
│   ├── TaskBoard.tsx          # タスク一覧サイドバー
│   ├── WindowManager.tsx      # グリッドレイアウト・ドラッグ並べ替え
│   └── WorkspaceSetup.tsx     # ワークスペース初期設定
├── lib/
│   ├── anthropic.ts           # Claude API クライアント
│   ├── auth.ts                # NextAuth設定
│   ├── bolt-server.ts         # Slack Bolt サーバー
│   ├── db.ts                  # SQLiteデータベース操作
│   ├── document-extractor.ts  # ドキュメントテキスト抽出（PDF/Office/テキスト）
│   ├── emoji.ts               # 絵文字ユーティリティ
│   ├── mrkdwn.ts              # Slack mrkdwn パーサー・絵文字マッピング
│   ├── slack.ts               # Slack APIユーティリティ
│   ├── store.ts               # Zustand状態管理（タスク・ウィンドウ・グリッド順序）
│   └── unread-scan.ts         # 未読メンションスキャン
├── types/
│   └── index.ts               # 型定義
├── middleware.ts               # 認証ミドルウェア
├── server.js                   # カスタムサーバー（Bolt統合）
├── railway.toml                # Railwayデプロイ設定
└── README.md
```
