import { NextRequest, NextResponse } from 'next/server';
import { getAllWorkspaces, getWorkspacesByUserId, createWorkspace, deleteWorkspace } from '@/lib/db';
import { auth, getAuthMode } from '@/lib/auth';
import { WebClient } from '@slack/web-api';
import { v4 as uuidv4 } from 'uuid';

async function getSessionUserId(): Promise<string | null> {
  if (getAuthMode() !== 'google') return null;
  const session = await auth();
  return (session as unknown as Record<string, unknown>)?.userId as string | null;
}

export async function GET() {
  try {
    const userId = await getSessionUserId();
    const workspaces = userId ? getWorkspacesByUserId(userId) : getAllWorkspaces();
    // トークンを隠してレスポンス
    const safe = workspaces.map((ws) => ({
      ...ws,
      botToken: ws.botToken ? '***' + ws.botToken.slice(-6) : '',
      signingSecret: '***',
      appToken: ws.appToken ? '***' + ws.appToken.slice(-6) : undefined,
      userToken: ws.userToken ? '***' + ws.userToken.slice(-6) : undefined,
    }));
    return NextResponse.json(safe);
  } catch (error) {
    console.error('Failed to get workspaces:', error);
    return NextResponse.json({ error: 'Failed to get workspaces' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, botToken, signingSecret, appToken, userToken, targetUserId } = body;

    if (!name || !botToken || !signingSecret) {
      return NextResponse.json(
        { error: 'name, botToken, signingSecret are required' },
        { status: 400 }
      );
    }

    // Slack auth.test でトークン検証
    const client = new WebClient(botToken);
    let teamId = '';
    try {
      const authResult = await client.auth.test();
      teamId = (authResult.team_id as string) || '';
    } catch {
      return NextResponse.json(
        { error: 'Invalid bot token. auth.test failed.' },
        { status: 400 }
      );
    }

    const userId = await getSessionUserId();

    const workspace = createWorkspace({
      id: uuidv4(),
      name,
      botToken,
      signingSecret,
      appToken: appToken || undefined,
      userToken: userToken || undefined,
      targetUserId: targetUserId || undefined,
      userId: userId || undefined,
      teamId,
      addedAt: new Date().toISOString(),
      isActive: true,
    });

    return NextResponse.json({
      ...workspace,
      botToken: '***' + workspace.botToken.slice(-6),
      signingSecret: '***',
      appToken: workspace.appToken ? '***' + workspace.appToken.slice(-6) : undefined,
      userToken: workspace.userToken ? '***' + workspace.userToken.slice(-6) : undefined,
    });
  } catch (error) {
    console.error('Failed to create workspace:', error);
    return NextResponse.json({ error: 'Failed to create workspace' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    const deleted = deleteWorkspace(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete workspace:', error);
    return NextResponse.json({ error: 'Failed to delete workspace' }, { status: 500 });
  }
}
