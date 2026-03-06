# Slack Multi-Window Task Management

Slackの複数ワークスペースにまたがるメンション・スレッドを、マルチウィンドウ形式で一元管理するWebアプリ。

## 主な機能

- **マルチウィンドウUI**: ドラッグ＆ドロップ、リサイズ可能なチャットウィンドウ
- **リアルタイム更新**: SSE（Server-Sent Events）+ ポーリングフォールバック
- **AI返信補助**: Claude APIによる返信候補の自動生成
- **関連チャネル投稿**: スレッド返信と同時に別チャネルへクロス投稿
- **マルチワークスペース**: 複数Slackワークスペースを同時管理
- **タスク管理**: 未完了/完了ステータス管理

## 技術スタック

- **Frontend**: Next.js (App Router), React, Tailwind CSS, Zustand
- **Backend**: Next.js API Routes, SQLite (better-sqlite3)
- **Slack連携**: @slack/bolt (Socket Mode / Events API)
- **AI**: Anthropic Claude API

## ローカル開発

### 前提条件

- Node.js 18+
- Slack App（Bot Token, Signing Secret, App Token）

### セットアップ

```bash
# 依存関係インストール
npm install

# 環境変数設定
cp .env.local.example .env.local
# .env.local を編集して各キーを設定

# 開発サーバー起動
npm run dev
```

`http://localhost:3000` にアクセスしてワークスペースを登録。

### Slack App の設定

1. [Slack API](https://api.slack.com/apps) で新しいアプリを作成
2. **Bot Token Scopes** を追加:
   - `app_mentions:read`
   - `channels:history`
   - `channels:read`
   - `chat:write`
   - `users:read`
3. **Event Subscriptions** を有効化:
   - `app_mention`
   - `message.channels`
4. **Socket Mode** を有効化（ローカル開発用）
5. ワークスペースにインストール

## Railway デプロイ

### 1. Railway プロジェクト作成

```bash
# Railway CLI インストール
npm install -g @railway/cli

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

## プロジェクト構成

```
slack-multiwindow/
├── app/
│   ├── api/
│   │   ├── auth/          # 認証API
│   │   ├── health/        # ヘルスチェック
│   │   ├── ai/assist/     # AI返信補助
│   │   ├── slack/
│   │   │   ├── channels/  # チャネル一覧
│   │   │   ├── events/    # Slackイベント受信
│   │   │   ├── messages/  # メッセージ送信
│   │   │   └── stream/    # SSEストリーム
│   │   ├── tasks/         # タスクCRUD
│   │   └── workspaces/    # ワークスペースCRUD
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── AiAssistPanel.tsx
│   ├── ChatWindow.tsx
│   ├── LoginScreen.tsx
│   ├── MessageComposer.tsx
│   ├── TaskBoard.tsx
│   ├── WindowManager.tsx
│   └── WorkspaceSetup.tsx
├── lib/
│   ├── anthropic.ts
│   ├── bolt-server.ts
│   ├── db.ts
│   ├── slack.ts
│   └── store.ts
├── types/
│   └── index.ts
├── middleware.ts
├── server.js
├── railway.toml
└── README.md
```
