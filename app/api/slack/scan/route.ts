import { NextRequest, NextResponse } from 'next/server';
import {
  getWorkspace,
  getWorkspacesByUserId,
  getTasksByUserId,
  getTaskByThread,
  createTask,
  updateTask as updateTaskInDb,
  updateWorkspaceScanTime,
} from '@/lib/db';
import { scanUnreadMentions, scanDMs } from '@/lib/unread-scan';
import { fetchThreadMessages } from '@/lib/slack';
import { notifyListeners } from '@/lib/bolt-server';
import { getSessionUserId } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import type { Task } from '@/types';

export const runtime = 'nodejs';

/**
 * 未読メンションスキャン API
 *
 * POST: ワークスペースの未読メンションをスキャンし、タスクとして登録
 *   - workspaceId: 省略時は全ワークスペースをスキャン
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { workspaceId } = body as { workspaceId?: string };

    // ユーザーID取得
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 対象ワークスペースを決定
    let workspaces;
    if (workspaceId) {
      const ws = getWorkspace(workspaceId);
      if (!ws) {
        return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
      }
      workspaces = [ws];
    } else {
      workspaces = getWorkspacesByUserId(userId);
    }

    // 既存タスクの thread_ts を取得（重複防止用）
    const existingTasks: Task[] = getTasksByUserId(userId);

    const existingThreadTs = new Set(
      existingTasks.map((t) => t.threadTs),
    );

    const results = {
      totalFound: 0,
      totalCreated: 0,
      totalRefreshed: 0,
      byWorkspace: [] as { workspaceId: string; name: string; found: number; created: number; refreshed: number }[],
    };

    const now = new Date().toISOString();

    for (const ws of workspaces) {
      if (!ws.targetUserId || !ws.isActive) continue;

      // 1. チャンネルのメンションスキャン
      const scanResult = await scanUnreadMentions(ws, existingThreadTs);

      // 2. DM スキャン
      const dmResult = await scanDMs(ws, existingThreadTs);

      // 3. 既存タスクのスレッド更新チェック（DM・チャネル問わず）
      //    オフライン中のメッセージ追加・編集・リアクション変更等をキャッチ
      const wsTasks = existingTasks.filter((t) => t.workspaceId === ws.id && t.status === 'open');
      let refreshed = 0;
      for (const task of wsTasks) {
        try {
          const latestMessages = await fetchThreadMessages(
            ws.botToken,
            task.channelId,
            task.threadTs,
            ws.id,
          );
          // メッセージ数の変化だけでなく、最終メッセージのtsも比較
          // 編集・リアクション変更等も検出するために常に最新データで更新
          const oldLen = task.threadMessages?.length ?? 0;
          const newLen = latestMessages.length;
          const oldLastTs = task.threadMessages?.[task.threadMessages.length - 1]?.ts || '';
          const newLastTs = latestMessages[latestMessages.length - 1]?.ts || '';
          if (newLen !== oldLen || oldLastTs !== newLastTs || newLen > 0) {
            updateTaskInDb(task.id, { threadMessages: latestMessages });
            notifyListeners('task_updated', { taskId: task.id, threadRefreshed: true });
            refreshed++;
            console.log(`[Scan] Refreshed existing task thread: ${task.id} (${oldLen} → ${newLen} messages)`);
          }
        } catch {
          // スレッド取得失敗は無視
        }
      }

      // 両方の結果を統合
      const allMessages = [...scanResult.messages, ...dmResult.messages];

      let created = 0;

      for (const msg of allMessages) {
        const threadTs = msg.threadTs || msg.ts;

        // Bolt等で既にタスクが作成されている場合はスキップ（レースコンディション防止）
        const existingTask = getTaskByThread(ws.id, msg.channelId, threadTs);
        if (existingTask) {
          console.log(`[Scan] Task already exists for thread ${threadTs} in ${msg.channelId}, skipping`);
          continue;
        }

        // スレッドメッセージを取得
        let threadMessages;
        try {
          threadMessages = await fetchThreadMessages(
            ws.botToken,
            msg.channelId,
            threadTs,
            ws.id,
          );
        } catch {
          threadMessages = [msg];
        }

        // タスクを作成
        const task: Task = {
          id: uuidv4(),
          workspaceId: ws.id,
          channelId: msg.channelId,
          channelName: msg.channelName,
          threadTs,
          triggerMessage: msg,
          threadMessages,
          status: 'open',
          createdAt: now,
          windowPosition: {
            x: 100 + Math.random() * 200,
            y: 100 + Math.random() * 200,
          },
          windowSize: { width: 420, height: 500 },
          isMinimized: true, // スキャンで作成したタスクは最小化状態
          lastActivityAt: now,
          relatedChannels: [],
        };

        createTask(task);
        created++;
      }

      // スキャン時刻を更新
      updateWorkspaceScanTime(ws.id, now);

      const totalFound = scanResult.foundMentions + dmResult.foundMentions;
      results.totalFound += totalFound;
      results.totalCreated += created;
      results.totalRefreshed += refreshed;
      results.byWorkspace.push({
        workspaceId: ws.id,
        name: ws.name,
        found: totalFound,
        created,
        refreshed,
      });
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error('Failed to scan unread mentions:', error);
    return NextResponse.json(
      { error: 'Failed to scan unread mentions' },
      { status: 500 },
    );
  }
}
