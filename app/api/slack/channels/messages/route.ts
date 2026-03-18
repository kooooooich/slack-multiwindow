import { NextRequest, NextResponse } from 'next/server';
import { getWorkspace, getAllWorkspaces } from '@/lib/db';
import { fetchChannelMessages, fetchThreadMessages } from '@/lib/slack';

/**
 * チャンネルメッセージ取得 API
 * GET: workspaceId, channelId, cursor (ページネーション), threadTs (スレッド取得)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');
    const channelId = searchParams.get('channelId');
    const cursor = searchParams.get('cursor') || undefined;
    const threadTs = searchParams.get('threadTs') || undefined;
    const channelName = searchParams.get('channelName') || undefined;

    if (!channelId) {
      return NextResponse.json(
        { error: 'channelId is required' },
        { status: 400 },
      );
    }

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

    // スレッドメッセージ取得
    if (threadTs) {
      const messages = await fetchThreadMessages(
        botToken,
        channelId,
        threadTs,
        workspaceId || '',
      );
      return NextResponse.json({ messages });
    }

    // チャネル履歴取得（チャネル名をフロントから渡してAPI呼出し削減）
    const result = await fetchChannelMessages(
      botToken,
      channelId,
      workspaceId || '',
      cursor,
      20,
      channelName,
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch channel messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch channel messages' },
      { status: 500 },
    );
  }
}
