import { NextRequest, NextResponse } from 'next/server';
import { getWorkspace, getTaskByThread, updateTask } from '@/lib/db';
import { postMessage, fetchThreadMessages } from '@/lib/slack';
import { getAllWorkspaces } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, channelId, text, threadTs } = await req.json();

    if (!channelId || !text) {
      return NextResponse.json(
        { error: 'channelId and text are required' },
        { status: 400 },
      );
    }

    // ワークスペースのbotTokenを取得
    let botToken = '';
    if (workspaceId) {
      const ws = getWorkspace(workspaceId);
      if (ws) botToken = ws.botToken;
    }
    if (!botToken) {
      const workspaces = getAllWorkspaces();
      if (workspaces.length > 0) botToken = workspaces[0].botToken;
    }

    if (!botToken) {
      return NextResponse.json(
        { error: 'No workspace configured' },
        { status: 400 },
      );
    }

    // メッセージ送信
    await postMessage(botToken, channelId, text, threadTs);

    // タスクのスレッドメッセージを更新
    if (threadTs && workspaceId) {
      const task = getTaskByThread(workspaceId, channelId, threadTs);
      if (task) {
        const messages = await fetchThreadMessages(
          botToken,
          channelId,
          threadTs,
          workspaceId,
        );
        updateTask(task.id, { threadMessages: messages });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to send message:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 },
    );
  }
}
