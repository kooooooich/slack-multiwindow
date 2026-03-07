import { NextRequest, NextResponse } from 'next/server';
import { getWorkspace, getAllWorkspaces, getTaskByThread, updateTask } from '@/lib/db';
import { getSlackClient, fetchThreadMessages } from '@/lib/slack';

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, channelId, threadTs, messageTs, emojiName, action } = await req.json();

    if (!channelId || !messageTs || !emojiName) {
      return NextResponse.json(
        { error: 'channelId, messageTs, emojiName are required' },
        { status: 400 },
      );
    }

    // botToken / userToken を取得
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

    // userToken があればユーザー自身としてリアクション（Bot でなくユーザーの名前で付く）
    const client = getSlackClient(userToken || botToken);

    // リアクション追加 or 削除
    try {
      if (action === 'remove') {
        await client.reactions.remove({
          channel: channelId,
          timestamp: messageTs,
          name: emojiName,
        });
      } else {
        await client.reactions.add({
          channel: channelId,
          timestamp: messageTs,
          name: emojiName,
        });
      }
    } catch (reactionError: unknown) {
      // already_reacted / no_reaction はエラーとして返さない
      const errMsg = reactionError instanceof Error ? reactionError.message : '';
      if (errMsg.includes('already_reacted') || errMsg.includes('no_reaction')) {
        console.log(`[Reactions] ${errMsg} - ignoring`);
      } else {
        throw reactionError;
      }
    }

    // リアクション後、タスクのスレッドメッセージを再取得して更新
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
        return NextResponse.json({ ok: true, updatedMessages: messages });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to toggle reaction:', error);
    const message = error instanceof Error ? error.message : 'Failed to toggle reaction';
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
