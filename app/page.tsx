'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import WorkspaceSetup from '@/components/WorkspaceSetup';
import TaskBoard from '@/components/TaskBoard';
import WindowManager from '@/components/WindowManager';
import ChannelView from '@/components/ChannelView';
import SearchBar from '@/components/SearchBar';
import LoginScreen from '@/components/LoginScreen';
import { useAppStore } from '@/lib/store';
import { useTaskSync } from '@/hooks/useTaskSync';
import type { Workspace } from '@/types';

export default function Home() {
  const [mode, setMode] = useState<'loading' | 'login' | 'setup' | 'app'>('loading');
  const setWorkspaces = useAppStore((s) => s.setWorkspaces);
  const setActiveWorkspaceId = useAppStore((s) => s.setActiveWorkspaceId);
  const setTasks = useAppStore((s) => s.setTasks);
  const workspaces = useAppStore((s) => s.workspaces);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const { data: session } = useSession();

  const [scanning, setScanning] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [wsRes, taskRes] = await Promise.all([
        fetch('/api/workspaces', { cache: 'no-store' }),
        fetch('/api/tasks', { cache: 'no-store' }),
      ]);

      if (wsRes.status === 401) {
        setMode('login');
        return;
      }

      const wsData = await wsRes.json();
      const taskData = await taskRes.json();

      if (Array.isArray(wsData) && wsData.length > 0) {
        setWorkspaces(wsData);
        setActiveWorkspaceId(wsData[0].id);
        if (Array.isArray(taskData)) {
          setTasks(taskData);
        }
        setMode('app');

        // ログイン時: 未読メンションスキャン + 既存タスクのスレッドリフレッシュ（並行実行）
        setScanning(true);
        Promise.all([
          fetch('/api/slack/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }).catch(() => null),
          fetch('/api/slack/refresh', { method: 'POST' }).catch(() => null),
        ])
          .then(() => fetch('/api/tasks', { cache: 'no-store' }))
          .then((res) => res.json())
          .then((tasks) => {
            if (Array.isArray(tasks)) {
              setTasks(tasks);
            }
          })
          .catch(() => {})
          .finally(() => setScanning(false));
      } else {
        setMode('setup');
      }
    } catch {
      setMode('setup');
    }
  }, [setWorkspaces, setActiveWorkspaceId, setTasks]);

  // 認証チェック → データロード
  const checkAuthAndLoad = useCallback(async () => {
    try {
      const authRes = await fetch('/api/auth/status');
      if (authRes.ok) {
        const authData = await authRes.json();
        if (!authData.authenticated) {
          setMode('login');
          return;
        }
      }
    } catch {
      setMode('login');
      return;
    }

    await loadData();
  }, [loadData]);

  useEffect(() => {
    checkAuthAndLoad();
  }, [checkAuthAndLoad]);

  // リアルタイム更新: SSE（useTaskSync フック）
  useTaskSync({ enabled: mode === 'app' });

  if (mode === 'loading') {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center">
        <div className="text-gray-400 font-mono">Loading...</div>
      </div>
    );
  }

  if (mode === 'login') {
    return <LoginScreen onLogin={() => loadData()} />;
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
      <Header
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onChangeWorkspace={setActiveWorkspaceId}
        onOpenSettings={() => setMode('setup')}
        onLogout={async () => {
          await signOut({ callbackUrl: '/' });
        }}
        session={session}
        scanning={scanning}
      />
      <MainContent />
    </div>
  );
}

function MainContent() {
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const activeChannelName = useAppStore((s) => s.activeChannelName);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);

  return (
    <div className="flex flex-1 overflow-hidden">
      <TaskBoard />
      {activeChannelId && activeWorkspaceId ? (
        <ChannelView
          workspaceId={activeWorkspaceId}
          channelId={activeChannelId}
          channelName={activeChannelName || activeChannelId}
        />
      ) : (
        <WindowManager />
      )}
    </div>
  );
}

function Header({
  workspaces,
  activeWorkspaceId,
  onChangeWorkspace,
  onOpenSettings,
  onLogout,
  session,
  scanning,
}: {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  onChangeWorkspace: (id: string) => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  session?: { user?: { name?: string | null; image?: string | null } } | null;
  scanning?: boolean;
}) {
  const openCount = useAppStore((s) => s.tasks.filter((t) => t.status === 'open').length);

  return (
    <header className="h-11 bg-[#1A1D27] border-b border-white/10 flex items-center px-4 shrink-0">
      <div className="flex items-center gap-2 mr-6">
        <div className="w-2 h-2 rounded-full bg-[#2ECC71] animate-pulse-dot" title="接続中" />
        {scanning && (
          <span className="text-[10px] text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded animate-pulse">
            スキャン中...
          </span>
        )}
        <h1 className="text-sm font-bold text-white tracking-wide">
          Slack Multi-Window
        </h1>
        {openCount > 0 && (
          <span className="text-[10px] bg-[#E74C3C] text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
            {openCount}
          </span>
        )}
      </div>

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

      <div className="ml-auto flex items-center gap-1">
        <SearchBar />

        <a
          href="/memo"
          className="text-gray-500 hover:text-gray-300 transition p-1 rounded hover:bg-white/5"
          title="プロジェクトメモ"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </a>

        {session?.user && (
          <div className="flex items-center gap-2 mr-1 ml-1">
            {session.user.image && (
              <img
                src={session.user.image}
                alt=""
                className="w-6 h-6 rounded-full"
                referrerPolicy="no-referrer"
              />
            )}
            <span className="text-xs text-gray-400">
              {session.user.name}
            </span>
          </div>
        )}

        <button
          onClick={onOpenSettings}
          className="text-gray-500 hover:text-gray-300 transition p-1 rounded hover:bg-white/5"
          title="設定"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </button>
        <button
          onClick={onLogout}
          className="text-gray-500 hover:text-gray-300 transition p-1 rounded hover:bg-white/5"
          title="ログアウト"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </header>
  );
}
