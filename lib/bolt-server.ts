import { App, LogLevel } from '@slack/bolt';
import { v4 as uuidv4 } from 'uuid';
import {
  getAllWorkspaces,
  getTaskByThread,
  createTask,
  updateTask,
} from './db';
import { fetchThreadMessages, resolveUserName, getChannelName } from './slack';
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

export async function startSlackBolt() {
  const workspaces = getAllWorkspaces();

  if (workspaces.length === 0) {
    console.log('[Bolt] No workspaces configured. Skipping Slack Bolt startup.');
    console.log('[Bolt] Add a workspace via UI and restart to enable Slack events.');
    return;
  }

  // 最初のワークスペースの設定を使用（マルチワークスペースは将来対応）
  const ws = workspaces[0];
  const useSocketMode = !!ws.appToken || !!process.env.SLACK_APP_TOKEN;

  const appToken = ws.appToken || process.env.SLACK_APP_TOKEN;
  const botToken = ws.botToken || process.env.SLACK_BOT_TOKEN;
  const signingSecret = ws.signingSecret || process.env.SLACK_SIGNING_SECRET;

  if (!botToken || !signingSecret) {
    console.log('[Bolt] Missing bot token or signing secret. Skipping.');
    return;
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
    // Events API mode: Bolt は HTTP receiver を使わず、
    // Next.js の /api/slack/events が受信する
    // ここでは Bolt の event listener だけ登録し、
    // /api/slack/events から processEvent を呼ぶ
    console.log('[Bolt] Starting in Events API mode...');
    console.log('[Bolt] Events will be received via /api/slack/events');
  }

  boltApp = new App(appConfig);

  // --- Event Handlers ---

  // app_mention イベント
  boltApp.event('app_mention', async ({ event, context }) => {
    await handleMention(event, context, ws.id);
  });

  // message イベント（スレッド内の返信）
  boltApp.event('message', async ({ event, context }) => {
    const msg = event as { thread_ts?: string; subtype?: string; channel?: string; user?: string; text?: string; ts?: string };
    // スレッド返信のみ処理（thread_tsがある = スレッド内メッセージ）
    if (!msg.thread_ts || msg.subtype) return;
    await handleThreadReply(msg, context, ws.id);
  });

  if (useSocketMode) {
    await boltApp.start();
    console.log('[Bolt] Socket Mode app started successfully');
  }
}

export function getBoltApp(): App | null {
  return boltApp;
}

interface MentionEvent {
  channel: string;
  thread_ts?: string;
  ts: string;
  user?: string;
  text?: string;
}

async function handleMention(
  event: MentionEvent,
  context: { botToken?: string },
  workspaceId: string,
) {
  const botToken = context.botToken || '';
  const threadTs = event.thread_ts || event.ts;
  const channelId = event.channel;

  console.log(`[Bolt] Mention received in #${channelId}, thread: ${threadTs}`);

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
  const userName = event.user ? await resolveUserName(botToken, event.user) : 'unknown';
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
    userName,
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
