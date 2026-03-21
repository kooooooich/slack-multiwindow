import { NextRequest, NextResponse } from 'next/server';
import {
  getProjectChannels,
  getAllProjectChannels,
  addProjectChannel,
  removeProjectChannel,
} from '@/lib/db';

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId');
  if (projectId) {
    const channels = getProjectChannels(projectId);
    return NextResponse.json(channels);
  }
  // 全プロジェクトチャネル紐付けを返す
  const channels = getAllProjectChannels();
  return NextResponse.json(channels);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, channelId, channelName } = body;
    if (!projectId || !channelId || !channelName) {
      return NextResponse.json({ error: 'projectId, channelId, channelName required' }, { status: 400 });
    }
    const channel = addProjectChannel({ projectId, channelId, channelName });
    return NextResponse.json(channel);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    if (msg.includes('UNIQUE constraint failed')) {
      return NextResponse.json({ error: 'Channel is already assigned to a project' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to add channel' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId');
  const channelId = request.nextUrl.searchParams.get('channelId');
  if (!projectId || !channelId) {
    return NextResponse.json({ error: 'projectId and channelId required' }, { status: 400 });
  }
  const success = removeProjectChannel(projectId, channelId);
  return NextResponse.json({ success });
}
