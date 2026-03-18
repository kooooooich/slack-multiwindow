import { v4 as uuidv4 } from 'uuid';
import {
  getTaskByThread,
  createTask,
  updateTask,
} from './db';
import { fetchThreadMessages, resolveUserProfile, getChannelName } from './slack';
import { notifyListeners } from './bolt-server';
import type { Task, SlackMessage } from '@/types';

// --- Types ---

export interface SlackEventPayload {
  type: string;
  channel: string;
  channelType?: string;
  threadTs?: string;
  ts: string;
  user?: string;
  text?: string;
  subtype?: string;
  // message_changed
  message?: { ts?: string; thread_ts?: string; text?: string; user?: string };
  previousMessage?: { ts?: string; thread_ts?: string; text?: string };
  // message_deleted
  deletedTs?: string;
}

export interface EventHandlerContext {
  botToken: string;
  workspaceId: string;
  targetUserId: string;
}

// --- Skip subtypes (single source of truth) ---

const SKIP_SUBTYPES = new Set([
  'bot_message',
  'channel_join', 'channel_leave',
  'channel_topic', 'channel_purpose', 'channel_name',
  'channel_archive', 'channel_unarchive',
  'group_join', 'group_leave',
  'group_topic', 'group_purpose', 'group_name',
  'group_archive', 'group_unarchive',
  'ekm_access_denied',
  'channel_posting_permissions',
]);

// --- Public API ---

export async function processSlackEvent(
  event: SlackEventPayload,
  ctx: EventHandlerContext,
): Promise<void> {
  const { targetUserId } = ctx;

  if (event.type === 'app_mention') {
    // targetUserId が設定されている場合、app_mention は message イベントで処理済みなのでスキップ
    if (targetUserId) return;
    await handleMention(event, ctx);
    return;
  }

  if (event.type !== 'message') return;

  // message_changed / message_deleted は専用ハンドラで処理
  if (event.subtype === 'message_changed') {
    await handleMessageChanged(event, ctx);
    return;
  }
  if (event.subtype === 'message_deleted') {
    await handleMessageDeleted(event, ctx);
    return;
  }

  // スキップすべきシステム系 subtype のみ無視
  if (event.subtype && SKIP_SUBTYPES.has(event.subtype)) {
    console.log(`[EventHandler] Skipping system message with subtype: ${event.subtype}`);
    return;
  }

  const text = event.text || '';
  const channelId = event.channel;
  const channelType = event.channelType || '';

  // 1. DM / グループDM: 自分以外からのメッセージは自動的にタスク化
  if ((channelType === 'im' || channelType === 'mpim') && event.user !== targetUserId) {
    console.log(`[EventHandler] DM/MPIM message detected (channel_type=${channelType}), treating as mention`);
    await handleMention(event, ctx);
    return;
  }

  // 2. ユーザーメンションの検知（新規タスク or 既存タスク更新）
  if (targetUserId && text.includes(`<@${targetUserId}>`)) {
    await handleMention(event, ctx);
    return;
  }

  // 3. スレッド返信の追跡（既存タスクのスレッドに返信があった場合）
  if (event.threadTs) {
    await handleThreadReply(event, ctx);
  }
}

// --- Internal Handlers ---

async function handleMention(
  event: SlackEventPayload,
  ctx: EventHandlerContext,
): Promise<void> {
  const { botToken, workspaceId } = ctx;
  const threadTs = event.threadTs || event.ts;
  const channelId = event.channel;

  console.log(`[EventHandler] User mention detected in #${channelId}, thread: ${threadTs}`);

  // 既存タスクチェック
  const existing = getTaskByThread(workspaceId, channelId, threadTs);
  if (existing) {
    const messages = await fetchThreadMessages(botToken, channelId, threadTs, workspaceId);
    const updates: Partial<Task> = { threadMessages: messages };

    // 完了済みタスクにメンションがあった場合は再オープン
    const wasCompleted = existing.status === 'completed';
    if (wasCompleted) {
      updates.status = 'open';
      updates.completedAt = undefined;
      updates.isMinimized = false;
      console.log(`[EventHandler] Reopening completed task due to mention: ${existing.id}`);
    }

    const updatedTask = updateTask(existing.id, updates);
    notifyListeners('task_updated', { task: updatedTask, reopened: wasCompleted });
    return;
  }

  // 新規タスク作成
  const channelName = await getChannelName(botToken, channelId);
  const threadMessages = await fetchThreadMessages(botToken, channelId, threadTs, workspaceId);

  // triggerMessage は threadMessages の先頭（メンション解決済み）から取得
  // threadMessages が空の場合はイベントデータからフォールバック
  const parentMsg = threadMessages.find((m) => m.ts === event.ts) || threadMessages[0];
  let triggerMessage: SlackMessage;

  if (parentMsg) {
    triggerMessage = {
      ...parentMsg,
      isDirectMention: true,
      isThreadParticipant: false,
    };
  } else {
    const userProfile = event.user
      ? await resolveUserProfile(botToken, event.user)
      : { displayName: 'unknown', avatarUrl: '' };
    triggerMessage = {
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
  }

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
    lastActivityAt: new Date().toISOString(),
    relatedChannels: [],
  };

  createTask(task);
  notifyListeners('task_created', task);
  console.log(`[EventHandler] New task created: ${task.id}`);
}

