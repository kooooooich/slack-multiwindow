'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import type { Task } from '@/types';

// 検索ワードをハイライト表示
function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    regex.test(part) ? (
      <span key={i} className="bg-[#4A9EFF]/30 text-[#4A9EFF] rounded-sm px-0.5">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

// Slack mrkdwn を表示名に変換
function stripMrkdwn(text: string) {
  return text
    .replace(/<@[A-Z0-9]+\|([^>]+)>/g, '@$1')
    .replace(/<@([A-Z0-9]+)>/g, '@$1')
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1')
    .replace(/<#([A-Z0-9]+)>/g, '#$1')
    .replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, '$2')
    .replace(/<(https?:\/\/[^>]+)>/g, '$1');
}

export default function SearchBar() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Task[]>([]);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const openWindow = useAppStore((s) => s.openWindow);
  const setActiveChannel = useAppStore((s) => s.setActiveChannel);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 外部クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 検索実行
  const doSearch = useCallback(async (q: string, status: string | null) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const params = new URLSearchParams({ q: q.trim() });
      if (status) params.set('status', status);
      const res = await fetch(`/api/tasks/search?${params}`);
      if (res.ok) {
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
        setSelectedIndex(0);
      }
    } catch {
      // ignore
    } finally {
      setIsSearching(false);
    }
  }, []);

  // デバウンス検索
  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(value, statusFilter);
    }, 300);
  };

  // ステータスフィルタ変更
  const handleStatusChange = (status: string | null) => {
    setStatusFilter(status);
    doSearch(query, status);
  };

  // 結果クリック
  const handleSelect = (task: Task) => {
    setActiveChannel(null);
    openWindow(task.id);
    setIsOpen(false);
    setQuery('');
    setResults([]);
  };

  // キーボードナビゲーション
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      return;
    }
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    }
  };

  const formatTime = (ts: string) => {
    try {
      const unixTs = parseFloat(ts);
      if (!isNaN(unixTs) && unixTs > 1000000000) {
        const date = new Date(unixTs * 1000);
        return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }) + ' ' +
          date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      }
      return '';
    } catch {
      return '';
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* 検索トグル */}
      {!isOpen ? (
        <button
          onClick={() => {
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          className="text-gray-500 hover:text-gray-300 transition p-1 rounded hover:bg-white/5"
          title="メッセージ検索"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      ) : (
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="メッセージを検索..."
          className="w-48 bg-[#0F1117] border border-white/10 rounded px-2.5 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[#4A9EFF] transition"
        />
      )}

      {/* 検索結果ドロップダウン */}
      {isOpen && query.trim() && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-[#1A1D27] border border-white/10 rounded-lg shadow-xl z-[100] overflow-hidden">
          {/* ステータスフィルタ */}
          <div className="flex border-b border-white/5 px-1">
            {[
              { label: '全て', value: null },
              { label: '未投稿', value: 'open' },
              { label: '完了', value: 'completed' },
            ].map(({ label, value }) => (
              <button
                key={label}
                onClick={() => handleStatusChange(value)}
                className={`px-2 py-1.5 text-[10px] transition border-b-2 ${
                  statusFilter === value
                    ? 'text-[#4A9EFF] border-[#4A9EFF]'
                    : 'text-gray-500 border-transparent hover:text-gray-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 結果リスト */}
          <div className="max-h-64 overflow-y-auto">
            {isSearching && (
              <div className="text-[10px] text-gray-600 px-3 py-2">検索中...</div>
            )}
            {!isSearching && results.length === 0 && (
              <div className="text-[10px] text-gray-600 px-3 py-4 text-center">
                一致するメッセージはありません
              </div>
            )}
            {results.map((task, i) => (
              <button
                key={task.id}
                onClick={() => handleSelect(task)}
                className={`w-full text-left px-3 py-2 transition ${
                  i === selectedIndex ? 'bg-[#4A9EFF]/10' : 'hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] text-[#4A9EFF]">#</span>
                  <span className="text-[10px] text-gray-300">{highlightText(task.channelName, query)}</span>
                  <span className={`text-[9px] px-1 py-0.5 rounded ${
                    task.status === 'open'
                      ? 'bg-[#E74C3C]/10 text-[#E74C3C]'
                      : 'bg-[#2ECC71]/10 text-[#2ECC71]'
                  }`}>
                    {task.status === 'open' ? '未投稿' : '完了'}
                  </span>
                  <span className="text-[9px] text-gray-600 ml-auto">
                    {formatTime(task.triggerMessage.ts)}
                  </span>
                </div>
                <div className="text-[10px] text-gray-400 truncate">
                  {highlightText(stripMrkdwn(task.triggerMessage.text).slice(0, 60), query)}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
