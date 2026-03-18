# Claude Code Instructions

## Dev Server Startup (重要)

Claude Code はシェル環境に空の `ANTHROPIC_API_KEY` を自動設定します。
Next.js はシェル環境変数を `.env.local` より優先するため、そのまま `pnpm dev` すると AI 機能（返信提案・メモ分析）が動作しません。

**必ず以下のコマンドで起動してください:**

```bash
unset ANTHROPIC_API_KEY ANTHROPIC_BASE_URL && pnpm dev
```

## Package Manager

- **pnpm を使用（npm 禁止）**

## Tech Stack

- Next.js 16 (Turbopack, App Router)
- Slack Web API + Bolt (Socket Mode)
- SQLite (better-sqlite3)
- Anthropic Claude API (@anthropic-ai/sdk)
- pdf-parse / officeparser（ドキュメントテキスト抽出）

## Database

- SQLite ファイル: `./app.db`（環境変数 `DATABASE_PATH` で変更可）
- マイグレーションは `lib/db.ts` の `initTables()` 内で自動実行

### テーブル一覧

| テーブル | 用途 |
|---|---|
| `users` | Google認証ユーザー |
| `workspaces` | Slackワークスペース（Bot/User Token等） |
| `tasks` | メンションベースのタスク（スレッド追跡） |
| `monitored_channels` | 監視対象チャネル |
| `projects` | プロジェクト（名前・概要README） |
| `project_memos` | プロジェクトメモ（Slackメッセージのクリップ等） |
| `project_documents` | プロジェクト添付ドキュメント（ファイルメタ + 抽出テキスト） |

## File Storage

- ドキュメントファイル: `uploads/projects/{projectId}/{uuid}.{ext}`
- `.gitignore` に `uploads/` を追加すること

## Key Architecture

### タスク更新順ソート
- タスクは `last_activity_at` で降順ソート（最新が左上/リスト上位）
- DB側（`getAllTasks` 等）とフロント側（`TaskBoard`, `WindowManager`）の両方でソート
- 新メッセージ受信時に `last_activity_at` が自動更新される

### タスクウィンドウ自動展開
- SSE経路: `useTaskSync.ts` でメッセージ数増加を検知 → `openWindow`
- Polling経路: `store.ts` の `setTasks` でメッセージ数増加 or reopen を検知 → 自動展開

### プロジェクトドキュメント
- API: `POST/GET/PATCH/DELETE /api/projects/documents`
- ダウンロード: `GET /api/projects/documents/download?id=xxx`
- テキスト抽出: `lib/document-extractor.ts`（PDF, DOCX, XLSX, PPTX, MD, TXT等）
- AI分析: ドキュメントの抽出テキストがメモ・READMEと共にコンテキストに含まれる