async function handleThreadReply(
  event: SlackEventPayload,
  ctx: EventHandlerContext,
): Promise<void> {
  const { botToken, workspaceId, targetUserId } = ctx;
  const channelId = event.channel;
  const threadTs = event.threadTs || '';

  const existing = getTaskByThread(workspaceId, channelId, threadTs);

  if (!existing) {
    // 既存タスクがない場合：スレッド内に自身へのメンションが含まれていればタスク化
    if (!targetUserId) return;

    const threadMessages = await fetchThreadMessages(botToken, channelId, threadTs, workspaceId);
    const parentMsg = threadMessages[0];

    // 判定1: スレッド内に自身へのメンションが含まれているか
    const mentionPattern = new RegExp(`<@${targetUserId}(\\|[^>]*)?>`);
    const hasMention = threadMessages.some((m) =>
      mentionPattern.test(m.text || ''),
    );

    // 判定2: スレッドの親メッセージが自分の投稿か
    const isMyThread = parentMsg?.userId === targetUserId;

    if (!hasMention && !isMyThread) return;

    console.log(`[EventHandler] Thread qualifies for task: hasMention=${hasMention}, isMyThread=${isMyThread}`);
    const channelName = await getChannelName(botToken, channelId);

    // triggerMessage は threadMessages の先頭（メンション解決済み）から取得
    const triggerMessage: SlackMessage = parentMsg
      ? { ...parentMsg, isDirectMention: true, isThreadParticipant: false }
      : {
          id: `${channelId}-${threadTs}`,
          workspaceId,
          channelId,
          channelName,
          threadTs,
          ts: threadTs,
          userId: '',
          userName: 'unknown',
          avatarUrl: '',
          text: '',
          isDirectMention: true,
          isThreadParticipant: false,
        };

    const newTask: Task = {
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
      lastActivityAt: new Date().toISOString(),
      relatedChannels: [],
    };

    createTask(newTask);
    notifyListeners('task_created', newTask);
    console.log(`[EventHandler] New task created from thread with prior mention: ${newTask.id}`);
    return;
  }

  // スレッドメッセージを更新
  const messages = await fetchThreadMessages(botToken, channelId, threadTs, workspaceId);
  const updates: Partial<Task> = { threadMessages: messages };

  // 完了済みタスクにスレッド返信があった場合は再オープン
  const wasCompleted = existing.status === 'completed';
  if (wasCompleted) {
    updates.status = 'open';
    updates.completedAt = undefined;
    updates.isMinimized = false;
    console.log(`[EventHandler] Reopening completed task due to thread reply: ${existing.id}`);
  }

  const updatedTask = updateTask(existing.id, updates);
  notifyListeners('task_updated', { task: updatedTask, reopened: wasCompleted });
  console.log(`[EventHandler] Thread reply updated task: ${existing.id}`);
}

async function handleMessageChanged(
  event: SlackEventPayload,
  ctx: EventHandlerContext,
): Promise<void> {
  const { botToken, workspaceId } = ctx;
  const channelId = event.channel;
  const innerMessage = event.message;
  if (!innerMessage) return;

  const threadTs = innerMessage.thread_ts || innerMessage.ts || '';
  if (!threadTs) return;

  const existing = getTaskByThread(workspaceId, channelId, threadTs);
  if (!existing) return;

  console.log(`[EventHandler] Message changed in task thread: ${existing.id}`);
  const messages = await fetchThreadMessages(botToken, channelId, threadTs, workspaceId);
  const updatedTask = updateTask(existing.id, { threadMessages: messages });
  notifyListeners('task_updated', { task: updatedTask, reopened: false });
}

async function handleMessageDeleted(
  event: SlackEventPayload,
  ctx: EventHandlerContext,
): Promise<void> {
  const { botToken, workspaceId } = ctx;
  const channelId = event.channel;
  const threadTs = event.previousMessage?.thread_ts || event.deletedTs || '';
  if (!threadTs) return;

  const existing = getTaskByThread(workspaceId, channelId, threadTs);
  if (!existing) return;

  console.log(`[EventHandler] Message deleted in task thread: ${existing.id}`);
  const messages = await fetchThreadMessages(botToken, channelId, threadTs, workspaceId);
  const updatedTask = updateTask(existing.id, { threadMessages: messages });
  notifyListeners('task_updated', { task: updatedTask, reopened: false });
}
