'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import SlackMessageText from './SlackMessageText';
import FileAttachment from './FileAttachment';
import { resolveEmoji } from '@/lib/mrkdwn';
import type { SlackMessage } from '@/types';

interface ChannelBrowserProps {
  workspaceId: string;
  channelId: string;
  channelName: string;
  customEmojis?: Record<string, string>;
}

const ChannelBrowser = React.memo(function ChannelBrowser({
  workspaceId,
  channelId,
  channelName,
  customEmojis,
}: ChannelBrowserProps) {
  const [messages, setMessages] = useState<SlackMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [postText, setPostText] = useState('');
  const [posting, setPosting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevChannelIdRef = useRef(channelId);

  // メッセージ取得
  const fetchMessages = useCallback(async (cursor?: string) => {
    try {
      const params = new URLSearchParams({
        workspaceId,
        channelId,
      });
      if (cursor) params.set('cursor', cursor);

      const res = await fetch(`/api/slack/channels/messages?${params}`);
      if (!res.ok) return;

      const data = await res.json();
      if (cursor) {
        // 過去メッセージの追加（conversations.history は新しい順で返る）
        setMessages((prev) => [...prev, ...data.messages]);
      } else {
        // 初回取得（新しい順で返ってくるので反転して古い順にする）
        setMessages(data.messages.reverse());
      }
      setNextCursor(data.nextCursor || undefined);
    } catch {
      // ignore
    }
  }, [workspaceId, channelId]);

  // 初回ロード
  useEffect(() => {
    setLoading(true);
    setMessages([]);
    setNextCursor(undefined);
    prevChannelIdRef.current = channelId;
    fetchMessages().finally(() => setLoading(false));
  }, [fetchMessages, channelId]);

  // 新しいメッセージが来たらスクロール
  useEffect(() => {
    if (!loadingMore) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, loadingMore]);

  // 過去メッセージの読み込み
  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const scrollEl = scrollContainerRef.current;
    const prevScrollHeight = scrollEl?.scrollHeight || 0;

    await fetchMessages(nextCursor);

    // スクロール位置を維持
    requestAnimationFrame(() => {
      if (scrollEl) {
        const newScrollHeight = scrollEl.scrollHeight;
        scrollEl.scrollTop = newScrollHeight - prevScrollHeight;
      }
    });
    setLoadingMore(false);
  }, [nextCursor, loadingMore, fetchMessages]);

  // スクロールで過去メッセージをロード
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (el.scrollTop < 50 && nextCursor && !loadingMore) {
      handleLoadMore();
    }
  }, [nextCursor, loadingMore, handleLoadMore]);

  // テキストエリアの高さ自動調整
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 80) + 'px';
    }
  }, [postText]);

  // チャンネルに投稿
  const handlePost = async () => {
    if (!postText.trim() || posting) return;
    setPosting(true);

    try {
      const res = await fetch('/api/slack/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          channelId,
          text: postText.trim(),
        }),
      });

      if (res.ok) {
        setPostText('');
        // 投稿後にメッセージを再取得
        setMessages([]);
        await fetchMessages();
      }
    } catch {
      // ignore
    } finally {
      setPosting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handlePost();
    }
  };

  // リフレッシュ
  const handleRefresh = useCallback(async () => {
    setMessages([]);
    setNextCursor(undefined);
    setLoading(true);
    await fetchMessages();
    setLoading(false);
  }, [fetchMessages]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-[10px] text-gray-600">
          #{channelName} を読み込み中...
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* メッセージ表示エリア */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-3 space-y-3"
        onScroll={handleScroll}
      >
        {/* 過去メッセージ読み込みボタン */}
        {nextCursor && (
          <div className="flex justify-center py-1">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="text-[10px] text-[#4A9EFF] hover:text-[#4A9EFF]/80 transition disabled:opacity-50"
            >
              {loadingMore ? '読み込み中...' : '過去のメッセージを表示'}
            </button>
          </div>
        )}

        {messages.length === 0 && !loading && (
          <div className="text-[10px] text-gray-600 text-center py-4">
            メッセージはありません
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={msg.id || i} className="flex gap-2 group relative">
            {/* アバター */}
            {msg.avatarUrl ? (
              <img
                src={msg.avatarUrl}
                alt={msg.userName}
                className="w-7 h-7 rounded shrink-0 mt-0.5"
              />
            ) : (
              <div className="w-7 h-7 rounded bg-[#4A9EFF]/20 flex items-center justify-center text-[9px] text-[#4A9EFF] shrink-0 mt-0.5">
                {(msg.userName || '??').slice(0, 2).toUpperCase()}
              </div>
            )}

            {/* メッセージ内容 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-semibold text-gray-300">
                  {msg.userName}
                </span>
                <span className="text-[10px] text-gray-600">
                  {formatSlackTs(msg.ts)}
                </span>
                {/* スレッド返信数の表示 */}
                {msg.threadTs && msg.threadTs !== msg.ts && (
                  <span className="text-[9px] text-[#4A9EFF]/60">
                    (スレッド内)
                  </span>
                )}
              </div>
              <SlackMessageText text={msg.text} customEmojis={customEmojis} />

              {/* ファイル添付 */}
              {msg.files && msg.files.length > 0 && (
                <FileAttachment files={msg.files} workspaceId={msg.workspaceId} />
              )}

              {/* リアクション */}
              {msg.reactions && msg.reactions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {msg.reactions.map((reaction) => {
                    const resolved = resolveEmoji(reaction.name, customEmojis);
                    return (
                      <span
                        key={reaction.name}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] bg-white/5 border border-white/10 text-gray-400"
                        title={`:${reaction.name}: (${reaction.count})`}
                      >
                        <span>
                          {resolved?.type === 'unicode' ? resolved.value :
                           resolved?.type === 'custom' ? <img src={resolved.url} alt={`:${reaction.name}:`} className="inline-block w-3.5 h-3.5" /> :
                           `:${reaction.name}:`}
                        </span>
                        <span className="text-gray-500">{reaction.count}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 投稿フォーム */}
      <div className="border-t border-white/5 p-2 shrink-0">
        <textarea
          ref={textareaRef}
          value={postText}
          onChange={(e) => setPostText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`#${channelName} に投稿... (Cmd+Enter)`}
          rows={1}
          className="w-full bg-[#0F1117] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white placeholder-gray-600 resize-none focus:outline-none focus:border-[#4A9EFF] transition"
        />
        <div className="flex items-center gap-1.5 mt-1">
          <button
            onClick={handleRefresh}
            className="px-2 py-1 text-[10px] rounded bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-400 transition"
            title="最新メッセージを取得"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={handlePost}
            disabled={!postText.trim() || posting}
            className="px-2 py-1 text-[10px] rounded bg-[#4A9EFF]/20 text-[#4A9EFF] hover:bg-[#4A9EFF]/30 transition disabled:opacity-30 disabled:cursor-not-allowed ml-auto"
          >
            {posting ? '送信中...' : '投稿'}
          </button>
        </div>
      </div>
    </div>
  );
});

function formatSlackTs(ts: string): string {
  try {
    const unixTs = parseFloat(ts);
    if (!isNaN(unixTs) && unixTs > 1000000000) {
      const date = new Date(unixTs * 1000);
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      if (isToday) {
        return date.toLocaleTimeString('ja-JP', {
          hour: '2-digit',
          minute: '2-digit',
        });
      }
      return date.toLocaleDateString('ja-JP', {
        month: 'short',
        day: 'numeric',
      }) + ' ' + date.toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return '';
  } catch {
    return '';
  }
}

export default ChannelBrowser;
