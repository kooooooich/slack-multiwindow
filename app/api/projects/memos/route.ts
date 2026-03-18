import { NextRequest, NextResponse } from 'next/server';
import { getMemosByProject, createMemo, deleteMemo, updateMemo, getWorkspace } from '@/lib/db';
import { getSlackClient } from '@/lib/slack';

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }
  const memos = getMemosByProject(projectId);
  return NextResponse.json(memos);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, taskId, messageTs, messageUser, messageText, note, channelId, workspaceId } = body;
    if (!projectId || !messageText) {
      return NextResponse.json({ error: 'projectId, messageText required' }, { status: 400 });
    }

    // Slackパーマリンクを取得
    let messageUrl: string | undefined;
    if (channelId && workspaceId && messageTs) {
      try {
        const workspace = getWorkspace(workspaceId);
        if (workspace?.botToken) {
          const client = getSlackClient(workspace.botToken);
          const result = await client.chat.getPermalink({
            channel: channelId,
            message_ts: messageTs,
          });
          messageUrl = result.permalink || undefined;
        }
      } catch (e) {
        console.error('[Memo] Failed to get permalink:', e);
      }
    }

    const memo = createMemo({ projectId, taskId, messageTs, messageUser, messageText, messageUrl, note });
    return NextResponse.json(memo);
  } catch {
    return NextResponse.json({ error: 'Failed to create memo' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, messageText, note } = body;
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }
    const memo = updateMemo(id, { messageText, note });
    if (!memo) {
      return NextResponse.json({ error: 'Memo not found' }, { status: 404 });
    }
    return NextResponse.json(memo);
  } catch {
    return NextResponse.json({ error: 'Failed to update memo' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }
  const success = deleteMemo(id);
  return NextResponse.json({ success });
}
