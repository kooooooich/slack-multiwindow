'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import type { Task } from '@/types';

interface UseTaskSyncOptions {
  enabled: boolean;
  onTasksLoaded?: () => void;
}

/** クライアントサイドのDB再取得間隔（60秒） */
const CLIENT_POLL_INTERVAL_MS = 60_000;

export function useTaskSync({ enabled, onTasksLoaded }: UseTaskSyncOptions) {
  const lastSeqRef = useRef<number>(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 全タスクをAPIから一括取得（初期ロード + ギャップリカバリ用）
  const fetchAllTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks', { cache: 'no-store' });
      if (!res.ok) return;
      const tasks = await res.json();
      if (Array.isArray(tasks)) {
        useAppStore.getState().setTasks(tasks);
        onTasksLoaded?.();
      }
    } catch {
      // ignore
    }
  }, [onTasksLoaded]);

  // サーバーサイドの即時リフレッシュ + DB再取得
  const triggerRefreshAndFetch = useCallback(async () => {
    try {
      // サーバーにSlack APIからの即時リフレッシュを指示
      await fetch('/api/slack/refresh', { method: 'POST' });
      // リフレッシュ後のDBデータを取得
      await fetchAllTasks();
    } catch {
      // リフレッシュAPI失敗時はDBから直接取得
      await fetchAllTasks();
    }
  }, [fetchAllTasks]);

  useEffect(() => {
    if (!enabled) return;

    const getStore = () => useAppStore.getState();
    let retryCount = 0;

    // === マウント時: サーバーサイドリフレッシュ + DB取得 ===
    // ブラウザリロード時に最新データを確実に取得
    triggerRefreshAndFetch();

    // === SSE接続（リアルタイム経路 / Socket Mode正常時） ===
    function connectSSE() {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      const eventSource = new EventSource('/api/slack/stream');
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const seq = data.seq as number | undefined;

          if (data.type === 'connected') {
            retryCount = 0;
            // 初期接続時のシーケンス番号を記録
            if (seq !== undefined) {
              // ギャップ検知: 前回の接続から欠落があれば全件リフレッシュ
              if (lastSeqRef.current > 0 && seq > lastSeqRef.current) {
                console.log(`[TaskSync] SSE reconnected with seq gap: ${lastSeqRef.current} → ${seq}, refreshing`);
                fetchAllTasks();
              }
              lastSeqRef.current = seq;
            }
            return;
          }

          // シーケンス番号の追跡
          if (seq !== undefined) {
            if (lastSeqRef.current > 0 && seq > lastSeqRef.current + 1) {
              // ギャップ検知 → 全件リフレッシュ
              console.log(`[TaskSync] SSE seq gap detected: expected ${lastSeqRef.current + 1}, got ${seq}`);
              fetchAllTasks();
            }
            lastSeqRef.current = seq;
          }

          if (data.type === 'task_created') {
            const task = data.data as Task;
            const existsInStore = getStore().tasks.some(
              (t) => t.workspaceId === task.workspaceId && t.channelId === task.channelId && t.threadTs === task.threadTs,
            );
            if (!existsInStore) {
              getStore().addTask(task);
              getStore().openWindow(task.id);
            }
            return;
          }

          if (data.type === 'task_updated') {
            const { task, reopened } = data.data as { task: Task | null; reopened: boolean };
            if (!task) return;

            const taskId = task.id;
            const currentTasks = getStore().tasks;
            const existingTask = currentTasks.find((t) => t.id === taskId);

            if (existingTask) {
              // 新メッセージが増えた場合はウィンドウを自動展開
              const oldCount = existingTask.threadMessages?.length ?? 0;
              const newCount = task.threadMessages?.length ?? 0;
              const hasNewMsg = newCount > oldCount;

              getStore().updateTask(taskId, task);

              if (reopened || hasNewMsg) {
                getStore().openWindow(taskId);
              }
            } else {
              getStore().addTask(task);
              getStore().openWindow(taskId);
            }
            return;
          }
        } catch {
          // ignore parse errors
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        eventSourceRef.current = null;

        // 指数バックオフで再接続（最大30秒）
        retryCount++;
        const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 30000);
        console.log(`[TaskSync] SSE error, reconnecting in ${delay}ms (retry ${retryCount})`);

        reconnectTimerRef.current = setTimeout(() => {
          connectSSE();
        }, delay);
      };
    }

    connectSSE();

    // === 定期DBポーリング（SSE配信漏れのフォールバック） ===
    // サーバーサイドポーラーがDBに書き込んだデータを取得
    pollTimerRef.current = setInterval(() => {
      fetchAllTasks();
    }, CLIENT_POLL_INTERVAL_MS);

    // === Visibility API: タブ復帰時にリフレッシュ ===
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        console.log('[TaskSync] Tab became visible, refreshing');
        triggerRefreshAndFetch();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, fetchAllTasks, triggerRefreshAndFetch]);

  return { fetchAllTasks, triggerRefreshAndFetch };
}
