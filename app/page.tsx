'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import WorkspaceSetup from '@/components/WorkspaceSetup';
import TaskBoard from '@/components/TaskBoard';
import WindowManager from '@/components/WindowManager';
import { useAppStore } from '@/lib/store';
import type { Workspace, Task } from '@/types';

export default function Home() {
  const [mode, setMode] = useState<'loading' | 'setup' | 'app'>('loading');
  const setWorkspaces = useAppStore((s) => s.setWorkspaces);
  const setActiveWorkspaceId = useAppStore((s) => s.setActiveWorkspaceId);
  const setTasks = useAppStore((s) => s.setTasks);
  const workspaces = useAppStore((s) => s.workspaces);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);

  const loadData = useCallback(async () => {
    try {
      const [wsRes, taskRes] = await Promise.all([
        fetch('/api/workspaces'),
        fetch('/api/tasks'),
      ]);
      const wsData = await wsRes.json();
      const taskData = await taskRes.json();

      if (Array.isArray(wsData) && wsData.length > 0) {
        setWorkspaces(wsData);
        setActiveWorkspaceId(wsData[0].id);
        if (Array.isArray(taskData)) {
          setTasks(taskData);
        }
        setMode('app');
      } else {
        setMode('setup');
      }
    } catch {
      setMode('setup');
    }
  }, [setWorkspaces, setActiveWorkspaceId, setTasks]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // リアルタイム更新: SSE + ポーリングフォールバック
  const addTask = useAppStore((s) => s.addTask);
  const updateTask = useAppStore((s) => s.updateTask);
  const openWindow = useAppStore((s) => s.openWindow);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (mode !== 'app') return;

    let eventSource: EventSource | null = null;
    let sseConnected = false;

    // SSE接続を試行
    try {
      eventSource = new EventSource('/api/slack/stream');

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'connected') {
            sseConnected = true;
            // SSE接続成功 → ポーリング停止
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
          } else if (data.type === 'task_created') {
            const task = data.data as Task;
            addTask(task);
            openWindow(task.id);
          } else if (data.type === 'task_updated') {
            // タスク更新 → 全タスク再取得
            refreshTasks();
          }
        } catch {
          // ignore parse errors
        }
      };

      eventSource.onerror = () => {
        sseConnected = false;
        // SSEが失敗した場合 → ポーリングにフォールバック
        startPolling();
      };
    } catch {
      // SSE非対応 → ポーリング
      startPolling();
    }

    function startPolling() {
      if (pollingRef.current) return;
      pollingRef.current = setInterval(() => {
        refreshTasks();
      }, 5000);
    }

    async function refreshTasks() {
      try {
        const res = await fetch('/api/tasks');
        if (res.ok) {
          const tasks = await res.json();
          if (Array.isArray(tasks)) {
            // 新しいタスクを検出してウィンドウを開く
            const currentIds = useAppStore.getState().tasks.map((t: Task) => t.id);
            for (const task of tasks) {
              if (!currentIds.includes(task.id) && task.status === 'open') {
                openWindow(task.id);
              }
            }
            setTasks(tasks);
          }
        }
      } catch {
        // ignore
      }
    }

    // SSE非対応の場合の保険としてポーリングも開始（SSE接続後に停止）
    if (!sseConnected) {
      startPolling();
    }

    return () => {
      if (eventSource) eventSource.close();
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [mode, addTask, updateTask, openWindow, setTasks]);

  if (mode === 'loading') {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center">
        <div className="text-gray-400 font-mono">Loading...</div>
      </div>
    );
  }

  if (mode === 'setup') {
    return (
      <WorkspaceSetup
        onComplete={() => {
          loadData();
        }}
      />
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#0F1117]">
      {/* ヘッダー */}
      <Header
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onChangeWorkspace={setActiveWorkspaceId}
        onOpenSettings={() => setMode('setup')}
      />

      {/* メインコンテンツ */}
      <div className="flex flex-1 overflow-hidden">
        <TaskBoard />
        <WindowManager />
      </div>
    </div>
  );
}

function Header({
  workspaces,
  activeWorkspaceId,
  onChangeWorkspace,
  onOpenSettings,
}: {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  onChangeWorkspace: (id: string) => void;
  onOpenSettings: () => void;
}) {
  return (
    <header className="h-11 bg-[#1A1D27] border-b border-white/10 flex items-center px-4 shrink-0">
      <h1 className="text-sm font-bold text-white mr-6 tracking-wide">
        Slack Multi-Window
      </h1>

      {/* ワークスペース切り替え */}
      {workspaces.length > 1 && (
        <div className="flex items-center gap-1 mr-4">
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => onChangeWorkspace(ws.id)}
              className={`px-2.5 py-1 rounded text-xs transition ${
                activeWorkspaceId === ws.id
                  ? 'bg-[#4A9EFF]/20 text-[#4A9EFF]'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              {ws.name}
            </button>
          ))}
        </div>
      )}

      {workspaces.length === 1 && (
        <span className="text-xs text-gray-500 mr-4">
          {workspaces[0].name}
        </span>
      )}

      <div className="ml-auto">
        <button
          onClick={onOpenSettings}
          className="text-gray-500 hover:text-gray-300 transition p-1"
          title="設定"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </button>
      </div>
    </header>
  );
}
