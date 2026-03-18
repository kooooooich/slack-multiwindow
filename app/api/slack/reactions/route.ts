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

    // リアクション追加 or 削除を実行するヘルパー
    const executeReaction = async (token: string) => {
      const client = getSlackClient(token);
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
    };

    // userToken → botToken フォールバック付きでリアクション実行
    try {
      if (userToken) {
        try {
          await executeReaction(userToken);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : '';
          if (msg.includes('missing_scope') || msg.includes('not_allowed_token_type')) {
            console.log('[Reactions] userToken lacks reactions:write scope, falling back to botToken');
            await executeReaction(botToken);
          } else if (msg.includes('already_reacted') || msg.includes('no_reaction')) {
            console.log(`[Reactions] ${msg} - ignoring`);
          } else {
            throw e;
          }
        }
      } else {
        await executeReaction(botToken);
      }
    } catch (reactionError: unknown) {
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
    if (message.includes('missing_scope')) {
      return NextResponse.json(
        { error: 'Slack App に reactions:write スコープが必要です。OAuth & Permissions で Bot Token Scopes に reactions:write を追加し、アプリを再インストールしてください。' },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
