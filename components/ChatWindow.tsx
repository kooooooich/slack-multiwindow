'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import MessageComposer from './MessageComposer';
import type { MessageComposerHandle } from './MessageComposer';
import AiAssistPanel from './AiAssistPanel';
import SlackMessageText from './SlackMessageText';
import EmojiPicker from './EmojiPicker';
import FileAttachment from './FileAttachment';
import ChannelBrowser from './ChannelBrowser';
import { resolveEmoji } from '@/lib/mrkdwn';
import type { Task, SlackMessage } from '@/types';

// メモ化されたメッセージリストコンポーネント
interface MessageListProps {
  messages: SlackMessage[];
  emojiPickerMsgTs: string | null;
  setEmojiPickerMsgTs: (ts: string | null) => void;
  handleReactionAdd: (msg: SlackMessage, emojiName: string) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  customEmojis?: Record<string, string>;
  workspaceId?: string;
}

const MessageList = React.memo(function MessageList({
  messages,
  emojiPickerMsgTs,
  setEmojiPickerMsgTs,
  handleReactionAdd,
  messagesEndRef,
  customEmojis,
  workspaceId,
}: MessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {messages.map((msg, i) => (
        <div key={msg.id || i} className="flex gap-2 group relative">
          {/* アバター */}
          {msg.avatarUrl ? (
            <img
              src={msg.avatarUrl}
              alt={msg.userName}
              className="w-8 h-8 rounded shrink-0 mt-0.5"
            />
          ) : (
            <div className="w-8 h-8 rounded bg-[#4A9EFF]/20 flex items-center justify-center text-[10px] text-[#4A9EFF] shrink-0 mt-0.5">
              {(msg.userName || '??').slice(0, 2).toUpperCase()}
            </div>
          )}

          {/* メッセージ内容 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold text-gray-300">
                {msg.userName}
              </span>
              <span className="text-[10px] text-gray-600">
                {formatSlackTs(msg.ts)}
              </span>
            </div>
            <SlackMessageText text={msg.text} customEmojis={customEmojis} />

            {/* ファイル添付表示 */}
            {msg.files && msg.files.length > 0 && (
              <FileAttachment files={msg.files} workspaceId={msg.workspaceId} />
            )}

            {/* リアクション表示 */}
            {msg.reactions && msg.reactions.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {msg.reactions.map((reaction) => {
                  const resolved = resolveEmoji(reaction.name, customEmojis);
                  return (
                    <span
                      key={reaction.name}
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] bg-white/5 border border-white/10 text-gray-400"
                      title={`:${reaction.name}: (${reaction.count})`}
                    >
                      <span>
                        {resolved?.type === 'unicode' ? resolved.value :
                         resolved?.type === 'custom' ? <img src={resolved.url} alt={`:${reaction.name}:`} className="inline-block w-4 h-4" /> :
                         `:${reaction.name}:`}
                      </span>
                      <span className="text-gray-500">{reaction.count}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* リアクション追加ボタン（ホバー時表示） */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEmojiPickerMsgTs(emojiPickerMsgTs === msg.ts ? null : msg.ts);
            }}
            className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center rounded bg-[#1A1D27] hover:bg-white/10 text-gray-500 hover:text-gray-300 text-xs border border-white/10"
            title="リアクションを追加"
          >
            <span className="text-[11px]">{'\u{1F642}'}</span>
          </button>

          {/* 絵文字ピッカー */}
          {emojiPickerMsgTs === msg.ts && (
            <EmojiPicker
              onSelect={(emojiName) => handleReactionAdd(msg, emojiName)}
              onClose={() => setEmojiPickerMsgTs(null)}
              workspaceId={workspaceId}
              customEmojis={customEmojis}
            />
          )}
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
});

interface ChatWindowProps {
  task: Task;
  isFocused: boolean;
  zIndex: number;
}

export default function ChatWindow({ task, isFocused, zIndex }: ChatWindowProps) {
  const closeWindow = useAppStore((s) => s.closeWindow);
  const minimizeWindow = useAppStore((s) => s.minimizeWindow);
  const focusWindow = useAppStore((s) => s.focusWindow);
  const updateWindowPosition = useAppStore((s) => s.updateWindowPosition);
  const updateWindowSize = useAppStore((s) => s.updateWindowSize);
  const updateTask = useAppStore((s) => s.updateTask);
  const workspaces = useAppStore((s) => s.workspaces);
  const wsName = workspaces.find((w) => w.id === task.workspaceId)?.name || '';

  const windowRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<MessageComposerHandle>(null);
  const [pos, setPos] = useState(task.windowPosition);
  const [size, setSize] = useState(task.windowSize);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [emojiPickerMsgTs, setEmojiPickerMsgTs] = useState<string | null>(null);
  // タブ管理: 'thread' | channelId
  const [activeTab, setActiveTab] = useState<string>('thread');
  // 関連チャンネル名のキャッシュ
  const [channelNames, setChannelNames] = useState<Record<string, string>>({});
  const dragOffset = useRef({ x: 0, y: 0 });
  const posRef = useRef(pos);
  const sizeRef = useRef(size);
  posRef.current = pos;
  sizeRef.current = size;

  // 関連チャンネル名を取得
  useEffect(() => {
    const relatedChannels = task.relatedChannels || [];
    const unknownIds = relatedChannels.filter((id) => !channelNames[id]);
    if (unknownIds.length === 0) return;

    fetch(`/api/slack/channels?workspaceId=${task.workspaceId}`)
      .then((res) => res.json())
      .then((channels: { id: string; name: string }[]) => {
        const nameMap: Record<string, string> = {};
        for (const ch of channels) {
          if (unknownIds.includes(ch.id)) {
            nameMap[ch.id] = ch.name;
          }
        }
        setChannelNames((prev) => ({ ...prev, ...nameMap }));
      })
      .catch(() => {});
  }, [task.relatedChannels, task.workspaceId, channelNames]);

  // タブが削除された関連チャンネルを指している場合はスレッドに戻す
  useEffect(() => {
    if (activeTab !== 'thread' && !(task.relatedChannels || []).includes(activeTab)) {
      setActiveTab('thread');
    }
  }, [task.relatedChannels, activeTab]);

  // 新しいメッセージが来たらスクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [task.threadMessages.length]);

  // ドラッグ開始
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      focusWindow(task.id);
      setIsDragging(true);
      dragOffset.current = {
        x: e.clientX - pos.x,
        y: e.clientY - pos.y,
      };
    },
    [focusWindow, task.id, pos],
  );

  // リサイズ開始
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      focusWindow(task.id);
      setIsResizing(true);
      dragOffset.current = {
        x: e.clientX,
        y: e.clientY,
      };
    },
    [focusWindow, task.id],
  );

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPos({
          x: e.clientX - dragOffset.current.x,
          y: e.clientY - dragOffset.current.y,
        });
      } else if (isResizing) {
        const dx = e.clientX - dragOffset.current.x;
        const dy = e.clientY - dragOffset.current.y;
        setSize((prev) => ({
          width: Math.max(350, prev.width + dx),
          height: Math.max(300, prev.height + dy),
        }));
        dragOffset.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        updateWindowPosition(task.id, posRef.current);
      }
      if (isResizing) {
        setIsResizing(false);
        updateWindowSize(task.id, sizeRef.current);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, task.id, updateWindowPosition, updateWindowSize]);

  // リアクション追加
  const handleReactionAdd = useCallback(async (msg: SlackMessage, emojiName: string) => {
    try {
      const res = await fetch('/api/slack/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: task.workspaceId,
          channelId: task.channelId,
          threadTs: task.threadTs,
          messageTs: msg.ts,
          emojiName,
          action: 'add',
        }),
      });
      const data = await res.json();
      if (data.updatedMessages) {
        updateTask(task.id, { threadMessages: data.updatedMessages });
      }
    } catch {
      // ignore
    }
  }, [task.workspaceId, task.channelId, task.threadTs, task.id, updateTask]);

  const messages = task.threadMessages.length > 0
    ? task.threadMessages
    : [task.triggerMessage];

  return (
    <div
      ref={windowRef}
      className="absolute flex flex-col rounded-lg overflow-hidden"
      style={{
        left: pos.x,
        top: pos.y,
        width: size.width,
        height: size.height,
        zIndex,
        border: '1px solid',
        borderColor: isFocused ? '#4A9EFF' : 'rgba(255,255,255,0.1)',
        backdropFilter: 'blur(12px)',
        boxShadow: isFocused
          ? '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(74,158,255,0.3)'
          : '0 20px 60px rgba(0,0,0,0.5)',
        background: '#1E2235',
      }}
      onMouseDown={() => focusWindow(task.id)}
    >
      {/* ヘッダー */}
      <div
        className="h-9 bg-[#161929] flex items-center px-3 cursor-move shrink-0 select-none"
        onMouseDown={handleDragStart}
      >
        <div className="flex-1 text-xs text-gray-300 truncate">
          {wsName && (
            <span className="text-gray-500 mr-1.5">{wsName}</span>
          )}
          <span className="text-[#4A9EFF]">#</span>
          {task.channelName}
          {task.status === 'completed' && (
            <span className="ml-2 text-[10px] text-[#2ECC71] bg-[#2ECC71]/10 px-1.5 py-0.5 rounded">&#10003; 完了</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => minimizeWindow(task.id)}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition text-xs"
            title="最小化"
          >
            &#8211;
          </button>
          <button
            onClick={() => closeWindow(task.id)}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#E74C3C]/30 text-gray-500 hover:text-[#E74C3C] transition text-xs"
            title="閉じる"
          >
            &#10005;
          </button>
        </div>
      </div>

      {/* 関連チャンネルタブバー */}
      {(task.relatedChannels || []).length > 0 && (
        <div className="flex items-center bg-[#161929] border-b border-white/5 px-2 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('thread')}
            className={`px-2.5 py-1.5 text-[10px] whitespace-nowrap transition border-b-2 ${
              activeTab === 'thread'
                ? 'text-[#4A9EFF] border-[#4A9EFF]'
                : 'text-gray-500 border-transparent hover:text-gray-400 hover:border-white/10'
            }`}
          >
            スレッド
          </button>
          {(task.relatedChannels || []).map((chId) => (
            <button
              key={chId}
              onClick={() => setActiveTab(chId)}
              className={`px-2.5 py-1.5 text-[10px] whitespace-nowrap transition border-b-2 ${
                activeTab === chId
                  ? 'text-orange-400 border-orange-400'
                  : 'text-gray-500 border-transparent hover:text-gray-400 hover:border-white/10'
              }`}
            >
              #{channelNames[chId] || chId.slice(0, 6)}
            </button>
          ))}
        </div>
      )}

      {/* コンテンツエリア */}
      {activeTab === 'thread' ? (
        <>
          {/* メッセージ表示エリア */}
          <MessageList
            messages={messages}
            emojiPickerMsgTs={emojiPickerMsgTs}
            setEmojiPickerMsgTs={setEmojiPickerMsgTs}
            handleReactionAdd={handleReactionAdd}
            messagesEndRef={messagesEndRef}
            workspaceId={task.workspaceId}
          />

          {/* 返信エリア */}
          {task.status === 'open' && (
            <MessageComposer
              ref={composerRef}
              task={task}
              onAiAssist={() => setShowAiPanel(!showAiPanel)}
            />
          )}

          {/* AI補助パネル */}
          {showAiPanel && task.status === 'open' && (
            <AiAssistPanel
              task={task}
              onUseSuggestion={(text) => {
                composerRef.current?.setReplyText(text);
                setShowAiPanel(false);
              }}
            />
          )}
        </>
      ) : (
        /* 関連チャンネルブラウザ */
        <ChannelBrowser
          workspaceId={task.workspaceId}
          channelId={activeTab}
          channelName={channelNames[activeTab] || activeTab.slice(0, 6)}
        />
      )}

      {/* リサイズハンドル */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
        onMouseDown={handleResizeStart}
        style={{
          background:
            'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.15) 50%)',
        }}
      />
    </div>
  );
}

function formatSlackTs(ts: string): string {
  try {
    const unixTs = parseFloat(ts);
    if (!isNaN(unixTs) && unixTs > 1000000000) {
      return new Date(unixTs * 1000).toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return new Date(ts).toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

