'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import SlackMessageText from './SlackMessageText';
import FileAttachment from './FileAttachment';
import EmojiPicker from './EmojiPicker';
import { resolveEmoji } from '@/lib/mrkdwn';
import type { SlackMessage, Project } from '@/types';

interface ChannelViewProps {
  workspaceId: string;
  channelId: string;
  channelName: string;
}

export default function ChannelView({ workspaceId, channelId, channelName }: ChannelViewProps) {
  const setActiveChannel = useAppStore((s) => s.setActiveChannel);
  const getCachedMessages = useAppStore((s) => s.getCachedMessages);
  const setCachedMessages = useAppStore((s) => s.setCachedMessages);
  const clearChannelCache = useAppStore((s) => s.clearChannelCache);
  const [messages, setMessages] = useState<SlackMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false); // バックグラウンド更新中
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [postText, setPostText] = useState('');
  const [posting, setPosting] = useState(false);
  const [customEmojis, setCustomEmojis] = useState<Record<string, string>>({});
  const [emojiPickerMsgTs, setEmojiPickerMsgTs] = useState<string | null>(null);
  const [threadEmojiPickerMsgTs, setThreadEmojiPickerMsgTs] = useState<string | null>(null);

  // スレッドパネル
  const [threadParentTs, setThreadParentTs] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<SlackMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadReplyText, setThreadReplyText] = useState('');
  const [threadPosting, setThreadPosting] = useState(false);

  // 表示フィルタ・並び替え
  const [showThreadReplies, setShowThreadReplies] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc'); // asc=古い順(時系列), desc=新しい順
  const [showSortMenu, setShowSortMenu] = useState(false);

  // ファイル添付（チャネル投稿）
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ファイル添付（スレッド返信）
  const [threadAttachedFiles, setThreadAttachedFiles] = useState<File[]>([]);
  const threadFileInputRef = useRef<HTMLInputElement>(null);

  // 絵文字ピッカー（投稿用）
  const [showPostEmojiPicker, setShowPostEmojiPicker] = useState(false);
  const [showThreadEmojiPicker, setShowThreadEmojiPicker] = useState(false);

  // メンション候補検索
  interface UserOption { id: string; name: string; realName: string; avatarUrl: string }
  interface ChannelOption { id: string; name: string; type?: 'channel' | 'dm' | 'group_dm' }

  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [allChannels, setAllChannels] = useState<ChannelOption[]>([]);
  const usersLoadedRef = useRef(false);
  const usersLoadingRef = useRef(false);
  const channelsLoadedRef = useRef(false);
  const channelsLoadingRef = useRef(false);

  // メイン投稿用サジェスト
  const [suggestType, setSuggestType] = useState<'mention' | 'channel' | null>(null);
  const [suggestQuery, setSuggestQuery] = useState('');
  const [suggestIndex, setSuggestIndex] = useState(0);
  const [suggestCursorPos, setSuggestCursorPos] = useState(0);
  const mentionMapRef = useRef<Map<string, string>>(new Map());
  const channelMapRef = useRef<Map<string, string>>(new Map());

  // スレッド返信用サジェスト
  const [threadSuggestType, setThreadSuggestType] = useState<'mention' | 'channel' | null>(null);
  const [threadSuggestQuery, setThreadSuggestQuery] = useState('');
  const [threadSuggestIndex, setThreadSuggestIndex] = useState(0);
  const [threadSuggestCursorPos, setThreadSuggestCursorPos] = useState(0);
  const threadMentionMapRef = useRef<Map<string, string>>(new Map());
  const threadChannelMapRef = useRef<Map<string, string>>(new Map());

  // AI assist
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  // メモ保存
  const [memoTargetMsg, setMemoTargetMsg] = useState<SlackMessage | null>(null);
  const [memoProjects, setMemoProjects] = useState<Project[]>([]);
  const [memoSaved, setMemoSaved] = useState(false);
  const [memoSaving, setMemoSaving] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadTextareaRef = useRef<HTMLTextAreaElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  // フィルタ・ソート済みメッセージ
  const filteredMessages = useMemo(() => {
    let filtered = messages;

    // スレッド返信を除外 (thread_ts が存在し、ts と異なるもの = スレッド返信)
    if (!showThreadReplies) {
      filtered = filtered.filter((msg) => !msg.threadTs || msg.threadTs === msg.ts);
    }

    // 並び替え
    const sorted = [...filtered].sort((a, b) => {
      const tsA = parseFloat(a.ts) || 0;
      const tsB = parseFloat(b.ts) || 0;
      return sortOrder === 'asc' ? tsA - tsB : tsB - tsA;
    });

    return sorted;
  }, [messages, showThreadReplies, sortOrder]);

  // カスタム絵文字
  useEffect(() => {
    fetch(`/api/slack/emoji?workspaceId=${workspaceId}`)
      .then((res) => res.ok ? res.json() : {})
      .then((data: Record<string, string>) => {
        if (data && typeof data === 'object') setCustomEmojis(data);
      })
      .catch(() => {});
  }, [workspaceId]);

  // チャネルメンバー取得（メンション候補用）
  const fetchChannelMembers = useCallback(async () => {
    if (usersLoadedRef.current || usersLoadingRef.current) return;
    usersLoadingRef.current = true;
    try {
      const res = await fetch(`/api/slack/channels/members?workspaceId=${workspaceId}&channelId=${channelId}`);
      if (res.ok) {
        const data = await res.json();
        setAllUsers(data);
        usersLoadedRef.current = true;
      }
    } catch {
      // ignore
    } finally {
      usersLoadingRef.current = false;
    }
  }, [workspaceId, channelId]);

  // チャネル一覧取得（#チャネル候補用）
  const fetchChannelList = useCallback(async () => {
    if (channelsLoadedRef.current || channelsLoadingRef.current) return;
    channelsLoadingRef.current = true;
    try {
      const res = await fetch(`/api/slack/channels?workspaceId=${workspaceId}`);
      if (res.ok) {
        const data = await res.json();
        setAllChannels(data);
        channelsLoadedRef.current = true;
      }
    } catch {
      // ignore
    } finally {
      channelsLoadingRef.current = false;
    }
  }, [workspaceId]);

  // チャネル変更時にメンバーキャッシュリセット
  useEffect(() => {
    usersLoadedRef.current = false;
    usersLoadingRef.current = false;
  }, [channelId]);

  // サジェスト候補フィルタリング
  const suggestItems = useMemo(() => {
    if (suggestType === 'mention') {
      return allUsers.filter((u) =>
        u.name.toLowerCase().includes(suggestQuery.toLowerCase()) ||
        u.realName.toLowerCase().includes(suggestQuery.toLowerCase()),
      ).slice(0, 8);
    }
    if (suggestType === 'channel') {
      return allChannels.filter((ch) =>
        ch.name.toLowerCase().includes(suggestQuery.toLowerCase()),
      ).slice(0, 8);
    }
    return [];
  }, [suggestType, suggestQuery, allUsers, allChannels]);

  // スレッド用サジェスト候補
  const threadSuggestItems = useMemo(() => {
    if (threadSuggestType === 'mention') {
      return allUsers.filter((u) =>
        u.name.toLowerCase().includes(threadSuggestQuery.toLowerCase()) ||
        u.realName.toLowerCase().includes(threadSuggestQuery.toLowerCase()),
      ).slice(0, 8);
    }
    if (threadSuggestType === 'channel') {
      return allChannels.filter((ch) =>
        ch.name.toLowerCase().includes(threadSuggestQuery.toLowerCase()),
      ).slice(0, 8);
    }
    return [];
  }, [threadSuggestType, threadSuggestQuery, allUsers, allChannels]);

  // テキスト変更ハンドラ（メイン投稿）
  const handlePostTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setPostText(newText);

    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = newText.slice(0, cursorPos);

    const mentionMatch = textBeforeCursor.match(/@([^\s@]*)$/);
    if (mentionMatch) {
      setSuggestType('mention');
      setSuggestQuery(mentionMatch[1]);
      setSuggestIndex(0);
      setSuggestCursorPos(cursorPos);
      fetchChannelMembers();
      return;
    }

    const channelMatch = textBeforeCursor.match(/#([^\s#]*)$/);
    if (channelMatch) {
      setSuggestType('channel');
      setSuggestQuery(channelMatch[1]);
      setSuggestIndex(0);
      setSuggestCursorPos(cursorPos);
      fetchChannelList();
      return;
    }

    setSuggestType(null);
  };

  // テキスト変更ハンドラ（スレッド返信）
  const handleThreadTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setThreadReplyText(newText);

    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = newText.slice(0, cursorPos);

    const mentionMatch = textBeforeCursor.match(/@([^\s@]*)$/);
    if (mentionMatch) {
      setThreadSuggestType('mention');
      setThreadSuggestQuery(mentionMatch[1]);
      setThreadSuggestIndex(0);
      setThreadSuggestCursorPos(cursorPos);
      fetchChannelMembers();
      return;
    }

    const channelMatch = textBeforeCursor.match(/#([^\s#]*)$/);
    if (channelMatch) {
      setThreadSuggestType('channel');
      setThreadSuggestQuery(channelMatch[1]);
      setThreadSuggestIndex(0);
      setThreadSuggestCursorPos(cursorPos);
      fetchChannelList();
      return;
    }

    setThreadSuggestType(null);
  };

  // 候補選択（メイン投稿）
  const applySuggestion = (item: UserOption | ChannelOption) => {
    const ta = textareaRef.current;
    if (!ta) return;

    const textBeforeCursor = postText.slice(0, suggestCursorPos);
    const textAfterCursor = postText.slice(suggestCursorPos);

    if (suggestType === 'mention') {
      const user = item as UserOption;
      const displayName = user.realName || user.name;
      mentionMapRef.current.set(displayName, user.id);
      const replaced = textBeforeCursor.replace(/@[^\s@]*$/, `@${displayName} `);
      setPostText(replaced + textAfterCursor);
    } else if (suggestType === 'channel') {
      const channel = item as ChannelOption;
      channelMapRef.current.set(channel.name, channel.id);
      const replaced = textBeforeCursor.replace(/#[^\s#]*$/, `#${channel.name} `);
      setPostText(replaced + textAfterCursor);
    }

    setSuggestType(null);
    ta.focus();
  };

  // 候補選択（スレッド返信）
  const applyThreadSuggestion = (item: UserOption | ChannelOption) => {
    const ta = threadTextareaRef.current;
    if (!ta) return;

    const textBeforeCursor = threadReplyText.slice(0, threadSuggestCursorPos);
    const textAfterCursor = threadReplyText.slice(threadSuggestCursorPos);

    if (threadSuggestType === 'mention') {
      const user = item as UserOption;
      const displayName = user.realName || user.name;
      threadMentionMapRef.current.set(displayName, user.id);
      const replaced = textBeforeCursor.replace(/@[^\s@]*$/, `@${displayName} `);
      setThreadReplyText(replaced + textAfterCursor);
    } else if (threadSuggestType === 'channel') {
      const channel = item as ChannelOption;
      threadChannelMapRef.current.set(channel.name, channel.id);
      const replaced = textBeforeCursor.replace(/#[^\s#]*$/, `#${channel.name} `);
      setThreadReplyText(replaced + textAfterCursor);
    }

    setThreadSuggestType(null);
    ta.focus();
  };

  // Slack形式変換
  const convertToSlackFormat = (text: string, mMap: Map<string, string>, cMap: Map<string, string>): string => {
    let result = text;
    result = result.replace(/^- (.+)$/gm, '• $1');
    result = result.replace(/\*\*(.+?)\*\*/g, '*$1*');
    result = result.replace(/~~(.+?)~~/g, '~$1~');

    const mentionEntries = [...mMap.entries()].sort((a, b) => b[0].length - a[0].length);
    for (const [displayName, userId] of mentionEntries) {
      result = result.replaceAll(`@${displayName}`, `<@${userId}>`);
    }

    const channelEntries = [...cMap.entries()].sort((a, b) => b[0].length - a[0].length);
    for (const [chName, chId] of channelEntries) {
      result = result.replaceAll(`#${chName}`, `<#${chId}|${chName}>`);
    }

    return result;
  };

  // メッセージ取得
  const fetchMessages = useCallback(async (cursor?: string) => {
    try {
      const params = new URLSearchParams({ workspaceId, channelId, channelName });
      if (cursor) params.set('cursor', cursor);
      const res = await fetch(`/api/slack/channels/messages?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      if (cursor) {
        setMessages((prev) => {
          const merged = [...prev, ...data.messages];
          setCachedMessages(channelId, merged, data.nextCursor || undefined);
          return merged;
        });
      } else {
        setMessages(data.messages);
        setCachedMessages(channelId, data.messages, data.nextCursor || undefined);
      }
      setNextCursor(data.nextCursor || undefined);
    } catch {
      // ignore
    }
  }, [workspaceId, channelId, channelName, setCachedMessages]);

  // 初回ロード（キャッシュがあれば即時表示 → バックグラウンド更新）
  useEffect(() => {
    setThreadParentTs(null);

    const cached = getCachedMessages(channelId);
    if (cached) {
      // キャッシュを即時表示
      setMessages(cached.messages);
      setNextCursor(cached.nextCursor);
      setLoading(false);
      // バックグラウンドで最新を取得
      setRefreshing(true);
      fetchMessages().finally(() => setRefreshing(false));
    } else {
      // キャッシュなし → 通常ロード
      setLoading(true);
      setMessages([]);
      setNextCursor(undefined);
      fetchMessages().finally(() => setLoading(false));
    }
  }, [fetchMessages, channelId, getCachedMessages]);

  // 新メッセージでスクロール
  useEffect(() => {
    if (!loadingMore) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, loadingMore]);

  // 過去メッセージ
  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const scrollEl = scrollContainerRef.current;
    const prevScrollHeight = scrollEl?.scrollHeight || 0;
    await fetchMessages(nextCursor);
    requestAnimationFrame(() => {
      if (scrollEl) {
        scrollEl.scrollTop = scrollEl.scrollHeight - prevScrollHeight;
      }
    });
    setLoadingMore(false);
  }, [nextCursor, loadingMore, fetchMessages]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (el.scrollTop < 50 && nextCursor && !loadingMore) {
      handleLoadMore();
    }
  }, [nextCursor, loadingMore, handleLoadMore]);

  // テキストエリア高さ（チャネル投稿）
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 100) + 'px';
    }
  }, [postText]);

  // テキストエリア高さ（スレッド返信）
  useEffect(() => {
    const ta = threadTextareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 80) + 'px';
    }
  }, [threadReplyText]);

  // ファイル選択（チャネル投稿）
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setAttachedFiles((prev) => [...prev, ...Array.from(files)]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
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

  // ファイル選択（スレッド返信）
  const handleThreadFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setThreadAttachedFiles((prev) => [...prev, ...Array.from(files)]);
    }
    if (threadFileInputRef.current) threadFileInputRef.current.value = '';
  };

  const removeThreadAttachedFile = (index: number) => {
    setThreadAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleThreadDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleThreadDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      setThreadAttachedFiles((prev) => [...prev, ...Array.from(files)]);
    }
  };

  // 絵文字挿入（投稿テキスト）
  const insertPostEmoji = (emojiName: string) => {
    const emojiText = `:${emojiName}: `;
    const ta = textareaRef.current;
    if (ta) {
      const start = ta.selectionStart || postText.length;
      const newText = postText.slice(0, start) + emojiText + postText.slice(start);
      setPostText(newText);
      setTimeout(() => {
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + emojiText.length;
      }, 0);
    } else {
      setPostText((prev) => prev + emojiText);
    }
    setShowPostEmojiPicker(false);
  };

  // 絵文字挿入（スレッド返信テキスト）
  const insertThreadEmoji = (emojiName: string) => {
    const emojiText = `:${emojiName}: `;
    const ta = threadTextareaRef.current;
    if (ta) {
      const start = ta.selectionStart || threadReplyText.length;
      const newText = threadReplyText.slice(0, start) + emojiText + threadReplyText.slice(start);
      setThreadReplyText(newText);
      setTimeout(() => {
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + emojiText.length;
      }, 0);
    } else {
      setThreadReplyText((prev) => prev + emojiText);
    }
    setShowThreadEmojiPicker(false);
  };

  // 投稿
  const handlePost = async () => {
    if ((!postText.trim() && attachedFiles.length === 0) || posting) return;
    setPosting(true);
    const slackText = convertToSlackFormat(postText.trim(), mentionMapRef.current, channelMapRef.current);
    try {
      if (attachedFiles.length > 0) {
        for (const file of attachedFiles) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('workspaceId', workspaceId);
          formData.append('channelId', channelId);
          if (slackText && attachedFiles.indexOf(file) === 0) {
            formData.append('initialComment', slackText);
          }
          await fetch('/api/slack/files/upload', {
            method: 'POST',
            body: formData,
          });
        }
        setPostText('');
        setAttachedFiles([]);
        mentionMapRef.current.clear();
        channelMapRef.current.clear();
        setMessages([]);
        await fetchMessages();
      } else {
        const res = await fetch('/api/slack/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId, channelId, text: slackText }),
        });
        if (res.ok) {
          setPostText('');
          mentionMapRef.current.clear();
          channelMapRef.current.clear();
          setMessages([]);
          await fetchMessages();
        }
      }
    } catch {
      // ignore
    } finally {
      setPosting(false);
    }
  };

  // スレッド表示
  const openThread = async (parentTs: string) => {
    setThreadParentTs(parentTs);
    setThreadLoading(true);
    setThreadMessages([]);
    try {
      const params = new URLSearchParams({ workspaceId, channelId });
      // fetchThreadMessages がスレッドを返す
      const res = await fetch(`/api/slack/channels/messages?${params}&threadTs=${parentTs}`);
      if (res.ok) {
        const data = await res.json();
        setThreadMessages(data.messages || []);
      }
    } catch {
      // ignore
    } finally {
      setThreadLoading(false);
    }
  };

  // スレッド返信
  const handleThreadReply = async () => {
    if ((!threadReplyText.trim() && threadAttachedFiles.length === 0) || threadPosting || !threadParentTs) return;
    setThreadPosting(true);
    const slackText = convertToSlackFormat(threadReplyText.trim(), threadMentionMapRef.current, threadChannelMapRef.current);
    try {
      if (threadAttachedFiles.length > 0) {
        for (const file of threadAttachedFiles) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('workspaceId', workspaceId);
          formData.append('channelId', channelId);
          formData.append('threadTs', threadParentTs);
          if (slackText && threadAttachedFiles.indexOf(file) === 0) {
            formData.append('initialComment', slackText);
          }
          await fetch('/api/slack/files/upload', {
            method: 'POST',
            body: formData,
          });
        }
        setThreadReplyText('');
        setThreadAttachedFiles([]);
        threadMentionMapRef.current.clear();
        threadChannelMapRef.current.clear();
        await openThread(threadParentTs);
      } else {
        const res = await fetch('/api/slack/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId,
            channelId,
            text: slackText,
            threadTs: threadParentTs,
          }),
        });
        if (res.ok) {
          setThreadReplyText('');
          threadMentionMapRef.current.clear();
          threadChannelMapRef.current.clear();
          await openThread(threadParentTs);
        }
      }
    } catch {
      // ignore
    } finally {
      setThreadPosting(false);
    }
  };

  // リアクション追加
  const handleReactionAdd = async (msg: SlackMessage, emojiName: string) => {
    setEmojiPickerMsgTs(null);
    try {
      await fetch('/api/slack/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          channelId,
          messageTs: msg.ts,
          emojiName,
          action: 'add',
        }),
      });
      // リフレッシュ
      setMessages([]);
      await fetchMessages();
    } catch {
      // ignore
    }
  };

  // スレッドメッセージのリアクション追加
  const handleThreadReactionAdd = async (msg: SlackMessage, emojiName: string) => {
    setThreadEmojiPickerMsgTs(null);
    try {
      await fetch('/api/slack/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          channelId,
          messageTs: msg.ts,
          emojiName,
          action: 'add',
        }),
      });
      // スレッドをリフレッシュ
      if (threadParentTs) {
        await openThread(threadParentTs);
      }
    } catch {
      // ignore
    }
  };

  // AI アシスト
  const handleAiAssist = async () => {
    setShowAiPanel(!showAiPanel);
    if (!showAiPanel && aiSuggestions.length === 0) {
      setAiLoading(true);
      try {
        const contextMessages = threadParentTs ? threadMessages : messages.slice(-10);
        const res = await fetch('/api/ai/assist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: contextMessages }),
        });
        if (res.ok) {
          const data = await res.json();
          setAiSuggestions(data.suggestions || []);
        }
      } catch {
        // ignore
      } finally {
        setAiLoading(false);
      }
    }
  };

  const handleRefresh = async () => {
    clearChannelCache(channelId);
    setMessages([]);
    setNextCursor(undefined);
    setLoading(true);
    await fetchMessages();
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // サジェストドロップダウンのキーボード操作
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
      handlePost();
    }
  };

  const handleThreadKeyDown = (e: React.KeyboardEvent) => {
    // スレッド用サジェストドロップダウンのキーボード操作
    if (threadSuggestType && threadSuggestItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setThreadSuggestIndex((prev) => Math.min(prev + 1, threadSuggestItems.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setThreadSuggestIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          applyThreadSuggestion(threadSuggestItems[threadSuggestIndex]);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setThreadSuggestType(null);
        return;
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleThreadReply();
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0F1117]">
        <div className="text-xs text-gray-600">#{channelName} を読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#0F1117] overflow-hidden">
      {/* チャネルヘッダー */}
      <div className="h-10 bg-[#1A1D27] border-b border-white/10 flex items-center px-4 shrink-0">
        <span className="text-sm text-gray-300">
          <span className="text-[#4A9EFF]">#</span> {channelName}
        </span>
        {refreshing && (
          <span className="ml-2 text-[10px] text-gray-500 animate-pulse">更新中...</span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {/* 並び替え・フィルタ */}
          <div className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="text-gray-500 hover:text-gray-300 transition p-1 rounded hover:bg-white/5 flex items-center gap-1"
              title="表示設定"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
              </svg>
              <span className="text-[10px]">
                {sortOrder === 'asc' ? '古い順' : '新しい順'}
              </span>
            </button>
            {showSortMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-[#1A1D27] border border-white/10 rounded-lg shadow-lg py-1 min-w-[160px]">
                  <div className="px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider">並び順</div>
                  <button
                    onClick={() => { setSortOrder('asc'); setShowSortMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition hover:bg-white/5 flex items-center gap-2 ${
                      sortOrder === 'asc' ? 'text-[#4A9EFF]' : 'text-gray-400'
                    }`}
                  >
                    {sortOrder === 'asc' && <span className="text-[10px]">✓</span>}
                    <span className={sortOrder === 'asc' ? '' : 'ml-4'}>古い順（時系列）</span>
                  </button>
                  <button
                    onClick={() => { setSortOrder('desc'); setShowSortMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition hover:bg-white/5 flex items-center gap-2 ${
                      sortOrder === 'desc' ? 'text-[#4A9EFF]' : 'text-gray-400'
                    }`}
                  >
                    {sortOrder === 'desc' && <span className="text-[10px]">✓</span>}
                    <span className={sortOrder === 'desc' ? '' : 'ml-4'}>新しい順</span>
                  </button>

                  <div className="border-t border-white/5 my-1" />
                  <div className="px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider">フィルタ</div>
                  <button
                    onClick={() => { setShowThreadReplies(!showThreadReplies); setShowSortMenu(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-400 transition hover:bg-white/5 flex items-center gap-2"
                  >
                    <span className={`text-[10px] ${showThreadReplies ? 'text-[#4A9EFF]' : 'text-gray-600'}`}>
                      {showThreadReplies ? '✓' : '　'}
                    </span>
                    スレッド返信も表示
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            onClick={handleRefresh}
            className="text-gray-500 hover:text-gray-300 transition p-1 rounded hover:bg-white/5"
            title="更新"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={() => setActiveChannel(null)}
            className="text-gray-500 hover:text-[#E74C3C] transition p-1 rounded hover:bg-white/5"
            title="閉じる"
          >
            &#10005;
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* メッセージ一覧 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-3"
            onScroll={handleScroll}
          >
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

            {filteredMessages.length === 0 && (
              <div className="text-xs text-gray-600 text-center py-4">メッセージはありません</div>
            )}

            {filteredMessages.map((msg, i) => {
              const isThreadParent = msg.ts === msg.threadTs || (!msg.threadTs);
              const replyCount = msg.replyCount || 0;

              return (
                <div key={msg.id || i} className="flex gap-2.5 group relative">
                  {msg.avatarUrl ? (
                    <img src={msg.avatarUrl} alt={msg.userName} className="w-8 h-8 rounded shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-8 h-8 rounded bg-[#4A9EFF]/20 flex items-center justify-center text-[10px] text-[#4A9EFF] shrink-0 mt-0.5">
                      {(msg.userName || '??').slice(0, 2).toUpperCase()}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-semibold text-gray-300">{msg.userName}</span>
                      <span className="text-[10px] text-gray-600">{formatTs(msg.ts)}</span>
                    </div>
                    <SlackMessageText text={msg.text} customEmojis={customEmojis} />

                    {msg.files && msg.files.length > 0 && (
                      <FileAttachment files={msg.files} workspaceId={workspaceId} />
                    )}

                    {msg.reactions && msg.reactions.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {msg.reactions.map((reaction) => {
                          const resolved = resolveEmoji(reaction.name, customEmojis);
                          return (
                            <span
                              key={reaction.name}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] bg-white/5 border border-white/10 text-gray-400"
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

                    {/* スレッドリンク */}
                    {isThreadParent && replyCount > 0 && (
                      <button
                        onClick={() => openThread(msg.ts)}
                        className="mt-1 text-[10px] text-[#4A9EFF] hover:text-[#4A9EFF]/80 transition"
                      >
                        {replyCount}件の返信
                      </button>
                    )}
                    {isThreadParent && replyCount === 0 && (
                      <button
                        onClick={() => openThread(msg.ts)}
                        className="mt-1 text-[10px] text-gray-600 hover:text-gray-400 opacity-0 group-hover:opacity-100 transition"
                      >
                        スレッドで返信
                      </button>
                    )}
                  </div>

                  {/* メモ保存ボタン */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMemoTargetMsg(msg);
                      setMemoSaved(false);
                      if (memoProjects.length === 0) {
                        fetch('/api/projects').then(r => r.json()).then(data => {
                          if (Array.isArray(data)) setMemoProjects(data);
                        }).catch(() => {});
                      }
                    }}
                    className="absolute top-0 right-7 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center rounded bg-[#1A1D27] hover:bg-white/10 text-gray-500 hover:text-gray-300 text-xs border border-white/10"
                    title="プロジェクトメモに保存"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </button>

                  {/* リアクション追加 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEmojiPickerMsgTs(emojiPickerMsgTs === msg.ts ? null : msg.ts);
                    }}
                    className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center rounded bg-[#1A1D27] hover:bg-white/10 text-gray-500 hover:text-gray-300 text-xs border border-white/10"
                  >
                    <span className="text-[11px]">{'\u{1F642}'}</span>
                  </button>

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

          {/* プロジェクトメモ保存ポップオーバー */}
          {memoTargetMsg && (
            <div className="border-t border-white/5 px-3 py-2 bg-[#1A1D27] shrink-0">
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
                <div className="text-[10px] text-gray-600">プロジェクトがありません。/memo で作成してください。</div>
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
                              messageTs: memoTargetMsg.ts,
                              messageUser: memoTargetMsg.userName,
                              messageText: memoTargetMsg.text,
                              channelId,
                              workspaceId,
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

          {/* 投稿フォーム */}
          <div
            className="border-t border-white/5 p-3 shrink-0"
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

            {/* サジェストドロップダウン（メイン投稿） */}
            <div className="relative">
              {suggestType && suggestItems.length > 0 && (
                <div className="absolute bottom-full left-0 mb-1 w-64 bg-[#1A1D27] border border-white/10 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
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
              <textarea
                ref={textareaRef}
                value={postText}
                onChange={handlePostTextChange}
                onKeyDown={handleKeyDown}
                placeholder={`#${channelName} に投稿... (Cmd+Enter)`}
                rows={1}
                className="w-full bg-[#1A1D27] border border-white/10 rounded px-3 py-2 text-xs text-white placeholder-gray-600 resize-none focus:outline-none focus:border-[#4A9EFF] transition"
              />
            </div>

            {/* 隠しファイルinput */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />

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
                  onClick={() => setShowPostEmojiPicker(!showPostEmojiPicker)}
                  className={`px-1.5 py-1 text-[10px] rounded transition ${
                    showPostEmojiPicker
                      ? 'bg-[#4A9EFF]/20 text-[#4A9EFF]'
                      : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-400'
                  }`}
                  title="絵文字を挿入"
                >
                  <span className="text-sm">{'\u{1F642}'}</span>
                </button>
                {showPostEmojiPicker && (
                  <EmojiPicker
                    onSelect={insertPostEmoji}
                    onClose={() => setShowPostEmojiPicker(false)}
                    workspaceId={workspaceId}
                    customEmojis={customEmojis}
                  />
                )}
              </div>

              <button
                onClick={handleAiAssist}
                className={`px-2 py-1 text-[10px] rounded transition ${
                  showAiPanel
                    ? 'bg-purple-500/30 text-purple-400'
                    : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                }`}
              >
                AI補助
              </button>
              <button
                onClick={handlePost}
                disabled={(!postText.trim() && attachedFiles.length === 0) || posting}
                className="px-3 py-1 text-[10px] rounded bg-[#4A9EFF]/20 text-[#4A9EFF] hover:bg-[#4A9EFF]/30 transition disabled:opacity-30 ml-auto"
              >
                {posting ? '送信中...' : attachedFiles.length > 0 ? `投稿 (${attachedFiles.length}ファイル)` : '投稿'}
              </button>
            </div>

            {/* AI パネル */}
            {showAiPanel && (
              <div className="mt-2 p-2 rounded bg-[#1A1D27] border border-purple-500/20">
                {aiLoading ? (
                  <div className="text-[10px] text-gray-500">AI提案を生成中...</div>
                ) : aiSuggestions.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="text-[10px] text-purple-400 mb-1">AI提案:</div>
                    {aiSuggestions.map((s, i) => (
                      <div
                        key={i}
                        className="group flex items-start gap-2 p-1.5 rounded hover:bg-white/5 cursor-pointer transition"
                        onClick={() => {
                          setPostText(s);
                          setShowAiPanel(false);
                        }}
                      >
                        <span className="text-[10px] text-gray-400 shrink-0">{i + 1}.</span>
                        <span className="text-[10px] text-gray-300 flex-1">{s}</span>
                        <span className="text-[9px] text-[#4A9EFF] opacity-0 group-hover:opacity-100 shrink-0">使用</span>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        setAiSuggestions([]);
                        handleAiAssist();
                      }}
                      className="text-[9px] text-gray-500 hover:text-gray-400 transition"
                    >
                      再生成
                    </button>
                  </div>
                ) : (
                  <div className="text-[10px] text-gray-500">提案がありません</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* スレッドパネル */}
        {threadParentTs && (
          <div className="w-80 border-l border-white/10 flex flex-col bg-[#1A1D27] shrink-0">
            <div className="h-10 flex items-center justify-between px-3 border-b border-white/5 shrink-0">
              <span className="text-xs text-gray-400">スレッド</span>
              <button
                onClick={() => setThreadParentTs(null)}
                className="text-gray-500 hover:text-gray-300 transition text-xs"
              >
                &#10005;
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {threadLoading ? (
                <div className="text-[10px] text-gray-600 text-center py-4">読み込み中...</div>
              ) : (
                threadMessages.map((msg, i) => (
                  <div key={msg.id || i} className="flex gap-2 group relative">
                    {msg.avatarUrl ? (
                      <img src={msg.avatarUrl} alt={msg.userName} className="w-7 h-7 rounded shrink-0 mt-0.5" />
                    ) : (
                      <div className="w-7 h-7 rounded bg-[#4A9EFF]/20 flex items-center justify-center text-[9px] text-[#4A9EFF] shrink-0 mt-0.5">
                        {(msg.userName || '??').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[11px] font-semibold text-gray-300">{msg.userName}</span>
                        <span className="text-[10px] text-gray-600">{formatTs(msg.ts)}</span>
                      </div>
                      <SlackMessageText text={msg.text} customEmojis={customEmojis} />
                      {msg.files && msg.files.length > 0 && (
                        <FileAttachment files={msg.files} workspaceId={workspaceId} />
                      )}
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {msg.reactions.map((reaction) => {
                            const resolved = resolveEmoji(reaction.name, customEmojis);
                            return (
                              <span
                                key={reaction.name}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] bg-white/5 border border-white/10 text-gray-400"
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

                    {/* メモ保存ボタン */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMemoTargetMsg(msg);
                        setMemoSaved(false);
                        if (memoProjects.length === 0) {
                          fetch('/api/projects').then(r => r.json()).then(data => {
                            if (Array.isArray(data)) setMemoProjects(data);
                          }).catch(() => {});
                        }
                      }}
                      className="absolute top-0 right-7 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded bg-[#1A1D27] hover:bg-white/10 text-gray-500 hover:text-gray-300 text-xs border border-white/10"
                      title="プロジェクトメモに保存"
                    >
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </button>

                    {/* リアクション追加 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setThreadEmojiPickerMsgTs(threadEmojiPickerMsgTs === msg.ts ? null : msg.ts);
                      }}
                      className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded bg-[#1A1D27] hover:bg-white/10 text-gray-500 hover:text-gray-300 text-xs border border-white/10"
                    >
                      <span className="text-[10px]">{'\u{1F642}'}</span>
                    </button>

                    {threadEmojiPickerMsgTs === msg.ts && (
                      <EmojiPicker
                        onSelect={(emojiName) => handleThreadReactionAdd(msg, emojiName)}
                        onClose={() => setThreadEmojiPickerMsgTs(null)}
                        workspaceId={workspaceId}
                        customEmojis={customEmojis}
                      />
                    )}
                  </div>
                ))
              )}
              <div ref={threadEndRef} />
            </div>

            {/* スレッド返信 */}
            <div
              className="border-t border-white/5 p-2 shrink-0"
              onDragOver={handleThreadDragOver}
              onDrop={handleThreadDrop}
            >
              {/* スレッド添付ファイルプレビュー */}
              {threadAttachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {threadAttachedFiles.map((file, i) => (
                    <div
                      key={`thread-${file.name}-${i}`}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#4A9EFF]/10 border border-[#4A9EFF]/20 text-[9px]"
                    >
                      {file.type.startsWith('image/') ? (
                        <img
                          src={URL.createObjectURL(file)}
                          alt={file.name}
                          className="w-5 h-5 rounded object-cover"
                        />
                      ) : (
                        <svg className="w-3 h-3 text-[#4A9EFF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      )}
                      <span className="text-gray-400 truncate max-w-[60px]">{file.name}</span>
                      <button
                        onClick={() => removeThreadAttachedFile(i)}
                        className="text-gray-600 hover:text-[#E74C3C] transition ml-0.5"
                      >
                        &#10005;
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* サジェストドロップダウン（スレッド返信） */}
              <div className="relative">
                {threadSuggestType && threadSuggestItems.length > 0 && (
                  <div className="absolute bottom-full left-0 mb-1 w-60 bg-[#1A1D27] border border-white/10 rounded-lg shadow-xl z-50 max-h-40 overflow-y-auto">
                    {threadSuggestType === 'mention' &&
                      threadSuggestItems.map((item, i) => {
                        const user = item as UserOption;
                        return (
                          <button
                            key={user.id}
                            onClick={() => applyThreadSuggestion(user)}
                            className={`w-full text-left flex items-center gap-2 px-2.5 py-1.5 text-[10px] transition ${
                              i === threadSuggestIndex
                                ? 'bg-[#4A9EFF]/15 text-white'
                                : 'text-gray-400 hover:bg-white/5'
                            }`}
                          >
                            {user.avatarUrl ? (
                              <img src={user.avatarUrl} alt="" className="w-4 h-4 rounded shrink-0" />
                            ) : (
                              <div className="w-4 h-4 rounded bg-[#4A9EFF]/20 flex items-center justify-center text-[7px] text-[#4A9EFF] shrink-0">
                                {user.name.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <span className="font-medium text-gray-300 truncate">{user.realName}</span>
                            <span className="text-gray-600 text-[9px]">@{user.name}</span>
                          </button>
                        );
                      })}
                    {threadSuggestType === 'channel' &&
                      threadSuggestItems.map((item, i) => {
                        const ch = item as ChannelOption;
                        return (
                          <button
                            key={ch.id}
                            onClick={() => applyThreadSuggestion(ch)}
                            className={`w-full text-left px-2.5 py-1.5 text-[10px] transition ${
                              i === threadSuggestIndex
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
                <textarea
                  ref={threadTextareaRef}
                  value={threadReplyText}
                  onChange={handleThreadTextChange}
                  onKeyDown={handleThreadKeyDown}
                  placeholder="スレッドに返信... (Cmd+Enter)"
                  rows={1}
                  className="w-full bg-[#0F1117] border border-white/10 rounded px-2 py-1.5 text-[11px] text-white placeholder-gray-600 resize-none focus:outline-none focus:border-[#4A9EFF] transition"
                />
              </div>

              {/* 隠しファイルinput（スレッド用） */}
              <input
                ref={threadFileInputRef}
                type="file"
                multiple
                onChange={handleThreadFileSelect}
                className="hidden"
              />

              <div className="flex items-center gap-1 mt-1">
                {/* スレッド用ファイル添付ボタン */}
                <button
                  onClick={() => threadFileInputRef.current?.click()}
                  className="px-1 py-0.5 text-[10px] rounded bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-400 transition"
                  title="ファイルを添付"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </button>

                {/* スレッド用絵文字ボタン */}
                <div className="relative">
                  <button
                    onClick={() => setShowThreadEmojiPicker(!showThreadEmojiPicker)}
                    className={`px-1 py-0.5 text-[10px] rounded transition ${
                      showThreadEmojiPicker
                        ? 'bg-[#4A9EFF]/20 text-[#4A9EFF]'
                        : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-400'
                    }`}
                    title="絵文字を挿入"
                  >
                    <span className="text-xs">{'\u{1F642}'}</span>
                  </button>
                  {showThreadEmojiPicker && (
                    <EmojiPicker
                      onSelect={insertThreadEmoji}
                      onClose={() => setShowThreadEmojiPicker(false)}
                      workspaceId={workspaceId}
                      customEmojis={customEmojis}
                    />
                  )}
                </div>

                <button
                  onClick={handleThreadReply}
                  disabled={(!threadReplyText.trim() && threadAttachedFiles.length === 0) || threadPosting}
                  className="px-2 py-0.5 text-[10px] rounded bg-[#4A9EFF]/20 text-[#4A9EFF] hover:bg-[#4A9EFF]/30 transition disabled:opacity-30 ml-auto"
                >
                  {threadPosting ? '送信中...' : threadAttachedFiles.length > 0 ? `返信 (${threadAttachedFiles.length}ファイル)` : '返信'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatTs(ts: string): string {
  try {
    const unixTs = parseFloat(ts);
    if (!isNaN(unixTs) && unixTs > 1000000000) {
      const date = new Date(unixTs * 1000);
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      if (isToday) {
        return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      }
      return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }) + ' ' +
        date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    }
    return '';
  } catch {
    return '';
  }
}
