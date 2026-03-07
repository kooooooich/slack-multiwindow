import { NextRequest, NextResponse } from 'next/server';
import {
  getWorkspace,
  getAllWorkspaces,
  getWorkspacesByUserId,
  getAllTasks,
  getTasksByUserId,
  createTask,
  updateWorkspaceScanTime,
} from '@/lib/db';
import { scanUnreadMentions } from '@/lib/unread-scan';
import { fetchThreadMessages } from '@/lib/slack';
import { auth, getAuthMode } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import type { Task } from '@/types';

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

    // 対象ワークスペースを決定
    let workspaces;
    if (workspaceId) {
      const ws = getWorkspace(workspaceId);
      if (!ws) {
        return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
      }
      workspaces = [ws];
    } else {
      // ユーザースコープ
      if (getAuthMode() === 'google') {
        const session = await auth();
        const userId = (session as unknown as Record<string, unknown>)?.userId as string | null;
        workspaces = userId ? getWorkspacesByUserId(userId) : getAllWorkspaces();
      } else {
        workspaces = getAllWorkspaces();
      }
    }

    // 既存タスクの thread_ts を取得（重複防止用）
    let existingTasks: Task[];
    if (getAuthMode() === 'google') {
      const session = await auth();
      const userId = (session as unknown as Record<string, unknown>)?.userId as string | null;
      existingTasks = userId ? getTasksByUserId(userId) : getAllTasks();
    } else {
      existingTasks = getAllTasks();
    }

    const existingThreadTs = new Set(
      existingTasks.map((t) => t.threadTs),
    );

    const results = {
      totalFound: 0,
      totalCreated: 0,
      byWorkspace: [] as { workspaceId: string; name: string; found: number; created: number }[],
    };

    const now = new Date().toISOString();

    for (const ws of workspaces) {
      if (!ws.targetUserId || !ws.isActive) continue;

      const scanResult = await scanUnreadMentions(ws, existingThreadTs);

      let created = 0;

      for (const msg of scanResult.messages) {
        // スレッドメッセージを取得
        let threadMessages;
        try {
          threadMessages = await fetchThreadMessages(
            ws.botToken,
            msg.channelId,
            msg.threadTs || msg.ts,
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
          threadTs: msg.threadTs || msg.ts,
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
          relatedChannels: [],
        };

        createTask(task);
        created++;
      }

      // スキャン時刻を更新
      updateWorkspaceScanTime(ws.id, now);

      results.totalFound += scanResult.foundMentions;
      results.totalCreated += created;
      results.byWorkspace.push({
        workspaceId: ws.id,
        name: ws.name,
        found: scanResult.foundMentions,
        created,
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
