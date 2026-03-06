'use client';

import { create } from 'zustand';
import type { Workspace, Task } from '@/types';

interface AppStore {
  // ワークスペース
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  setWorkspaces: (workspaces: Workspace[]) => void;
  setActiveWorkspaceId: (id: string | null) => void;

  // タスク & ウィンドウ
  tasks: Task[];
  openWindowIds: string[];
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
  updateWindowPosition: (taskId: string, pos: { x: number; y: number }) => void;
  updateWindowSize: (taskId: string, size: { width: number; height: number }) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  // ワークスペース
  workspaces: [],
  activeWorkspaceId: null,
  setWorkspaces: (workspaces) => set({ workspaces }),
  setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),

  // タスク & ウィンドウ
  tasks: [],
  openWindowIds: [],
  focusedWindowId: null,

  // タスクアクション
  setTasks: (tasks) =>
    set({
      tasks,
      openWindowIds: tasks
        .filter((t) => t.status === 'open' && !t.isMinimized)
        .map((t) => t.id),
    }),

  addTask: (task) =>
    set((state) => ({
      tasks: [task, ...state.tasks],
      openWindowIds: task.isMinimized
        ? state.openWindowIds
        : [...state.openWindowIds, task.id],
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
        focusedWindowId: taskId,
        tasks: state.tasks.map((t) =>
          t.id === taskId ? { ...t, isMinimized: false } : t,
        ),
      };
    }),

  closeWindow: (taskId) =>
    set((state) => ({
      openWindowIds: state.openWindowIds.filter((id) => id !== taskId),
      focusedWindowId: state.focusedWindowId === taskId ? null : state.focusedWindowId,
    })),

  minimizeWindow: (taskId) =>
    set((state) => ({
      openWindowIds: state.openWindowIds.filter((id) => id !== taskId),
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
      focusedWindowId: taskId,
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, isMinimized: false } : t,
      ),
    })),

  focusWindow: (taskId) =>
    set({ focusedWindowId: taskId }),

  updateWindowPosition: (taskId, pos) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, windowPosition: pos } : t,
      ),
    })),

  updateWindowSize: (taskId, size) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, windowSize: size } : t,
      ),
    })),
}));
