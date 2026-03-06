import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import {
  getAllWorkspaces,
  getTaskByThread,
  createTask,
  updateTask,
} from '@/lib/db';
import { fetchThreadMessages, resolveUserProfile, getChannelName } from '@/lib/slack';
import type { Task, SlackMessage } from '@/types';

// Slack Events API Webhook 受信（本番 Events API モード用）
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);

    // URL Verification challenge
    if (body.type === 'url_verification') {
      return NextResponse.json({ challenge: body.challenge });
    }

    // Signing Secret 検証
    const signingSecret = process.env.SLACK_SIGNING_SECRET || '';
    const timestamp = req.headers.get('x-slack-request-timestamp') || '';
    const slackSignature = req.headers.get('x-slack-signature') || '';

    if (signingSecret) {
      const sigBasestring = `v0:${timestamp}:${rawBody}`;
      const mySignature = 'v0=' + crypto
        .createHmac('sha256', signingSecret)
        .update(sigBasestring)
        .digest('hex');

      if (!crypto.timingSafeEqual(
        Buffer.from(mySignature),
        Buffer.from(slackSignature),
      )) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    // イベント処理
    if (body.type === 'event_callback') {
      const event = body.event;
      // ワークスペースを特定
      const teamId = body.team_id;
      const workspaces = getAllWorkspaces();
      const ws = workspaces.find((w) => w.teamId === teamId) || workspaces[0];

      if (!ws) {
        console.log('[Events API] No workspace found for team:', teamId);
        return NextResponse.json({ ok: true });
      }

      // 非同期で処理（Slackの3秒タイムアウトを避ける）
      processEventAsync(event, ws.id, ws.botToken).catch(console.error);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Events API] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function processEventAsync(
  event: {
    type: string;
    channel: string;
    thread_ts?: string;
    ts: string;
    user?: string;
    text?: string;
    subtype?: string;
  },
  workspaceId: string,
  botToken: string,
) {
  if (event.type === 'app_mention') {
    await handleMention(event, workspaceId, botToken);
  } else if (event.type === 'message' && event.thread_ts && !event.subtype) {
    await handleThreadReply(event, workspaceId, botToken);
  }
}

async function handleMention(
  event: { channel: string; thread_ts?: string; ts: string; user?: string; text?: string },
  workspaceId: string,
  botToken: string,
) {
  const threadTs = event.thread_ts || event.ts;
  const channelId = event.channel;

  const existing = getTaskByThread(workspaceId, channelId, threadTs);
  if (existing) {
    const messages = await fetchThreadMessages(botToken, channelId, threadTs, workspaceId);
    updateTask(existing.id, { threadMessages: messages });
    return;
  }

  const userProfile = event.user
    ? await resolveUserProfile(botToken, event.user)
    : { displayName: 'unknown', avatarUrl: '' };
  const channelName = await getChannelName(botToken, channelId);
  const threadMessages = await fetchThreadMessages(botToken, channelId, threadTs, workspaceId);

  const triggerMessage: SlackMessage = {
    id: `${channelId}-${event.ts}`,
    workspaceId,
    channelId,
    channelName,
    threadTs,
    ts: event.ts,
    userId: event.user || '',
    userName: userProfile.displayName,
    avatarUrl: userProfile.avatarUrl,
    text: event.text || '',
    isDirectMention: true,
    isThreadParticipant: false,
  };

  const task: Task = {
    id: uuidv4(),
    workspaceId,
    channelId,
    channelName,
    threadTs,
    triggerMessage,
    threadMessages,
    status: 'open',
    createdAt: new Date().toISOString(),
    windowPosition: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
    windowSize: { width: 450, height: 500 },
    isMinimized: false,
    relatedChannels: [],
  };

  createTask(task);
  console.log(`[Events API] New task created: ${task.id}`);
}

async function handleThreadReply(
  event: { channel: string; thread_ts?: string; ts: string; user?: string; text?: string },
  workspaceId: string,
  botToken: string,
) {
  const channelId = event.channel;
  const threadTs = event.thread_ts || '';

  const existing = getTaskByThread(workspaceId, channelId, threadTs);
  if (!existing) return;

  const messages = await fetchThreadMessages(botToken, channelId, threadTs, workspaceId);
  updateTask(existing.id, { threadMessages: messages });
  console.log(`[Events API] Thread reply updated task: ${existing.id}`);
}
