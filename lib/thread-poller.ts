/**
 * Thread Poller — Socket Mode 障害時のフォールバック
 *
 * 60秒ごとに全追跡タスクのスレッドを軽量チェックし、
 * 変更があれば全文取得 → DB更新 → SSE通知する。
 *
 * 軽量チェック戦略:
 *   conversations.replies(channel, ts, limit=1, inclusive=true)
 *   → 親メッセージの reply_count / latest_reply を確認
 *   → 既存タスクの threadMessages と比較
 *   → 差分がある場合のみ fetchThreadMessages() で全文取得
 *
 * レート制限:
 *   Tier 3 (~50 req/min) に対し、30タスク/60秒 = 30 req/min で安全圏
 *   タスク間 200ms スタガーでバースト回避
 */

import { getSlackClient, fetchThreadMessages } from './slack';
import { getTasksForPolling, updateTask, getAllWorkspaces } from './db';
import { notifyListeners } from './bolt-server';
import type { Task } from '@/types';

const POLL_INTERVAL_MS = 60_000; // 60秒
const INITIAL_DELAY_MS = 10_000; // 初回実行までの待ち時間（Bolt接続を待つ）
const STAGGER_DELAY_MS = 200;    // タスク間の待ち時間
const MAX_COMPLETED_AGE_DAYS = 7;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let isPolling = false;
let lastPollAt = 0;

// --- Public API ---

export function startThreadPoller(): void {
  if (pollTimer) return; // 既に起動中

  console.log(`[ThreadPoller] Starting periodic thread polling (interval: ${POLL_INTERVAL_MS / 1000}s)`);

  // 初回は少し待ってから実行（Bolt Socket Mode 接続待ち）
  setTimeout(() => {
    pollAllTasks().catch((err) =>
      console.error('[ThreadPoller] Initial poll error:', err),
    );
  }, INITIAL_DELAY_MS);

  pollTimer = setInterval(() => {
    if (!isPolling) {
      pollAllTasks().catch((err) =>
        console.error('[ThreadPoller] Poll cycle error:', err),
      );
    }
  }, POLL_INTERVAL_MS);
}

export function stopThreadPoller(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log('[ThreadPoller] Stopped');
  }
}

export function isThreadPollerRunning(): boolean {
  return pollTimer !== null;
}

export function getLastPollTimestamp(): number {
  return lastPollAt;
}

/**
 * 即時ポーリング実行（API エンドポイントから呼び出し用）
 * 同時実行ガードあり
 */
export async function refreshAllTasksNow(): Promise<{ checked: number; updated: number }> {
  return pollAllTasks();
}

// --- Internal ---

async function pollAllTasks(): Promise<{ checked: number; updated: number }> {
  if (isPolling) return { checked: 0, updated: 0 };
  isPolling = true;

  try {
    const workspaces = getAllWorkspaces();
    if (workspaces.length === 0) return { checked: 0, updated: 0 };

    const ws = workspaces[0]; // 現状はシングルワークスペース
    if (!ws.botToken) return { checked: 0, updated: 0 };

    const tasks = getTasksForPolling(MAX_COMPLETED_AGE_DAYS);
    if (tasks.length === 0) return { checked: 0, updated: 0 };

    console.log(`[ThreadPoller] Checking ${tasks.length} tasks for updates`);
    let updatedCount = 0;

    for (const task of tasks) {
      try {
        const changed = await checkAndUpdateTask(ws.botToken, task);
        if (changed) updatedCount++;
      } catch (err) {
        // 個別タスクのエラーは他のタスクに影響させない
        const errMsg = err instanceof Error ? err.message : String(err);
        // channel_not_found 等は頻出するのでログレベルを下げる
        if (errMsg.includes('channel_not_found') || errMsg.includes('thread_not_found')) {
          console.log(`[ThreadPoller] Skipping task ${task.id}: ${errMsg}`);
        } else {
          console.error(`[ThreadPoller] Error checking task ${task.id}:`, errMsg);
        }
      }

      // レート制限対策: タスク間に 200ms の間隔
      await sleep(STAGGER_DELAY_MS);
    }

    lastPollAt = Date.now();

    if (updatedCount > 0) {
      console.log(`[ThreadPoller] Updated ${updatedCount}/${tasks.length} tasks`);
    }

    return { checked: tasks.length, updated: updatedCount };
  } finally {
    isPolling = false;
  }
}

/**
 * 1つのタスクのスレッドを軽量チェックし、変更があれば全文取得して更新する
 * @returns true if the task was updated
 */
async function checkAndUpdateTask(botToken: string, task: Task): Promise<boolean> {
  const client = getSlackClient(botToken);

  // 軽量チェック: 親メッセージの reply_count / latest_reply を取得
  const result = await client.conversations.replies({
    channel: task.channelId,
    ts: task.threadTs,
    limit: 1,
    inclusive: true,
  });

  if (!result.messages || result.messages.length === 0) return false;

  const parent = result.messages[0] as {
    reply_count?: number;
    latest_reply?: string;
  };

  const newReplyCount = parent.reply_count ?? 0;
  const newLatestReply = parent.latest_reply ?? '';

  // 既存データとの比較
  // threadMessages にはスレッド親メッセージも含まれるため、長さは reply_count + 1
  const knownMessageCount = task.threadMessages?.length ?? 0;

  // メッセージ数の変化をチェック
  const countChanged = knownMessageCount !== newReplyCount + 1;

  // 最新返信のタイムスタンプの変化をチェック
  // reply_count が 0 の場合は latest_reply が空なので比較しない
  let latestReplyChanged = false;
  if (newReplyCount > 0 && newLatestReply) {
    const knownLatestTs = knownMessageCount > 1
      ? task.threadMessages[knownMessageCount - 1].ts
      : '';
    latestReplyChanged = knownLatestTs !== newLatestReply;
  }

  const hasChanged = countChanged || latestReplyChanged;

  if (!hasChanged) return false;

  // 変更検知 → 全文取得
  console.log(
    `[ThreadPoller] Changes detected for task ${task.id}: ` +
    `messages ${knownMessageCount} → ${newReplyCount + 1}` +
    (newLatestReply ? `, latest_reply → ${newLatestReply}` : ''),
  );

  const messages = await fetchThreadMessages(
    botToken,
    task.channelId,
    task.threadTs,
    task.workspaceId,
  );

  const updates: Partial<Task> = { threadMessages: messages };

  // 完了済みタスクの再オープン判定:
  // 新規投稿がある場合のみ再オープン（編集・削除では再オープンしない）
  const wasCompleted = task.status === 'completed';
  const hasNewPosts = newReplyCount + 1 > knownMessageCount;
  const shouldReopen = wasCompleted && hasNewPosts;

  if (shouldReopen) {
    updates.status = 'open';
    updates.completedAt = undefined;
    updates.isMinimized = false;
    console.log(`[ThreadPoller] Reopening completed task (new posts detected): ${task.id}`);
  } else if (wasCompleted) {
    console.log(`[ThreadPoller] Data updated for completed task (no new posts, skipping reopen): ${task.id}`);
  }

  const updatedTask = updateTask(task.id, updates);
  notifyListeners('task_updated', { task: updatedTask, reopened: shouldReopen });

  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
