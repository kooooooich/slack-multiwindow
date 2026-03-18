import { NextRequest, NextResponse } from 'next/server';
import { getWorkspace, getTaskByThread, updateTask } from '@/lib/db';
import { postMessage, fetchThreadMessages } from '@/lib/slack';
import { getAllWorkspaces } from '@/lib/db';

/**
 * GET: Slack APIからスレッドメッセージを直接取得（キャッシュなし）
 * DBも同時に更新する
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');
    const channelId = searchParams.get('channelId');
    const threadTs = searchParams.get('threadTs');

    if (!workspaceId || !channelId || !threadTs) {
      return NextResponse.json(
        { error: 'workspaceId, channelId, and threadTs are required' },
        { status: 400 },
      );
    }

    const ws = getWorkspace(workspaceId);
    if (!ws) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Slack APIから直接取得（DBキャッシュを介さない）
    const messages = await fetchThreadMessages(
      ws.botToken,
      channelId,
      threadTs,
      workspaceId,
    );

    // DBも同時に更新（ストアとDBの同期を保つ）
    const task = getTaskByThread(workspaceId, channelId, threadTs);
    if (task) {
      updateTask(task.id, { threadMessages: messages });
    }

    return NextResponse.json(
      { messages },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      },
    );
  } catch (error) {
    console.error('Failed to fetch thread messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch thread messages' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, channelId, text, threadTs } = await req.json();

    if (!channelId || !text) {
      return NextResponse.json(
        { error: 'channelId and text are required' },
        { status: 400 },
      );
    }

    // ワークスペースのトークンを取得
    let botToken = '';
    let userToken = '';
    if (workspaceId) {
      const ws = getWorkspace(workspaceId);
      if (ws) {
        botToken = ws.botToken;
        userToken = ws.userToken || '';
      }
    }
    if (!botToken) {
      const workspaces = getAllWorkspaces();
      if (workspaces.length > 0) {
        botToken = workspaces[0].botToken;
        userToken = workspaces[0].userToken || '';
      }
    }

    if (!botToken) {
      return NextResponse.json(
        { error: 'No workspace configured' },
        { status: 400 },
      );
    }

    // メッセージ送信（userTokenがあればユーザー自身として投稿）
    await postMessage(botToken, channelId, text, threadTs, userToken || undefined);

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
