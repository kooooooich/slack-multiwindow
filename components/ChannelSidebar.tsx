'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import type { MonitoredChannel } from '@/types';

interface ChannelOption {
  id: string;
  name: string;
  type?: 'channel' | 'dm' | 'group_dm';
}

export default function ChannelSidebar() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const monitoredChannels = useAppStore((s) => s.monitoredChannels);
  const setMonitoredChannels = useAppStore((s) => s.setMonitoredChannels);
  const addMonitoredChannelToStore = useAppStore((s) => s.addMonitoredChannelToStore);
  const removeMonitoredChannelFromStore = useAppStore((s) => s.removeMonitoredChannelFromStore);
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const setActiveChannel = useAppStore((s) => s.setActiveChannel);

  const [showAddModal, setShowAddModal] = useState(false);
  const [allChannels, setAllChannels] = useState<ChannelOption[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // 監視チャネルを取得
  useEffect(() => {
    if (!activeWorkspaceId) return;
    fetch(`/api/channels/monitored?workspaceId=${activeWorkspaceId}`)
      .then((res) => res.json())
      .then((data: MonitoredChannel[]) => {
        if (Array.isArray(data)) setMonitoredChannels(data);
      })
      .catch(() => {});
  }, [activeWorkspaceId, setMonitoredChannels]);

  // Slack全チャネル取得
  const fetchAllChannels = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/slack/channels?workspaceId=${activeWorkspaceId}`);
      if (res.ok) {
        const data = await res.json();
        setAllChannels(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId]);

  const handleAdd = async (ch: ChannelOption) => {
    if (!activeWorkspaceId) return;
    try {
      const res = await fetch('/api/channels/monitored', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspaceId,
          channelId: ch.id,
          channelName: ch.name,
          channelType: ch.type || 'channel',
        }),
      });
      if (res.ok) {
        const added = await res.json();
        addMonitoredChannelToStore(added);
      }
    } catch {
      // ignore
    }
  };

  const handleRemove = async (channelId: string) => {
    if (!activeWorkspaceId) return;
    try {
      await fetch(`/api/channels/monitored?workspaceId=${activeWorkspaceId}&channelId=${channelId}`, {
        method: 'DELETE',
      });
      removeMonitoredChannelFromStore(channelId);
      if (activeChannelId === channelId) {
        setActiveChannel(null);
      }
    } catch {
      // ignore
    }
  };

  const monitoredIds = monitoredChannels.map((c) => c.channelId);
  const filteredChannels = allChannels.filter(
    (ch) =>
      ch.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !monitoredIds.includes(ch.id),
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-3 py-2 flex items-center justify-between">
        <span className="text-xs text-gray-400 uppercase tracking-wider">チャネル</span>
        <button
          onClick={() => {
            setShowAddModal(!showAddModal);
            if (!showAddModal) fetchAllChannels();
          }}
          className="text-[#4A9EFF] hover:text-[#4A9EFF]/80 transition text-sm"
          title="チャネルを追加"
        >
          +
        </button>
      </div>

      {/* 追加モーダル */}
      {showAddModal && (
        <div className="mx-2 mb-2 p-2 rounded bg-[#0F1117] border border-white/10">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="チャネル名で検索..."
            className="w-full bg-[#161929] border border-white/10 rounded px-2 py-1 text-[10px] text-white placeholder-gray-600 focus:outline-none focus:border-[#4A9EFF] mb-1"
            autoFocus
          />
          <div className="max-h-40 overflow-y-auto">
            {loading && <div className="text-[10px] text-gray-600 py-1">読み込み中...</div>}
            {!loading && filteredChannels.length === 0 && (
              <div className="text-[10px] text-gray-600 py-1">
                {searchQuery ? '一致するチャネルがありません' : 'チャネルなし'}
              </div>
            )}
            {filteredChannels.slice(0, 15).map((ch) => (
              <button
                key={ch.id}
                onClick={() => handleAdd(ch)}
                className="w-full text-left px-2 py-1 text-[10px] text-gray-400 hover:bg-white/5 rounded transition"
              >
                {ch.type === 'dm' ? '\u{1F4AC} ' : ch.type === 'group_dm' ? '\u{1F465} ' : '#'}
                {ch.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* チャネルリスト */}
      <div className="space-y-0.5 p-1">
        {monitoredChannels.length === 0 && !showAddModal && (
          <div className="text-xs text-gray-600 px-3 py-4 text-center">
            チャネルを追加してください
          </div>
        )}
        {monitoredChannels.map((ch) => (
          <button
            key={ch.channelId}
            onClick={() => setActiveChannel(ch.channelId, ch.channelName)}
            onMouseEnter={() => setHoveredId(ch.channelId)}
            onMouseLeave={() => setHoveredId(null)}
            className={`w-full text-left px-3 py-2 rounded text-xs transition hover:bg-white/5 flex items-center justify-between ${
              activeChannelId === ch.channelId
                ? 'bg-[#4A9EFF]/10 border-l-2 border-[#4A9EFF]'
                : 'border-l-2 border-transparent'
            }`}
          >
            <span className="truncate">
              <span className="text-[#4A9EFF]">#</span>
              <span className="text-gray-300 ml-0.5">{ch.channelName}</span>
            </span>
            {hoveredId === ch.channelId && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(ch.channelId);
                }}
                className="text-gray-600 hover:text-[#E74C3C] transition text-[10px] shrink-0"
              >
                &#10005;
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
