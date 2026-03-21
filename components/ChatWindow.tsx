'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import MessageComposer from './MessageComposer';
import type { MessageComposerHandle } from './MessageComposer';
import AiAssistPanel from './AiAssistPanel';
import SlackMessageText from './SlackMessageText';
import EmojiPicker from './EmojiPicker';
import FileAttachment from './FileAttachment';
import { resolveEmoji } from '@/lib/mrkdwn';
import type { Task, SlackMessage, Project } from '@/types';

// メモ化されたメッセージリストコンポーネント
interface MessageListProps {
  messages: SlackMessage[];
  emojiPickerMsgTs: string | null;
  setEmojiPickerMsgTs: (ts: string | null) => void;
  handleReactionAdd: (msg: SlackMessage, emojiName: string) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  customEmojis?: Record<string, string>;
  workspaceId?: string;
  onSaveToMemo?: (msg: SlackMessage) => void;
}

const MessageList = React.memo(function MessageList({
  messages,
  emojiPickerMsgTs,
  setEmojiPickerMsgTs,
  handleReactionAdd,
  messagesEndRef,
  customEmojis,
  workspaceId,
  onSaveToMemo,
}: MessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {messages.map((msg, i) => {
        const isOptimistic = msg.ts.startsWith('optimistic-');
        return (
        <div key={msg.id || i} className={`flex gap-2 group relative ${isOptimistic ? 'opacity-60' : ''}`}>
          {/* アバター */}
          {msg.avatarUrl ? (
            <img
              src={msg.avatarUrl}
              alt={msg.userName}
              className="w-8 h-8 rounded shrink-0 mt-0.5"
            />
          ) : (
            <div className={`w-8 h-8 rounded flex items-center justify-center text-[10px] shrink-0 mt-0.5 ${
              isOptimistic ? 'bg-gray-500/20 text-gray-500' : 'bg-[#4A9EFF]/20 text-[#4A9EFF]'
            }`}>
              {isOptimistic ? (
                <svg className="w-4 h-4 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                (msg.userName || '??').slice(0, 2).toUpperCase()
              )}
            </div>
          )}

          {/* メッセージ内容 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className={`text-xs font-semibold ${isOptimistic ? 'text-gray-500' : 'text-gray-300'}`}>
                {isOptimistic ? '送信中...' : msg.userName}
              </span>
              {!isOptimistic && (
                <span className="text-[10px] text-gray-600">
                  {formatSlackTs(msg.ts)}
                </span>
              )}
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

          {/* メモ保存ボタン（ホバー時表示） */}
          {onSaveToMemo && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSaveToMemo(msg);
              }}
              className="absolute top-0 right-7 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center rounded bg-[#1A1D27] hover:bg-white/10 text-gray-500 hover:text-gray-300 text-xs border border-white/10"
              title="プロジェクトメモに保存"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>
          )}

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
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
});

interface ChatWindowProps {
  task: Task;
  isFocused: boolean;
  onHeaderDragStart?: (e: React.DragEvent) => void;
}

export default function ChatWindow({ task, isFocused, onHeaderDragStart }: ChatWindowProps) {
  const closeWindow = useAppStore((s) => s.closeWindow);
  const focusWindow = useAppStore((s) => s.focusWindow);
  const updateTask = useAppStore((s) => s.updateTask);
  const markTaskAsSeen = useAppStore((s) => s.markTaskAsSeen);
  const hasNewMessages = useAppStore((s) => s.hasNewMessages);
  const workspaces = useAppStore((s) => s.workspaces);
  const wsName = workspaces.find((w) => w.id === task.workspaceId)?.name || '';
  const isUpdated = hasNewMessages(task.id);

  // フォーカス時に既読マーク
  useEffect(() => {
    if (isFocused) {
      markTaskAsSeen(task.id);
    }
  }, [isFocused, task.id, task.threadMessages?.length, markTaskAsSeen]);

  const windowRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<MessageComposerHandle>(null);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [emojiPickerMsgTs, setEmojiPickerMsgTs] = useState<string | null>(null);

  // カスタム絵文字を取得（リアクション表示用）
  const [customEmojis, setCustomEmojis] = useState<Record<string, string>>({});
  const [memoTargetMsg, setMemoTargetMsg] = useState<SlackMessage | null>(null);
  const [memoProjects, setMemoProjects] = useState<Project[]>([]);
  const [memoSaved, setMemoSaved] = useState(false);
  const [memoSaving, setMemoSaving] = useState(false);

  // プロジェクト紐付け
  const projects = useAppStore((s) => s.projects);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);

  const handleProjectChange = async (projectId: string | null) => {
    setShowProjectDropdown(false);
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, projectId: projectId }),
      });
      if (res.ok) {
        updateTask(task.id, { projectId: projectId || undefined });
      }
    } catch { /* ignore */ }
  };

  const currentProject = projects.find((p) => p.id === task.projectId);
  useEffect(() => {
    if (!task.workspaceId) return;
    const controller = new AbortController();
    fetch(`/api/slack/emoji?workspaceId=${task.workspaceId}`, { signal: controller.signal })
      .then((res) => {
        if (res.ok) return res.json();
        return {};
      })
      .then((data: Record<string, string>) => {
        if (data && typeof data === 'object') setCustomEmojis(data);
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      });
    return () => controller.abort();
  }, [task.workspaceId]);

  // 新しいメッセージが来たらスクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [task.threadMessages.length]);

  // リアクション追加
  const handleReactionAdd = useCallback(async (msg: SlackMessage, emojiName: string) => {
    setEmojiPickerMsgTs(null);

    const currentMessages = task.threadMessages.length > 0 ? task.threadMessages : [task.triggerMessage];
    const optimisticMessages = currentMessages.map((m) => {
      if (m.ts !== msg.ts) return m;
      const existingReactions = m.reactions || [];
      const existingReaction = existingReactions.find((r) => r.name === emojiName);
      if (existingReaction) {
        return {
          ...m,
          reactions: existingReactions.map((r) =>
            r.name === emojiName ? { ...r, count: r.count + 1 } : r,
          ),
        };
      }
      return {
        ...m,
        reactions: [...existingReactions, { name: emojiName, count: 1, users: [] }],
      };
    });
    updateTask(task.id, { threadMessages: optimisticMessages });

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
      } else if (data.error) {
        console.error('[Reactions] API error:', data.error);
      }
    } catch (e) {
      console.error('[Reactions] Failed to add reaction:', e);
    }
  }, [task.workspaceId, task.channelId, task.threadTs, task.id, task.threadMessages, task.triggerMessage, updateTask]);

  const messages = task.threadMessages.length > 0
    ? task.threadMessages
    : [task.triggerMessage];

  return (
    <div
      ref={windowRef}
      className="h-full flex flex-col rounded-lg overflow-hidden"
      style={{
        border: '1px solid',
        borderColor: isFocused ? '#4A9EFF' : isUpdated ? '#4A9EFF' : 'rgba(255,255,255,0.1)',
        backdropFilter: 'blur(12px)',
        boxShadow: isFocused
          ? '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(74,158,255,0.3)'
          : isUpdated
            ? '0 20px 60px rgba(0,0,0,0.5), 0 0 8px rgba(74,158,255,0.3)'
            : '0 20px 60px rgba(0,0,0,0.5)',
        background: '#1E2235',
      }}
      onMouseDown={() => focusWindow(task.id)}
    >
      {/* ヘッダー（ドラッグハンドル） */}
      <div
        draggable={!!onHeaderDragStart}
        onDragStart={onHeaderDragStart}
        className={`h-9 flex items-center px-3 shrink-0 select-none cursor-grab active:cursor-grabbing ${
          isUpdated ? 'bg-[#4A9EFF]/15' : 'bg-[#161929]'
        }`}
      >
        <div className="flex-1 text-xs text-gray-300 truncate flex items-center gap-1.5">
          {isUpdated && (
            <span className="w-2 h-2 rounded-full bg-[#4A9EFF] animate-pulse shrink-0" title="新しいメッセージ" />
          )}
          {wsName && (
            <span className="text-gray-500 mr-0">{wsName}</span>
          )}
          <span className="text-[#4A9EFF]">#</span>
          <span className="truncate">{task.channelName}</span>
          {task.status === 'completed' && (
            <span className="ml-2 text-[10px] text-[#2ECC71] bg-[#2ECC71]/10 px-1.5 py-0.5 rounded">&#10003; 完了</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* プロジェクト紐付けボタン */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowProjectDropdown(!showProjectDropdown); }}
              className={`px-1.5 py-0.5 text-[9px] rounded transition truncate max-w-[80px] ${
                currentProject
                  ? 'bg-purple-500/15 text-purple-400 hover:bg-purple-500/25'
                  : 'bg-white/5 text-gray-600 hover:bg-white/10 hover:text-gray-400'
              }`}
              title={currentProject ? `プロジェクト: ${currentProject.name}` : 'プロジェクトを設定'}
            >
              {currentProject ? currentProject.name : '未分類'}
            </button>
            {showProjectDropdown && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-[#1A1D27] border border-white/10 rounded-lg shadow-xl z-50 py-1 max-h-48 overflow-y-auto">
                <button
                  onClick={() => handleProjectChange(null)}
                  className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-white/5 transition ${
                    !task.projectId ? 'text-[#4A9EFF]' : 'text-gray-400'
                  }`}
                >
                  未分類
                </button>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleProjectChange(p.id)}
                    className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-white/5 transition truncate ${
                      task.projectId === p.id ? 'text-[#4A9EFF]' : 'text-gray-400'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
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
      <MessageList
        messages={messages}
        emojiPickerMsgTs={emojiPickerMsgTs}
        setEmojiPickerMsgTs={setEmojiPickerMsgTs}
        handleReactionAdd={handleReactionAdd}
        messagesEndRef={messagesEndRef}
        workspaceId={task.workspaceId}
        customEmojis={customEmojis}
        onSaveToMemo={(msg) => {
          setMemoTargetMsg(msg);
          setMemoSaved(false);
          if (memoProjects.length === 0) {
            fetch('/api/projects').then(r => r.json()).then(data => {
              if (Array.isArray(data)) setMemoProjects(data);
            }).catch(() => {});
          }
        }}
      />

      {/* プロジェクトメモ保存ポップオーバー */}
      {memoTargetMsg && (
        <div className="border-t border-white/5 px-3 py-2 bg-[#161929] shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-gray-400">プロジェクトメモに保存</span>
            <button
              onClick={() => setMemoTargetMsg(null)}
              className="text-gray-600 hover:text-gray-400 transition text-[10px]"
            >
              &#10005;
            </button>
          </div>
          <p className="text-[9px] text-gray-500 mb-1.5 truncate">
            {memoTargetMsg.userName}: {memoTargetMsg.text.slice(0, 60)}
          </p>
          {memoSaved ? (
            <div className="text-[10px] text-[#2ECC71]">&#10003; 保存しました</div>
          ) : memoSaving ? (
            <div className="text-[10px] text-gray-400 animate-pulse">保存中...</div>
          ) : memoProjects.length === 0 ? (
            <div className="text-[10px] text-gray-600">プロジェクトがありません。/project で作成してください。</div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {memoProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={async () => {
                    setMemoSaving(true);
                    try {
                      const res = await fetch('/api/projects/memos', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          projectId: p.id,
                          taskId: task.id,
                          messageTs: memoTargetMsg.ts,
                          messageUser: memoTargetMsg.userName,
                          messageText: memoTargetMsg.text,
                          channelId: task.channelId,
                          workspaceId: task.workspaceId,
                        }),
                      });
                      if (res.ok) {
                        setMemoSaved(true);
                        setTimeout(() => setMemoTargetMsg(null), 1500);
                      }
                    } catch { /* ignore */ } finally {
                      setMemoSaving(false);
                    }
                  }}
                  className="px-2 py-1 text-[9px] rounded bg-[#4A9EFF]/10 text-[#4A9EFF] hover:bg-[#4A9EFF]/20 transition truncate max-w-[120px]"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 返信エリア（完了タスクでも表示し、投稿時に自動再オープン） */}
      <MessageComposer
        ref={composerRef}
        task={task}
        onAiAssist={() => setShowAiPanel(!showAiPanel)}
      />

      {/* AI補助パネル */}
      {showAiPanel && (
        <AiAssistPanel
          task={task}
          onUseSuggestion={(text) => {
            composerRef.current?.setReplyText(text);
            setShowAiPanel(false);
          }}
        />
      )}

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
