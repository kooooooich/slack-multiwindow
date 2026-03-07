import { NextRequest, NextResponse } from 'next/server';
import { getWorkspace, getAllWorkspaces } from '@/lib/db';
import { getSlackClient } from '@/lib/slack';

/**
 * ワークスペースのユーザー一覧を取得
 * GET: workspaceId で指定
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');

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

    const client = getSlackClient(botToken);

    // ユーザー一覧を取得（ページネーション対応）
    const users: { id: string; name: string; realName: string; avatarUrl: string }[] = [];
    let cursor: string | undefined;

    do {
      const result = await client.users.list({
        limit: 200,
        ...(cursor ? { cursor } : {}),
      });

      for (const member of result.members || []) {
        const m = member as {
          id: string;
          name: string;
          real_name?: string;
          deleted?: boolean;
          is_bot?: boolean;
          profile?: { image_48?: string; display_name?: string; real_name?: string };
        };
        // 削除済み・ボット・Slackbot は除外
        if (m.deleted || m.is_bot || m.id === 'USLACKBOT') continue;

        users.push({
          id: m.id,
          name: m.name,
          realName: m.profile?.display_name || m.profile?.real_name || m.real_name || m.name,
          avatarUrl: m.profile?.image_48 || '',
        });
      }

      cursor = result.response_metadata?.next_cursor || undefined;
    } while (cursor);

    return NextResponse.json(users);
  } catch (error) {
    console.error('Failed to list users:', error);
    return NextResponse.json(
      { error: 'Failed to list users' },
      { status: 500 },
    );
  }
}
