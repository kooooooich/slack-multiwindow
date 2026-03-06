import { NextRequest, NextResponse } from 'next/server';
import { getWorkspace } from '@/lib/db';
import { WebClient } from '@slack/web-api';

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await req.json();
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    const ws = getWorkspace(workspaceId);
    if (!ws) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const client = new WebClient(ws.botToken);
    const result = await client.auth.test();

    return NextResponse.json({
      ok: true,
      team: result.team,
      user: result.user,
      teamId: result.team_id,
    });
  } catch (error) {
    console.error('Connection test failed:', error);
    return NextResponse.json({ ok: false, error: 'Connection test failed' }, { status: 400 });
  }
}
