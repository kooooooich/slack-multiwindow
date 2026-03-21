'use client';

import { create } from 'zustand';
import type { Workspace, Task, MonitoredChannel, SlackMessage, Project } from '@/types';

// チャネルメッセージキャッシュ（TTL: 3分）
interface ChannelMessageCache {
  messages: SlackMessage[];
  nextCursor?: string;
  cachedAt: number;
}
const CHANNEL_CACHE_TTL = 3 * 60 * 1000; // 3分

interface AppStore {
  // ワークスペース
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  setWorkspaces: (workspaces: Workspace[]) => void;
  setActiveWorkspaceId: (id: string | null) => void;

  // タスク & ウィンドウ
  tasks: Task[];
  openWindowIds: string[];
  windowOrder: string[];
  focusedWindowId: string | null;

  // タスクアクション
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  completeTask: (id: string) => void;

  // ウィンドウアクション
  openWindow: (taskId: string) => void;
  closeWindow: (taskId: string) => void;
  minimizeWindow: (taskId: string) => void;
  restoreWindow: (taskId: string) => void;
  focusWindow: (taskId: string) => void;
  reorderWindows: (fromId: string, toId: string) => void;

  // サイドバータブ
  sidebarTab: 'tasks' | 'channels';
  setSidebarTab: (tab: 'tasks' | 'channels') => void;

  // アクティブチャネル（nullならWindowManager、値ありならChannelView）
  activeChannelId: string | null;
  activeChannelName: string | null;
  setActiveChannel: (id: string | null, name?: string) => void;

  // 監視チャネル
  monitoredChannels: MonitoredChannel[];
  setMonitoredChannels: (channels: MonitoredChannel[]) => void;
  addMonitoredChannelToStore: (channel: MonitoredChannel) => void;
  removeMonitoredChannelFromStore: (channelId: string) => void;

  // チャネルメッセージキャッシュ
  channelMessageCache: Record<string, ChannelMessageCache | undefined>;
  getCachedMessages: (channelId: string) => ChannelMessageCache | null;
  setCachedMessages: (channelId: string, messages: SlackMessage[], nextCursor?: string) => void;
  clearChannelCache: (channelId?: string) => void;

  // プロジェクトフィルタ
  projects: Project[];
  setProjects: (projects: Project[]) => void;
  filterProjectId: string | null; // null = ALL, 'unassigned' = 未分類, その他 = projectId
  setFilterProjectId: (id: string | null) => void;

  // スレッド更新通知（最後に確認したメッセージ数を記録）
  lastSeenMessageCount: Record<string, number>;
  markTaskAsSeen: (taskId: string) => void;
  hasNewMessages: (taskId: string) => boolean;
}

