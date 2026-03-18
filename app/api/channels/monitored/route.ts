import { NextRequest, NextResponse } from 'next/server';
import { getMonitoredChannels, addMonitoredChannel, removeMonitoredChannel } from '@/lib/db';

export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }
  const channels = getMonitoredChannels(workspaceId);
  return NextResponse.json(channels);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workspaceId, channelId, channelName, channelType } = body;
    if (!workspaceId || !channelId || !channelName) {
      return NextResponse.json({ error: 'workspaceId, channelId, channelName required' }, { status: 400 });
    }
    const channel = addMonitoredChannel({ workspaceId, channelId, channelName, channelType });
    return NextResponse.json(channel);
  } catch {
    return NextResponse.json({ error: 'Failed to add channel' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  const channelId = request.nextUrl.searchParams.get('channelId');
  if (!workspaceId || !channelId) {
    return NextResponse.json({ error: 'workspaceId, channelId required' }, { status: 400 });
  }
  const success = removeMonitoredChannel(workspaceId, channelId);
  return NextResponse.json({ success });
}
