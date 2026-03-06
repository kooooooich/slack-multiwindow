import { NextRequest, NextResponse } from 'next/server';
import { getWorkspace, getAllWorkspaces } from '@/lib/db';
import { listChannels, joinAllChannels } from '@/lib/slack';

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

    const channels = await listChannels(botToken);
    return NextResponse.json(channels);
  } catch (error) {
    console.error('Failed to list channels:', error);
    return NextResponse.json(
      { error: 'Failed to list channels' },
      { status: 500 },
    );
  }
}

// 全パブリックチャンネルに自動参加
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workspaceId } = body;

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

    const result = await joinAllChannels(botToken);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to join channels:', error);
    return NextResponse.json(
      { error: 'Failed to join channels' },
      { status: 500 },
    );
  }
}