export const useAppStore = create<AppStore>((set, get) => ({
  // ワークスペース
  workspaces: [],
  activeWorkspaceId: null,
  setWorkspaces: (workspaces) => set({ workspaces }),
  setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),

  // タスク & ウィンドウ
  tasks: [],
  openWindowIds: [],
  windowOrder: [],
  focusedWindowId: null,

  // タスクアクション
  setTasks: (tasks) =>
    set((state) => {
      const currentTaskMap = new Map(state.tasks.map((t) => [t.id, t]));

      // 新規タスクのみウィンドウを開く（既存タスクの開閉状態は維持）
      const newTaskOpenIds = tasks
        .filter((t) => !currentTaskMap.has(t.id) && t.status === 'open' && !t.isMinimized)
        .map((t) => t.id);

      // 既存タスクで新メッセージが増えた or reopen されたタスクもウィンドウを開く
      const autoOpenIds = tasks
        .filter((t) => {
          const old = currentTaskMap.get(t.id);
          if (!old) return false;
          // メッセージ数が増えた
          const hasNewMsg = (t.threadMessages?.length ?? 0) > (old.threadMessages?.length ?? 0);
          // completed → open にreopenされた
          const wasReopened = old.status === 'completed' && t.status === 'open';
          return hasNewMsg || wasReopened;
        })
        .map((t) => t.id);

      // 既存のopenWindowIdsから、まだ存在するタスクのみ保持
      const validTaskIds = new Set(tasks.map((t) => t.id));
      const preservedOpenIds = state.openWindowIds.filter((id) => validTaskIds.has(id));

      const openWindowIds = [...new Set([...preservedOpenIds, ...newTaskOpenIds, ...autoOpenIds])];

      // 既存順序を保持、新規は末尾に追加
      const existingOrder = state.windowOrder.filter((id) => openWindowIds.includes(id));
      const addedIds = openWindowIds.filter((id) => !existingOrder.includes(id));

      // 初回ロード時: lastSeenMessageCountを初期化（誤通知防止）
      const lastSeenMessageCount = { ...state.lastSeenMessageCount };
      for (const t of tasks) {
        if (lastSeenMessageCount[t.id] === undefined) {
          lastSeenMessageCount[t.id] = t.threadMessages?.length ?? 0;
        }
      }

      // autoOpen されたタスクの isMinimized を解除
      const finalTasks = tasks.map((t) =>
        autoOpenIds.includes(t.id) ? { ...t, isMinimized: false } : t,
      );

      return {
        tasks: finalTasks,
        openWindowIds,
        windowOrder: [...existingOrder, ...addedIds],
        lastSeenMessageCount,
      };
    }),

  addTask: (task) =>
    set((state) => ({
      tasks: [task, ...state.tasks],
      openWindowIds: task.isMinimized
        ? state.openWindowIds
        : [...state.openWindowIds, task.id],
      windowOrder: task.isMinimized
        ? state.windowOrder
        : [...state.windowOrder, task.id],
      focusedWindowId: task.isMinimized ? state.focusedWindowId : task.id,
    })),

  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  completeTask: (id) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id
          ? { ...t, status: 'completed' as const, completedAt: new Date().toISOString() }
          : t,
      ),
      openWindowIds: state.openWindowIds.filter((wid) => wid !== id),
      windowOrder: state.windowOrder.filter((wid) => wid !== id),
      focusedWindowId: state.focusedWindowId === id ? null : state.focusedWindowId,
    })),

  // ウィンドウアクション
  openWindow: (taskId) =>
    set((state) => {
      if (state.openWindowIds.includes(taskId)) {
        return { focusedWindowId: taskId };
      }
      return {
        openWindowIds: [...state.openWindowIds, taskId],
        windowOrder: state.windowOrder.includes(taskId)
          ? state.windowOrder
          : [...state.windowOrder, taskId],
        focusedWindowId: taskId,
        tasks: state.tasks.map((t) =>
          t.id === taskId ? { ...t, isMinimized: false } : t,
        ),
      };
    }),

  closeWindow: (taskId) =>
    set((state) => ({
      openWindowIds: state.openWindowIds.filter((id) => id !== taskId),
      windowOrder: state.windowOrder.filter((id) => id !== taskId),
      focusedWindowId: state.focusedWindowId === taskId ? null : state.focusedWindowId,
    })),

  minimizeWindow: (taskId) =>
    set((state) => ({
      openWindowIds: state.openWindowIds.filter((id) => id !== taskId),
      windowOrder: state.windowOrder.filter((id) => id !== taskId),
      focusedWindowId: state.focusedWindowId === taskId ? null : state.focusedWindowId,
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, isMinimized: true } : t,
      ),
    })),

  restoreWindow: (taskId) =>
    set((state) => ({
      openWindowIds: state.openWindowIds.includes(taskId)
        ? state.openWindowIds
        : [...state.openWindowIds, taskId],
      windowOrder: state.windowOrder.includes(taskId)
        ? state.windowOrder
        : [...state.windowOrder, taskId],
      focusedWindowId: taskId,
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, isMinimized: false } : t,
      ),
    })),

  focusWindow: (taskId) =>
    set({ focusedWindowId: taskId }),

  reorderWindows: (fromId, toId) =>
    set((state) => {
      const order = [...state.windowOrder];
      const fromIndex = order.indexOf(fromId);
      const toIndex = order.indexOf(toId);
      if (fromIndex === -1 || toIndex === -1) return state;
      order.splice(fromIndex, 1);
      order.splice(toIndex, 0, fromId);
      return { windowOrder: order };
    }),

  // サイドバータブ
  sidebarTab: 'tasks',
  setSidebarTab: (tab) => set({ sidebarTab: tab }),

  // アクティブチャネル
  activeChannelId: null,
  activeChannelName: null,
  setActiveChannel: (id, name) => set({
    activeChannelId: id,
    activeChannelName: name || null,
  }),

  // 監視チャネル
  monitoredChannels: [],
  setMonitoredChannels: (channels) => set({ monitoredChannels: channels }),
  addMonitoredChannelToStore: (channel) =>
    set((state) => ({
      monitoredChannels: [...state.monitoredChannels, channel],
    })),
  removeMonitoredChannelFromStore: (channelId) =>
    set((state) => ({
      monitoredChannels: state.monitoredChannels.filter((c) => c.channelId !== channelId),
    })),

  // チャネルメッセージキャッシュ
  channelMessageCache: {},
  getCachedMessages: (channelId) => {
    const cache = get().channelMessageCache[channelId];
    if (!cache) return null;
    if (Date.now() - cache.cachedAt > CHANNEL_CACHE_TTL) return null;
    return cache;
  },
  setCachedMessages: (channelId, messages, nextCursor) =>
    set((state) => ({
      channelMessageCache: {
        ...state.channelMessageCache,
        [channelId]: { messages, nextCursor, cachedAt: Date.now() },
      },
    })),
  clearChannelCache: (channelId) =>
    set((state) => {
      if (channelId) {
        const { [channelId]: _, ...rest } = state.channelMessageCache;
        return { channelMessageCache: rest };
      }
      return { channelMessageCache: {} };
    }),

  // プロジェクトフィルタ
  projects: [],
  setProjects: (projects) => set({ projects }),
  filterProjectId: null,
  setFilterProjectId: (id) => set({ filterProjectId: id }),

  // スレッド更新通知
  lastSeenMessageCount: {},
  markTaskAsSeen: (taskId) =>
    set((state) => {
      const task = state.tasks.find((t) => t.id === taskId);
      const count = task?.threadMessages?.length ?? 0;
      return {
        lastSeenMessageCount: {
          ...state.lastSeenMessageCount,
          [taskId]: count,
        },
      };
    }),
  hasNewMessages: (taskId) => {
    const state = get();
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return false;
    const currentCount = task.threadMessages?.length ?? 0;
    const lastSeen = state.lastSeenMessageCount[taskId];
    // まだ一度も見ていない場合は通知しない（初回ロード時）
    if (lastSeen === undefined) return false;
    return currentCount > lastSeen;
  },
}));
