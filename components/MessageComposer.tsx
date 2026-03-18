'use client';

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useAppStore } from '@/lib/store';
import { parseMrkdwn } from '@/lib/mrkdwn';
import EmojiPicker from './EmojiPicker';
import type { Task } from '@/types';

interface MessageComposerProps {
  task: Task;
  onAiAssist: () => void;
}

export interface MessageComposerHandle {
  setReplyText: (text: string) => void;
}

interface ChannelOption {
  id: string;
  name: string;
  type?: 'channel' | 'dm' | 'group_dm';
}

interface UserOption {
  id: string;
  name: string;
  realName: string;
  avatarUrl: string;
}

const MessageComposer = forwardRef<MessageComposerHandle, MessageComposerProps>(function MessageComposer({
  task,
  onAiAssist,
}, ref) {
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [customEmojis, setCustomEmojis] = useState<Record<string, string>>({});
  const completeTask = useAppStore((s) => s.completeTask);
  const updateTaskStore = useAppStore((s) => s.updateTask);
  const openWindowStore = useAppStore((s) => s.openWindow);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 外部から replyText を設定するためのハンドル（AI補助用）
  useImperativeHandle(ref, () => ({
    setReplyText: (text: string) => setReplyText(text),
  }), []);

  // メンション・チャネルサジェスト
  const [allChannels, setAllChannels] = useState<ChannelOption[]>([]);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [suggestType, setSuggestType] = useState<'mention' | 'channel' | null>(null);
  const [suggestQuery, setSuggestQuery] = useState('');
  const [suggestIndex, setSuggestIndex] = useState(0);
  const [suggestCursorPos, setSuggestCursorPos] = useState(0);
  const suggestRef = useRef<HTMLDivElement>(null);

  // メンション表示名 → ID のマッピング（送信時に変換用）
  const mentionMapRef = useRef<Map<string, string>>(new Map());
  const channelMapRef = useRef<Map<string, string>>(new Map());

  // テキストエリアの高さを自動調整
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 100) + 'px';
    }
  }, [replyText]);

  // カスタム絵文字取得
  useEffect(() => {
    if (!task.workspaceId) return;
    const controller = new AbortController();
    fetch(`/api/slack/emoji?workspaceId=${task.workspaceId}`, { signal: controller.signal })
      .then((res) => res.ok ? res.json() : {})
      .then((data: Record<string, string>) => {
        if (data && typeof data === 'object') setCustomEmojis(data);
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      });
    return () => controller.abort();
  }, [task.workspaceId]);

  // 絵文字をカーソル位置に挿入
  const insertEmoji = useCallback((emojiName: string) => {
    const emojiText = `:${emojiName}: `;
    const ta = textareaRef.current;
    if (ta) {
      const start = ta.selectionStart ?? replyText.length;
      const newText = replyText.slice(0, start) + emojiText + replyText.slice(start);
      setReplyText(newText);
      setTimeout(() => {
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + emojiText.length;
      }, 0);
    } else {
      setReplyText((prev) => prev + emojiText);
    }
    setShowEmojiPicker(false);
  }, [replyText]);

  const channelsLoadedRef = useRef(false);
  const channelsLoadingRef = useRef(false);
  const usersLoadedRef = useRef(false);
  const usersLoadingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchChannels = useCallback(async (signal?: AbortSignal) => {
    if (channelsLoadedRef.current || channelsLoadingRef.current) return;
    channelsLoadingRef.current = true;
    try {
      const res = await fetch(`/api/slack/channels?workspaceId=${task.workspaceId}`, { signal });
      if (res.ok) {
        const data = await res.json();
        setAllChannels(data);
        channelsLoadedRef.current = true;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      // ネットワークエラーは警告のみ（先読みのため致命的ではない）
      console.warn('[Channels] Preload failed (will retry on use):', e);
    } finally {
      channelsLoadingRef.current = false;
    }
  }, [task.workspaceId]);

  const fetchUsers = useCallback(async (signal?: AbortSignal) => {
    if (usersLoadedRef.current || usersLoadingRef.current) return;
    usersLoadingRef.current = true;
    try {
      const res = await fetch(`/api/slack/channels/members?workspaceId=${task.workspaceId}&channelId=${task.channelId}`, { signal });
      if (res.ok) {
        const data = await res.json();
        setAllUsers(data);
        usersLoadedRef.current = true;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      console.warn('[Users] Preload failed (will retry on use):', e);
    } finally {
      usersLoadingRef.current = false;
    }
  }, [task.workspaceId, task.channelId]);

  // マウント時にメンバーとチャネルを先読み（@や#入力前にキャッシュ準備）
  useEffect(() => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    fetchUsers(controller.signal);
    fetchChannels(controller.signal);
    return () => {
      controller.abort();
      abortControllerRef.current = null;
    };
  }, [fetchUsers, fetchChannels]);

  // サジェスト候補
  const suggestItems = suggestType === 'mention'
    ? allUsers.filter((u) =>
        u.name.toLowerCase().includes(suggestQuery.toLowerCase()) ||
        u.realName.toLowerCase().includes(suggestQuery.toLowerCase()),
      ).slice(0, 8)
    : suggestType === 'channel'
      ? allChannels.filter((ch) =>
          ch.name.toLowerCase().includes(suggestQuery.toLowerCase()),
        ).slice(0, 8)
      : [];

  // テキスト入力ハンドラ（サジェスト検出）
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setReplyText(newText);

    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = newText.slice(0, cursorPos);

    // @ メンション検出
    const mentionMatch = textBeforeCursor.match(/@([^\s@]*)$/);
    if (mentionMatch) {
      setSuggestType('mention');
      setSuggestQuery(mentionMatch[1]);
      setSuggestIndex(0);
      setSuggestCursorPos(cursorPos);
      fetchUsers();
      return;
    }

    // # チャネル検出
    const channelMatch = textBeforeCursor.match(/#([^\s#]*)$/);
    if (channelMatch) {
      setSuggestType('channel');
      setSuggestQuery(channelMatch[1]);
      setSuggestIndex(0);
      setSuggestCursorPos(cursorPos);
      fetchChannels();
      return;
    }

    setSuggestType(null);
  };

  // サジェスト選択
  const applySuggestion = (item: UserOption | ChannelOption) => {
    const ta = textareaRef.current;
    if (!ta) return;

    const textBeforeCursor = replyText.slice(0, suggestCursorPos);
    const textAfterCursor = replyText.slice(suggestCursorPos);

    if (suggestType === 'mention') {
      const user = item as UserOption;
      const displayName = user.realName || user.name;
      mentionMapRef.current.set(displayName, user.id);
      const replaced = textBeforeCursor.replace(/@[^\s@]*$/, `@${displayName} `);
      setReplyText(replaced + textAfterCursor);
    } else if (suggestType === 'channel') {
      const channel = item as ChannelOption;
      channelMapRef.current.set(channel.name, channel.id);
      const replaced = textBeforeCursor.replace(/#[^\s#]*$/, `#${channel.name} `);
      setReplyText(replaced + textAfterCursor);
    }

    setSuggestType(null);
    ta.focus();
  };

  // 送信前にテキスト内の @表示名 → <@ID>、#チャネル名 → <#ID|name> に変換
  const convertToSlackFormat = (text: string): string => {
    let result = text;

    // マークダウン → Slack mrkdwn 変換
    result = result.replace(/^- (.+)$/gm, '• $1');
    result = result.replace(/\*\*(.+?)\*\*/g, '*$1*');
    result = result.replace(/~~(.+?)~~/g, '~$1~');

    // メンション変換
    const mentionEntries = [...mentionMapRef.current.entries()].sort((a, b) => b[0].length - a[0].length);
    for (const [displayName, userId] of mentionEntries) {
      result = result.replaceAll(`@${displayName}`, `<@${userId}>`);
    }
    // チャネル変換
    const channelEntries = [...channelMapRef.current.entries()].sort((a, b) => b[0].length - a[0].length);
    for (const [channelName, channelId] of channelEntries) {
      result = result.replaceAll(`#${channelName}`, `<#${channelId}|${channelName}>`);
    }
    return result;
  };

  // 送信エラー状態
  const [sendError, setSendError] = useState<string | null>(null);

  const handleSend = async () => {
    if ((!replyText.trim() && attachedFiles.length === 0) || sending) return;
    setSendError(null);

    // ファイル添付がある場合は従来のフロー（プログレス表示付き）
    if (attachedFiles.length > 0) {
      setSending(true);
      try {
        if (task.status === 'completed') {
          await reopenTask();
        }
        const slackText = convertToSlackFormat(replyText.trim());
        for (const file of attachedFiles) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('workspaceId', task.workspaceId);
          formData.append('channelId', task.channelId);
          formData.append('threadTs', task.threadTs);
          if (slackText && attachedFiles.indexOf(file) === 0) {
            formData.append('initialComment', slackText);
          }
          const uploadRes = await fetch('/api/slack/files/upload', {
            method: 'POST',
            body: formData,
          });
          if (!uploadRes.ok) {
            const err = await uploadRes.json();
            console.error('Upload error:', err.error);
          }
        }
        setReplyText('');
        setAttachedFiles([]);
        setShowPreview(false);
        mentionMapRef.current.clear();
        channelMapRef.current.clear();
        await refreshThread();
      } catch (error) {
        console.error('Failed to upload:', error);
        setSendError('ファイル送信に失敗しました');
      } finally {
        setSending(false);
      }
      return;
    }

    // --- テキストのみ: オプティミスティックUI ---
    const originalText = replyText.trim();
    const slackText = convertToSlackFormat(originalText);

    // 1. 即座にUIをクリア＋仮メッセージをスレッドに表示
    setReplyText('');
    setShowPreview(false);
    const savedMentionMap = new Map(mentionMapRef.current);
    const savedChannelMap = new Map(channelMapRef.current);
    mentionMapRef.current.clear();
    channelMapRef.current.clear();

    const optimisticTs = `optimistic-${Date.now()}`;
    const optimisticMessage = {
      id: optimisticTs,
      workspaceId: task.workspaceId,
      channelId: task.channelId,
      channelName: task.channelName,
      threadTs: task.threadTs,
      ts: optimisticTs,
      userId: 'me',
      userName: '送信中...',
      text: originalText,
      isDirectMention: false,
      isThreadParticipant: true,
    };

    // スレッドに仮メッセージを追加
    const prevMessages = task.threadMessages || [];
    updateTaskStore(task.id, {
      threadMessages: [...prevMessages, optimisticMessage],
    });

    // 2. 完了タスクなら再オープン
    if (task.status === 'completed') {
      reopenTask();
    }

    // 3. バックグラウンドで送信
    try {
      const res = await fetch('/api/slack/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: task.workspaceId,
          channelId: task.channelId,
          text: slackText,
          threadTs: task.threadTs,
        }),
      });

      if (res.ok) {
        // 4. 成功 → 実データでスレッドをリフレッシュ
        await refreshThread();
      } else {
        // 送信失敗 → 仮メッセージを除去、テキストを復元
        updateTaskStore(task.id, { threadMessages: prevMessages });
        setReplyText(originalText);
        mentionMapRef.current = savedMentionMap;
        channelMapRef.current = savedChannelMap;
        setSendError('送信に失敗しました');
      }
    } catch (error) {
      console.error('Failed to send:', error);
      // ネットワークエラー → 復元
      updateTaskStore(task.id, { threadMessages: prevMessages });
      setReplyText(originalText);
      mentionMapRef.current = savedMentionMap;
      channelMapRef.current = savedChannelMap;
      setSendError('送信に失敗しました');
    }
  };

  // タスク再オープンヘルパー
  const reopenTask = async () => {
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: task.id,
          status: 'open',
          completedAt: null,
          isMinimized: false,
        }),
      });
      updateTaskStore(task.id, {
        status: 'open',
        completedAt: undefined,
        isMinimized: false,
      });
      openWindowStore(task.id);
    } catch {
      // ignore
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setAttachedFiles((prev) => [...prev, ...Array.from(files)]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachedFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      setAttachedFiles((prev) => [...prev, ...Array.from(files)]);
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
      // Slack APIから直接スレッドを取得（DBキャッシュを介さない）
      // 同時にDBも更新される
      const params = new URLSearchParams({
        workspaceId: task.workspaceId,
        channelId: task.channelId,
        threadTs: task.threadTs,
      });
      const res = await fetch(`/api/slack/messages?${params}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.messages) {
          updateTaskStore(task.id, { threadMessages: data.messages });
        }
      }
    } catch {
      // ignore
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // サジェスト表示中のキー操作
    if (suggestType && suggestItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestIndex((prev) => Math.min(prev + 1, suggestItems.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          applySuggestion(suggestItems[suggestIndex]);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSuggestType(null);
        return;
      }
    }

    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const previewHtml = showPreview ? parseMrkdwn(replyText) : '';

  return (
    <div
      className="border-t border-white/5 p-2 shrink-0"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* 添付ファイルプレビュー */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {attachedFiles.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              className="flex items-center gap-1 px-2 py-1 rounded bg-[#4A9EFF]/10 border border-[#4A9EFF]/20 text-[10px]"
            >
              {file.type.startsWith('image/') ? (
                <img
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className="w-6 h-6 rounded object-cover"
                />
              ) : (
                <svg className="w-3.5 h-3.5 text-[#4A9EFF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              )}
              <span className="text-gray-400 truncate max-w-[80px]">{file.name}</span>
              <button
                onClick={() => removeAttachedFile(i)}
                className="text-gray-600 hover:text-[#E74C3C] transition ml-0.5"
              >
                &#10005;
              </button>
            </div>
          ))}
        </div>
      )}

      {/* mrkdwn プレビュー */}
      {showPreview && replyText.trim() && (
        <div className="mb-1.5 p-2 rounded bg-[#0F1117] border border-white/10 max-h-24 overflow-y-auto">
          <div
            className="text-xs text-gray-300 break-words slack-mrkdwn"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      )}

      {/* テキスト入力エリア（サジェスト付き） */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={replyText}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder="返信を入力... @メンション #チャネル (Cmd+Enter で送信)"
          rows={1}
          className="w-full bg-[#0F1117] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white placeholder-gray-600 resize-none focus:outline-none focus:border-[#4A9EFF] transition"
        />

        {/* サジェストポップアップ */}
        {suggestType && suggestItems.length > 0 && (
          <div
            ref={suggestRef}
            className="absolute bottom-full left-0 mb-1 w-64 bg-[#1A1D27] border border-white/10 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto"
          >
            {suggestType === 'mention' &&
              suggestItems.map((item, i) => {
                const user = item as UserOption;
                return (
                  <button
                    key={user.id}
                    onClick={() => applySuggestion(user)}
                    className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-[11px] transition ${
                      i === suggestIndex
                        ? 'bg-[#4A9EFF]/15 text-white'
                        : 'text-gray-400 hover:bg-white/5'
                    }`}
                  >
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt="" className="w-5 h-5 rounded shrink-0" />
                    ) : (
                      <div className="w-5 h-5 rounded bg-[#4A9EFF]/20 flex items-center justify-center text-[8px] text-[#4A9EFF] shrink-0">
                        {user.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="font-medium text-gray-300 truncate">{user.realName}</span>
                    <span className="text-gray-600 text-[10px]">@{user.name}</span>
                  </button>
                );
              })}
            {suggestType === 'channel' &&
              suggestItems.map((item, i) => {
                const ch = item as ChannelOption;
                return (
                  <button
                    key={ch.id}
                    onClick={() => applySuggestion(ch)}
                    className={`w-full text-left px-3 py-1.5 text-[11px] transition ${
                      i === suggestIndex
                        ? 'bg-[#4A9EFF]/15 text-white'
                        : 'text-gray-400 hover:bg-white/5'
                    }`}
                  >
                    <span className="text-[#4A9EFF]">#</span> {ch.name}
                  </button>
                );
              })}
          </div>
        )}
      </div>

      {/* 隠しファイルinput */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* 送信エラー表示 */}
      {sendError && (
        <div className="flex items-center gap-1.5 px-2 py-1 mb-1 rounded bg-[#E74C3C]/10 border border-[#E74C3C]/20">
          <span className="text-[10px] text-[#E74C3C]">{sendError}</span>
          <button
            onClick={() => setSendError(null)}
            className="text-[#E74C3C]/60 hover:text-[#E74C3C] transition text-[10px] ml-auto"
          >
            &#10005;
          </button>
        </div>
      )}

      <div className="flex items-center gap-1.5 mt-1.5">
        {/* ファイル添付ボタン */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-1.5 py-1 text-[10px] rounded bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-400 transition"
          title="ファイルを添付"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>

        {/* 絵文字ボタン */}
        <div className="relative">
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className={`px-1.5 py-1 text-[10px] rounded transition ${
              showEmojiPicker
                ? 'bg-[#4A9EFF]/20 text-[#4A9EFF]'
                : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-400'
            }`}
            title="絵文字を挿入"
          >
            <span className="text-sm">{'\u{1F642}'}</span>
          </button>
          {showEmojiPicker && (
            <EmojiPicker
              onSelect={insertEmoji}
              onClose={() => setShowEmojiPicker(false)}
              workspaceId={task.workspaceId}
              customEmojis={customEmojis}
            />
          )}
        </div>

        {/* プレビュー切り替え */}
        <button
          onClick={() => setShowPreview(!showPreview)}
          className={`px-1.5 py-1 text-[10px] rounded transition ${
            showPreview
              ? 'bg-[#4A9EFF]/20 text-[#4A9EFF]'
              : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-400'
          }`}
          title="プレビュー"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>

        <button
          onClick={onAiAssist}
          className="px-2 py-1 text-[10px] rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition"
        >
          AI補助
        </button>

        <button
          onClick={handleSend}
          disabled={(!replyText.trim() && attachedFiles.length === 0) || sending}
          className="px-2 py-1 text-[10px] rounded bg-[#4A9EFF]/20 text-[#4A9EFF] hover:bg-[#4A9EFF]/30 transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {sending
            ? '送信中...'
            : task.status === 'completed'
              ? '返信 (再オープン)'
              : attachedFiles.length > 0
                ? `送信 (${attachedFiles.length}ファイル)`
                : '返信'}
        </button>
        {task.status === 'open' && (
          <button
            onClick={handleComplete}
            className="px-2 py-1 text-[10px] rounded bg-[#2ECC71]/20 text-[#2ECC71] hover:bg-[#2ECC71]/30 transition ml-auto"
          >
            &#10003; 完了
          </button>
        )}
      </div>
    </div>
  );
});

export default MessageComposer;
