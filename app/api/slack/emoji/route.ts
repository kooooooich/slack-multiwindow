import { NextRequest, NextResponse } from 'next/server';
import { getWorkspace, getAllWorkspaces } from '@/lib/db';
import { fetchCustomEmojis } from '@/lib/emoji';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');

    let botToken: string | undefined;

    if (workspaceId) {
      const ws = getWorkspace(workspaceId);
      if (!ws) {
        return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
      }
      botToken = ws.botToken;
    } else {
      // workspaceId 未指定の場合は最初のワークスペースを使用
      const workspaces = getAllWorkspaces();
      if (workspaces.length === 0) {
        return NextResponse.json({});
      }
      botToken = workspaces[0].botToken;
    }

    if (!botToken) {
      return NextResponse.json({ error: 'No bot token available' }, { status: 400 });
    }

    const emojis = await fetchCustomEmojis(botToken);
    return NextResponse.json(emojis);
  } catch (error) {
    console.error('Failed to fetch custom emojis:', error);
    return NextResponse.json(
      { error: 'Failed to fetch custom emojis' },
      { status: 500 },
    );
  }
}
