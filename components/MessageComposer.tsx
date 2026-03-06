'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import type { Task } from '@/types';

interface MessageComposerProps {
  task: Task;
  onAiAssist: () => void;
  replyText: string;
  setReplyText: (text: string) => void;
}

interface ChannelOption {
  id: string;
  name: string;
}

export default function MessageComposer({
  task,
  onAiAssist,
  replyText,
  setReplyText,
}: MessageComposerProps) {
  const [sending, setSending] = useState(false);
  const completeTask = useAppStore((s) => s.completeTask);
  const updateTaskStore = useAppStore((s) => s.updateTask);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 関連チャネル
  const [showChannelDropdown, setShowChannelDropdown] = useState(false);
  const [showChannelSearch, setShowChannelSearch] = useState(false);
  const [channelSearchQuery, setChannelSearchQuery] = useState('');
  const [allChannels, setAllChannels] = useState<ChannelOption[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [selectedCrossPostChannel, setSelectedCrossPostChannel] = useState<string | null>(null);

  const relatedChannels = task.relatedChannels || [];

  // テキストエリアの高さを自動調整
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 100) + 'px';
    }
  }, [replyText]);

  const fetchChannels = useCallback(async () => {
    if (allChannels.length > 0) return;
    setLoadingChannels(true);
    try {
      const res = await fetch(`/api/slack/channels?workspaceId=${task.workspaceId}`);
      if (res.ok) {
        const data = await res.json();
        setAllChannels(data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingChannels(false);
    }
  }, [allChannels.length, task.workspaceId]);

  const handleSend = async () => {
    if (!replyText.trim() || sending) return;
    setSending(true);

    try {
      // スレッド返信
      const res = await fetch('/api/slack/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: task.workspaceId,
          channelId: task.channelId,
          text: replyText.trim(),
          threadTs: task.threadTs,
        }),
      });

      // 関連チャネルにも投稿
      if (selectedCrossPostChannel) {
        await fetch('/api/slack/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId: task.workspaceId,
            channelId: selectedCrossPostChannel,
            text: replyText.trim(),
          }),
        });
      }

      if (res.ok) {
        setReplyText('');
        setSelectedCrossPostChannel(null);
        await refreshThread();
      }
    } catch (error) {
      console.error('Failed to send:', error);
    } finally {
      setSending(false);
    }
  };

  const handleComplete = async () => {
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: task.id,
        status: 'completed',
        completedAt: new Date().toISOString(),
      }),
    });
    completeTask(task.id);
  };

  const refreshThread = async () => {
    try {
      const res = await fetch('/api/tasks');
      if (res.ok) {
        const tasks = await res.json();
        const updated = tasks.find((t: Task) => t.id === task.id);
        if (updated) {
          updateTaskStore(task.id, { threadMessages: updated.threadMessages });
        }
      }
    } catch {
      // ignore
    }
  };

  const addRelatedChannel = async (channelId: string) => {
    if (relatedChannels.includes(channelId)) return;
    const updated = [...relatedChannels, channelId];
    updateTaskStore(task.id, { relatedChannels: updated });
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: task.id, relatedChannels: updated }),
    });
    setShowChannelSearch(false);
    setChannelSearchQuery('');
  };

  const removeRelatedChannel = async (channelId: string) => {
    const updated = relatedChannels.filter((id) => id !== channelId);
    updateTaskStore(task.id, { relatedChannels: updated });
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: task.id, relatedChannels: updated }),
    });
    if (selectedCrossPostChannel === channelId) {
      setSelectedCrossPostChannel(null);
    }
  };

  const getChannelName = (id: string) => {
    const ch = allChannels.find((c) => c.id === id);
    return ch ? ch.name : id;
  };

  const filteredChannels = allChannels.filter(
    (ch) =>
      ch.name.toLowerCase().includes(channelSearchQuery.toLowerCase()) &&
      !relatedChannels.includes(ch.id) &&
      ch.id !== task.channelId,
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-white/5 p-2 shrink-0">
      <textarea
        ref={textareaRef}
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="返信を入力... (Cmd+Enter で送信)"
        rows={1}
        className="w-full bg-[#0F1117] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white placeholder-gray-600 resize-none focus:outline-none focus:border-[#4A9EFF] transition"
      />

      {/* 関連チャネルタグ表示 */}
      {relatedChannels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {relatedChannels.map((chId) => (
            <span
              key={chId}
              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400"
            >
              #{getChannelName(chId)}
              <button
                onClick={() => removeRelatedChannel(chId)}
                className="text-gray-600 hover:text-[#E74C3C] transition"
              >
                &#10005;
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5 mt-1.5">
        <button
          onClick={onAiAssist}
          className="px-2 py-1 text-[10px] rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition"
        >
          AI補助
        </button>

        {/* 関連チャネル投稿ドロップダウン */}
        <div className="relative">
          <button
            onClick={() => {
              setShowChannelDropdown(!showChannelDropdown);
              fetchChannels();
            }}
            className={`px-2 py-1 text-[10px] rounded transition ${
              selectedCrossPostChannel
                ? 'bg-orange-500/20 text-orange-400'
                : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-400'
            }`}
          >
            {selectedCrossPostChannel
              ? `#${getChannelName(selectedCrossPostChannel)}にも投稿`
              : '関連Ch投稿'}
          </button>

          {showChannelDropdown && (
            <div className="absolute bottom-full left-0 mb-1 w-56 bg-[#1A1D27] border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden">
              {/* チャネル追加 */}
              <div className="p-2 border-b border-white/5">
                <button
                  onClick={() => {
                    setShowChannelSearch(!showChannelSearch);
                    fetchChannels();
                  }}
                  className="w-full text-left text-[10px] text-[#4A9EFF] hover:text-[#4A9EFF]/80 transition"
                >
                  + チャネルを追加
                </button>
              </div>

              {showChannelSearch && (
                <div className="p-2 border-b border-white/5">
                  <input
                    type="text"
                    value={channelSearchQuery}
                    onChange={(e) => setChannelSearchQuery(e.target.value)}
                    placeholder="チャネル名で検索..."
                    className="w-full bg-[#0F1117] border border-white/10 rounded px-2 py-1 text-[10px] text-white placeholder-gray-600 focus:outline-none focus:border-[#4A9EFF]"
                    autoFocus
                  />
                  <div className="max-h-32 overflow-y-auto mt-1">
                    {loadingChannels && (
                      <div className="text-[10px] text-gray-600 py-1">読み込み中...</div>
                    )}
                    {filteredChannels.slice(0, 10).map((ch) => (
                      <button
                        key={ch.id}
                        onClick={() => addRelatedChannel(ch.id)}
                        className="w-full text-left px-2 py-1 text-[10px] text-gray-400 hover:bg-white/5 rounded transition"
                      >
                        #{ch.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 投稿先なし */}
              <button
                onClick={() => {
                  setSelectedCrossPostChannel(null);
                  setShowChannelDropdown(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-[10px] transition ${
                  !selectedCrossPostChannel
                    ? 'text-white bg-white/5'
                    : 'text-gray-500 hover:bg-white/5'
                }`}
              >
                スレッド返信のみ
              </button>

              {/* 関連チャネル一覧 */}
              {relatedChannels.map((chId) => (
                <button
                  key={chId}
                  onClick={() => {
                    setSelectedCrossPostChannel(chId);
                    setShowChannelDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-[10px] transition ${
                    selectedCrossPostChannel === chId
                      ? 'text-orange-400 bg-orange-500/10'
                      : 'text-gray-400 hover:bg-white/5'
                  }`}
                >
                  #{getChannelName(chId)} にも投稿
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleSend}
          disabled={!replyText.trim() || sending}
          className="px-2 py-1 text-[10px] rounded bg-[#4A9EFF]/20 text-[#4A9EFF] hover:bg-[#4A9EFF]/30 transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {sending ? '送信中...' : '返信'}
        </button>
        <button
          onClick={handleComplete}
          className="px-2 py-1 text-[10px] rounded bg-[#2ECC71]/20 text-[#2ECC71] hover:bg-[#2ECC71]/30 transition ml-auto"
        >
          &#10003; 完了
        </button>
      </div>
    </div>
  );
}
