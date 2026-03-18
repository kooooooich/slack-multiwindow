import { NextRequest, NextResponse } from 'next/server';
import { getWorkspace, getAllWorkspaces } from '@/lib/db';
import { fetchChannelMembers } from '@/lib/slack';

/**
 * チャネルメンバー一覧を取得（シェアードチャネルの外部メンバー含む）
 * GET: workspaceId & channelId で指定
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');
    const channelId = searchParams.get('channelId');

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
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
      return NextResponse.json({ error: 'No workspace configured' }, { status: 400 });
    }

    const members = await fetchChannelMembers(botToken, channelId);
    return NextResponse.json(members);
  } catch (error) {
    console.error('Failed to list channel members:', error);
    return NextResponse.json(
      { error: 'Failed to list channel members' },
      { status: 500 },
    );
  }
}
