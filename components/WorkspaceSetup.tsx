'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Workspace } from '@/types';

interface WorkspaceSetupProps {
  onComplete: () => void;
}

export default function WorkspaceSetup({ onComplete }: WorkspaceSetupProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [testResults, setTestResults] = useState<Record<string, 'testing' | 'ok' | 'fail'>>({});
  const [joinResults, setJoinResults] = useState<Record<string, { status: 'joining' | 'done' | 'fail'; message?: string }>>({});

  // フォーム
  const [name, setName] = useState('');
  const [botToken, setBotToken] = useState('');
  const [signingSecret, setSigningSecret] = useState('');
  const [appToken, setAppToken] = useState('');
  const [userToken, setUserToken] = useState('');
  const [targetUserId, setTargetUserId] = useState('');

  const fetchWorkspaces = useCallback(async () => {
    try {
      const res = await fetch('/api/workspaces');
      const data = await res.json();
      if (Array.isArray(data)) setWorkspaces(data);
    } catch {
      console.error('Failed to fetch workspaces');
    }
  }, []);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          botToken,
          signingSecret,
          appToken: appToken || undefined,
          userToken: userToken || undefined,
          targetUserId: targetUserId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to add workspace');
        return;
      }
      setName('');
      setBotToken('');
      setSigningSecret('');
      setAppToken('');
      setUserToken('');
      setTargetUserId('');
      setShowForm(false);
      await fetchWorkspaces();
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このワークスペースを削除しますか？')) return;
    try {
      await fetch(`/api/workspaces?id=${id}`, { method: 'DELETE' });
      await fetchWorkspaces();
    } catch {
      console.error('Failed to delete workspace');
    }
  };

  const handleTest = async (ws: Workspace) => {
    setTestResults((prev) => ({ ...prev, [ws.id]: 'testing' }));
    try {
      const res = await fetch('/api/workspaces/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: ws.id }),
      });
      setTestResults((prev) => ({ ...prev, [ws.id]: res.ok ? 'ok' : 'fail' }));
    } catch {
      setTestResults((prev) => ({ ...prev, [ws.id]: 'fail' }));
    }
  };

  const handleJoinAllChannels = async (ws: Workspace) => {
    setJoinResults((prev) => ({ ...prev, [ws.id]: { status: 'joining' } }));
    try {
      const res = await fetch('/api/slack/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: ws.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setJoinResults((prev) => ({
          ...prev,
          [ws.id]: {
            status: 'done',
            message: `${data.joined?.length || 0}ch参加, ${data.alreadyIn?.length || 0}ch参加済み`,
          },
        }));
      } else {
        setJoinResults((prev) => ({ ...prev, [ws.id]: { status: 'fail', message: data.error } }));
      }
    } catch {
      setJoinResults((prev) => ({ ...prev, [ws.id]: { status: 'fail' } }));
    }
  };

  return (
    <div className="min-h-screen bg-[#0F1117] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <h1 className="text-3xl font-bold text-white mb-2 font-mono">
          Slack Multi-Window
        </h1>
        <p className="text-gray-400 mb-8 font-mono text-sm">
          ワークスペースを設定して、タスク管理を開始しましょう
        </p>

        {/* ワークスペース一覧 */}
        <div className="space-y-3 mb-6">
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              className="bg-[#1A1D27] border border-white/10 rounded-lg p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-white font-mono font-semibold">{ws.name}</span>
                    <span className="text-xs text-gray-500 font-mono">
                      Team: {ws.teamId || 'N/A'}
                    </span>
                    {ws.isActive && (
                      <span className="text-xs bg-[#2ECC71]/20 text-[#2ECC71] px-2 py-0.5 rounded">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 font-mono mt-1 flex gap-3">
                    <span>Bot: {ws.botToken}</span>
                    {ws.userToken && <span className="text-[#F39C12]">User Token: {ws.userToken}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleTest(ws)}
                    className="text-xs px-3 py-1.5 rounded bg-[#4A9EFF]/20 text-[#4A9EFF] hover:bg-[#4A9EFF]/30 transition font-mono"
                  >
                    {testResults[ws.id] === 'testing'
                      ? '...'
                      : testResults[ws.id] === 'ok'
                      ? '✅ OK'
                      : testResults[ws.id] === 'fail'
                      ? '❌ Fail'
                      : '接続テスト'}
                  </button>
                  <button
                    onClick={() => handleDelete(ws.id)}
                    className="text-xs px-3 py-1.5 rounded bg-[#E74C3C]/20 text-[#E74C3C] hover:bg-[#E74C3C]/30 transition font-mono"
                  >
                    削除
                  </button>
                </div>
              </div>

              {/* 全チャンネル参加ボタン */}
              <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-3">
                <button
                  onClick={() => handleJoinAllChannels(ws)}
                  disabled={joinResults[ws.id]?.status === 'joining'}
                  className="text-xs px-3 py-1.5 rounded bg-[#2ECC71]/20 text-[#2ECC71] hover:bg-[#2ECC71]/30 transition font-mono disabled:opacity-50"
                >
                  {joinResults[ws.id]?.status === 'joining' ? '参加中...' : '全チャンネルに参加'}
                </button>
                {joinResults[ws.id]?.status === 'done' && (
                  <span className="text-[10px] text-gray-400 font-mono">
                    ✅ {joinResults[ws.id].message}
                  </span>
                )}
                {joinResults[ws.id]?.status === 'fail' && (
                  <span className="text-[10px] text-[#E74C3C] font-mono">
                    ❌ {joinResults[ws.id].message || '失敗'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 追加フォーム */}
        {showForm ? (
          <form
            onSubmit={handleAdd}
            className="bg-[#1E2235] border border-white/10 rounded-lg p-6 space-y-4"
          >
            <h2 className="text-white font-mono font-semibold mb-2">
              ワークスペースを追加
            </h2>

            {error && (
              <div className="text-[#E74C3C] text-sm font-mono bg-[#E74C3C]/10 p-3 rounded">
                {error}
              </div>
            )}

            <div>
              <label className="block text-gray-400 text-xs font-mono mb-1">
                ワークスペース名
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Workspace"
                required
                className="w-full bg-[#0F1117] border border-white/10 rounded px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-[#4A9EFF] transition"
              />
            </div>

            <div>
              <label className="block text-gray-400 text-xs font-mono mb-1">
                Bot Token (xoxb-...)
              </label>
              <input
                type="password"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="xoxb-..."
                required
                className="w-full bg-[#0F1117] border border-white/10 rounded px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-[#4A9EFF] transition"
              />
            </div>

            <div>
              <label className="block text-gray-400 text-xs font-mono mb-1">
                Signing Secret
              </label>
              <input
                type="password"
                value={signingSecret}
                onChange={(e) => setSigningSecret(e.target.value)}
                placeholder="your_signing_secret"
                required
                className="w-full bg-[#0F1117] border border-white/10 rounded px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-[#4A9EFF] transition"
              />
            </div>

            <div>
              <label className="block text-gray-400 text-xs font-mono mb-1">
                App Token (xapp-... / 任意 / Socket Mode用)
              </label>
              <input
                type="password"
                value={appToken}
                onChange={(e) => setAppToken(e.target.value)}
                placeholder="xapp-..."
                className="w-full bg-[#0F1117] border border-white/10 rounded px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-[#4A9EFF] transition"
              />
            </div>

            <div>
              <label className="block text-gray-400 text-xs font-mono mb-1">
                User Token (xoxp-... / 任意 / 自分として返信する場合)
              </label>
              <input
                type="password"
                value={userToken}
                onChange={(e) => setUserToken(e.target.value)}
                placeholder="xoxp-..."
                className="w-full bg-[#0F1117] border border-white/10 rounded px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-[#4A9EFF] transition"
              />
              <p className="text-gray-600 text-[10px] font-mono mt-1">
                設定すると返信がBot名ではなくあなた自身の名前で投稿されます。Slack App設定 → OAuth &amp; Permissions → User Token Scopes に chat:write を追加後、再インストールして取得
              </p>
            </div>

            <div>
              <label className="block text-gray-400 text-xs font-mono mb-1">
                監視対象ユーザーID (U...)
              </label>
              <input
                type="text"
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                placeholder="U11NGQDSP"
                className="w-full bg-[#0F1117] border border-white/10 rounded px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-[#4A9EFF] transition"
              />
              <p className="text-gray-600 text-[10px] font-mono mt-1">
                このユーザーへのメンションをタスク化します。Slackプロフィール → &quot;...&quot; → Copy member ID で取得
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-[#4A9EFF] text-white rounded font-mono text-sm hover:bg-[#4A9EFF]/80 transition disabled:opacity-50"
              >
                {loading ? '追加中...' : '追加'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setError('');
                }}
                className="px-4 py-2 bg-white/10 text-gray-300 rounded font-mono text-sm hover:bg-white/20 transition"
              >
                キャンセル
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="w-full py-3 border border-dashed border-white/20 rounded-lg text-gray-400 hover:text-white hover:border-[#4A9EFF] transition font-mono text-sm"
          >
            + ワークスペースを追加
          </button>
        )}

        {/* アプリ開始ボタン */}
        {workspaces.length > 0 && (
          <button
            onClick={onComplete}
            className="w-full mt-6 py-3 bg-[#4A9EFF] text-white rounded-lg font-mono font-semibold hover:bg-[#4A9EFF]/80 transition text-sm"
          >
            アプリを開始
          </button>
        )}
      </div>
    </div>
  );
}
