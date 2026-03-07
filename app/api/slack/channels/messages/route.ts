import { NextRequest, NextResponse } from 'next/server';
import { getWorkspace, getAllWorkspaces } from '@/lib/db';
import { fetchChannelMessages } from '@/lib/slack';

/**
 * チャンネルメッセージ取得 API
 * GET: workspaceId, channelId, cursor (ページネーション)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');
    const channelId = searchParams.get('channelId');
    const cursor = searchParams.get('cursor') || undefined;

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

    const result = await fetchChannelMessages(
      botToken,
      channelId,
      workspaceId || '',
      cursor,
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
