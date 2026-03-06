import { App, LogLevel } from '@slack/bolt';
import { v4 as uuidv4 } from 'uuid';
import {
  getAllWorkspaces,
  getTaskByThread,
  createTask,
  updateTask,
} from './db';
import { fetchThreadMessages, resolveUserProfile, getChannelName } from './slack';
import type { Task, SlackMessage } from '@/types';

// SSE用のイベントバス（Step 10で利用）
type EventListener = (event: { type: string; data: unknown }) => void;
const listeners: Set<EventListener> = new Set();

export function addSSEListener(listener: EventListener) {
  listeners.add(listener);
}

export function removeSSEListener(listener: EventListener) {
  listeners.delete(listener);
}

function notifyListeners(type: string, data: unknown) {
  for (const listener of listeners) {
    listener({ type, data });
  }
}

let boltApp: App | null = null;

// Bolt が実際に起動したかどうか（外部から参照可能）
export function isBoltRunning(): boolean {
  return boltApp !== null;
}

export async function startSlackBolt(): Promise<boolean> {
  // 既に起動済みの場合はスキップ
  if (boltApp) {
    console.log('[Bolt] Already running. Skipping.');
    return true;
  }

  const workspaces = getAllWorkspaces();

  if (workspaces.length === 0) {
    console.log('[Bolt] No workspaces configured. Skipping Slack Bolt startup.');
    return false;
  }

  // 最初のワークスペースの設定を使用（マルチワークスペースは将来対応）
  const ws = workspaces[0];
  const useSocketMode = !!ws.appToken || !!process.env.SLACK_APP_TOKEN;

  const appToken = ws.appToken || process.env.SLACK_APP_TOKEN;
  const botToken = ws.botToken || process.env.SLACK_BOT_TOKEN;
  const signingSecret = ws.signingSecret || process.env.SLACK_SIGNING_SECRET;
  const targetUserId = ws.targetUserId || process.env.SLACK_TARGET_USER_ID;

  if (!botToken || !signingSecret) {
    console.log('[Bolt] Missing bot token or signing secret. Skipping.');
    return false;
  }

  if (!targetUserId) {
    console.log('[Bolt] No target user ID configured. Mention detection disabled.');
    console.log('[Bolt] Set targetUserId in workspace settings or SLACK_TARGET_USER_ID env var.');
  } else {
    console.log(`[Bolt] Monitoring mentions for user: ${targetUserId}`);
  }

  const appConfig: ConstructorParameters<typeof App>[0] = {
    token: botToken,
    signingSecret,
    logLevel: LogLevel.INFO,
  };

  if (useSocketMode && appToken) {
    appConfig.socketMode = true;
    appConfig.appToken = appToken;
    console.log('[Bolt] Starting in Socket Mode...');
  } else {
    console.log('[Bolt] Starting in Events API mode...');
    console.log('[Bolt] Events will be received via /api/slack/events');
  }

  boltApp = new App(appConfig);

  // --- Event Handlers ---

  // message イベント: ユーザーへのメンション検知 + スレッド返信追跡
  boltApp.event('message', async ({ event, context }) => {
    const msg = event as {
      thread_ts?: string;
      subtype?: string;
      channel?: string;
      user?: string;
      text?: string;
      ts?: string;
    };

    // subtype ありは無視（bot_message, channel_join など）
    if (msg.subtype) return;

    const text = msg.text || '';
    const channelId = msg.channel || '';
    const ts = msg.ts || '';

    // 1. ユーザーメンションの検知（新規タスク or 既存タスク更新）
    if (targetUserId && text.includes(`<@${targetUserId}>`)) {
      await handleUserMention(
        { channel: channelId, thread_ts: msg.thread_ts, ts, user: msg.user, text },
        context,
        ws.id,
        targetUserId,
      );
      return;
    }

    // 2. スレッド返信の追跡（既存タスクのスレッドに返信があった場合）
    if (msg.thread_ts) {
      await handleThreadReply(
        { channel: channelId, thread_ts: msg.thread_ts, ts, user: msg.user, text },
        context,
        ws.id,
      );
    }
  });

  // app_mention も念のため残す（ボットへのメンション = タスク化したい場合に対応）
  boltApp.event('app_mention', async ({ event, context }) => {
    // targetUserId が設定されている場合、app_mention は message イベントで処理済みなのでスキップ
    if (targetUserId) return;
    await handleUserMention(event, context, ws.id, '');
  });

  if (useSocketMode) {
    await boltApp.start();
    console.log('[Bolt] Socket Mode app started successfully');
  }

  return true;
}

export function getBoltApp(): App | null {
  return boltApp;
}

interface MessageEvent {
  channel: string;
  thread_ts?: string;
  ts: string;
  user?: string;
  text?: string;
}

async function handleUserMention(
  event: MessageEvent,
  context: { botToken?: string },
  workspaceId: string,
  _targetUserId: string,
) {
  const botToken = context.botToken || '';
  const threadTs = event.thread_ts || event.ts;
  const channelId = event.channel;

  console.log(`[Bolt] User mention detected in #${channelId}, thread: ${threadTs}`);

  // 既存タスクチェック
  const existing = getTaskByThread(workspaceId, channelId, threadTs);
  if (existing) {
    // スレッドメッセージを更新
    const messages = await fetchThreadMessages(botToken, channelId, threadTs, workspaceId);
    updateTask(existing.id, { threadMessages: messages });
    notifyListeners('task_updated', { taskId: existing.id });
    return;
  }

  // 新規タスク作成
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
  notifyListeners('task_created', task);
  console.log(`[Bolt] New task created: ${task.id}`);
}

interface ThreadReplyEvent {
  channel?: string;
  thread_ts?: string;
  ts?: string;
  user?: string;
  text?: string;
}

async function handleThreadReply(
  event: ThreadReplyEvent,
  context: { botToken?: string },
  workspaceId: string,
) {
  const botToken = context.botToken || '';
  const channelId = event.channel || '';
  const threadTs = event.thread_ts || '';

  // このスレッドに対するタスクが存在するか確認
  const existing = getTaskByThread(workspaceId, channelId, threadTs);
  if (!existing) return;

  // スレッドメッセージを更新
  const messages = await fetchThreadMessages(botToken, channelId, threadTs, workspaceId);
  updateTask(existing.id, { threadMessages: messages });
  notifyListeners('task_updated', { taskId: existing.id });
  console.log(`[Bolt] Thread reply updated task: ${existing.id}`);
}
