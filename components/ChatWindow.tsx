'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import MessageComposer from './MessageComposer';
import AiAssistPanel from './AiAssistPanel';
import type { Task, SlackMessage } from '@/types';

// よく使うSlack絵文字のプリセット
const COMMON_EMOJIS = [
  { name: 'thumbsup', emoji: '\u{1F44D}' },
  { name: 'thumbsdown', emoji: '\u{1F44E}' },
  { name: 'heart', emoji: '\u{2764}\u{FE0F}' },
  { name: 'eyes', emoji: '\u{1F440}' },
  { name: 'white_check_mark', emoji: '\u{2705}' },
  { name: 'rocket', emoji: '\u{1F680}' },
  { name: 'tada', emoji: '\u{1F389}' },
  { name: 'pray', emoji: '\u{1F64F}' },
  { name: 'fire', emoji: '\u{1F525}' },
  { name: 'thinking_face', emoji: '\u{1F914}' },
  { name: 'clap', emoji: '\u{1F44F}' },
  { name: 'smile', emoji: '\u{1F604}' },
] as const;

// emoji name -> Unicode マッピング
const emojiMap: Record<string, string> = {};
for (const e of COMMON_EMOJIS) {
  emojiMap[e.name] = e.emoji;
}
// エイリアス
emojiMap['+1'] = '\u{1F44D}';
emojiMap['-1'] = '\u{1F44E}';
emojiMap['heavy_check_mark'] = '\u{2714}\u{FE0F}';
emojiMap['100'] = '\u{1F4AF}';
emojiMap['ok_hand'] = '\u{1F44C}';
emojiMap['raised_hands'] = '\u{1F64C}';
emojiMap['muscle'] = '\u{1F4AA}';
emojiMap['star'] = '\u{2B50}';
emojiMap['sparkles'] = '\u{2728}';
emojiMap['wave'] = '\u{1F44B}';
emojiMap['laughing'] = '\u{1F606}';
emojiMap['joy'] = '\u{1F602}';
emojiMap['sweat_smile'] = '\u{1F605}';
emojiMap['sob'] = '\u{1F62D}';
emojiMap['skull'] = '\u{1F480}';
emojiMap['warning'] = '\u{26A0}\u{FE0F}';
emojiMap['bulb'] = '\u{1F4A1}';
emojiMap['memo'] = '\u{1F4DD}';

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
  const [pos, setPos] = useState(task.windowPosition);
  const [size, setSize] = useState(task.windowSize);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [emojiPickerMsgTs, setEmojiPickerMsgTs] = useState<string | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  // 新しいメッセージが来たらスクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [task.threadMessages.length]);

  // 絵文字ピッカー外クリックで閉じる
  useEffect(() => {
    if (!emojiPickerMsgTs) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setEmojiPickerMsgTs(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [emojiPickerMsgTs]);

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
        setPos((p) => {
          updateWindowPosition(task.id, p);
          return p;
        });
      }
      if (isResizing) {
        setIsResizing(false);
        setSize((s) => {
          updateWindowSize(task.id, s);
          return s;
        });
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

      {/* メッセージ表示エリア */}
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
              <div className="text-xs text-gray-400 mt-0.5 break-words whitespace-pre-wrap">
                {formatMessageText(msg.text)}
              </div>

              {/* リアクション表示 */}
              {msg.reactions && msg.reactions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {msg.reactions.map((reaction) => (
                    <span
                      key={reaction.name}
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] bg-white/5 border border-white/10 text-gray-400"
                      title={`:${reaction.name}: (${reaction.count})`}
                    >
                      <span>{emojiMap[reaction.name] || `:${reaction.name}:`}</span>
                      <span className="text-gray-500">{reaction.count}</span>
                    </span>
                  ))}
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
              <div
                ref={emojiPickerRef}
                className="absolute top-0 right-8 z-50 bg-[#1A1D27] border border-white/10 rounded-lg shadow-xl p-2"
              >
                <div className="grid grid-cols-6 gap-0.5">
                  {COMMON_EMOJIS.map(({ name, emoji }) => (
                    <button
                      key={name}
                      onClick={() => {
                        handleReactionAdd(msg, name);
                        setEmojiPickerMsgTs(null);
                      }}
                      className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 text-sm transition"
                      title={`:${name}:`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 返信エリア */}
      {task.status === 'open' && (
        <MessageComposer
          task={task}
          onAiAssist={() => setShowAiPanel(!showAiPanel)}
          replyText={replyText}
          setReplyText={setReplyText}
        />
      )}

      {/* AI補助パネル */}
      {showAiPanel && task.status === 'open' && (
        <AiAssistPanel
          task={task}
          onUseSuggestion={(text) => {
            setReplyText(text);
            setShowAiPanel(false);
          }}
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

function formatMessageText(text: string): string {
  // 解決済みメンション: <@U12345|Real Name> -> @Real Name
  // 未解決メンション: <@U12345> -> @U12345
  return text
    .replace(/<@([A-Z0-9]+)\|([^>]+)>/g, '@$2')
    .replace(/<@([A-Z0-9]+)>/g, '@$1');
}
