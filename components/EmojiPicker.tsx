'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { STANDARD_EMOJI } from '@/lib/mrkdwn';

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
  { name: '100', emoji: '\u{1F4AF}' },
  { name: 'muscle', emoji: '\u{1F4AA}' },
  { name: 'star', emoji: '\u{2B50}' },
  { name: 'sparkles', emoji: '\u{2728}' },
  { name: 'wave', emoji: '\u{1F44B}' },
  { name: 'ok_hand', emoji: '\u{1F44C}' },
] as const;

interface EmojiPickerProps {
  onSelect: (emojiName: string) => void;
  onClose: () => void;
  workspaceId?: string;
  customEmojis?: Record<string, string>;
}

const EmojiPicker = React.memo(function EmojiPicker({
  onSelect,
  onClose,
  workspaceId,
  customEmojis: externalCustomEmojis,
}: EmojiPickerProps) {
  const [tab, setTab] = useState<'common' | 'custom'>('common');
  const [searchQuery, setSearchQuery] = useState('');
  const [customEmojis, setCustomEmojis] = useState<Record<string, string>>(
    externalCustomEmojis || {},
  );
  const [loadingCustom, setLoadingCustom] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // 外部クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // カスタム絵文字をフェッチ
  const fetchCustom = useCallback(async () => {
    if (!workspaceId || Object.keys(customEmojis).length > 0) return;
    setLoadingCustom(true);
    try {
      const res = await fetch(`/api/slack/emoji?workspaceId=${workspaceId}`);
      if (res.ok) {
        const data = await res.json();
        setCustomEmojis(data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingCustom(false);
    }
  }, [workspaceId, customEmojis]);

  // カスタムタブに切り替え時にフェッチ
  useEffect(() => {
    if (tab === 'custom') {
      fetchCustom();
    }
  }, [tab, fetchCustom]);

  const filteredCommon = searchQuery
    ? COMMON_EMOJIS.filter((e) => e.name.includes(searchQuery.toLowerCase()))
    : COMMON_EMOJIS;

  const filteredCustom = searchQuery
    ? Object.entries(customEmojis).filter(([name]) =>
        name.includes(searchQuery.toLowerCase()),
      )
    : Object.entries(customEmojis);

  return (
    <div
      ref={pickerRef}
      className="absolute top-0 right-8 z-50 bg-[#1A1D27] border border-white/10 rounded-lg shadow-xl p-2 w-64"
    >
      {/* 検索 */}
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="絵文字を検索..."
        className="w-full bg-[#0F1117] border border-white/10 rounded px-2 py-1 text-[10px] text-white placeholder-gray-600 focus:outline-none focus:border-[#4A9EFF] mb-2"
        autoFocus
      />

      {/* タブ */}
      <div className="flex gap-1 mb-2">
        <button
          onClick={() => setTab('common')}
          className={`px-2 py-0.5 text-[10px] rounded transition ${
            tab === 'common'
              ? 'bg-[#4A9EFF]/20 text-[#4A9EFF]'
              : 'text-gray-500 hover:text-gray-400'
          }`}
        >
          よく使う
        </button>
        <button
          onClick={() => setTab('custom')}
          className={`px-2 py-0.5 text-[10px] rounded transition ${
            tab === 'custom'
              ? 'bg-[#4A9EFF]/20 text-[#4A9EFF]'
              : 'text-gray-500 hover:text-gray-400'
          }`}
        >
          カスタム
        </button>
      </div>

      {/* 絵文字グリッド */}
      <div className="max-h-48 overflow-y-auto">
        {tab === 'common' ? (
          <div className="grid grid-cols-6 gap-0.5">
            {filteredCommon.map(({ name, emoji }) => (
              <button
                key={name}
                onClick={() => {
                  onSelect(name);
                  onClose();
                }}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 text-sm transition"
                title={`:${name}:`}
              >
                {emoji}
              </button>
            ))}
            {filteredCommon.length === 0 && (
              <div className="col-span-6 text-[10px] text-gray-600 py-2 text-center">
                見つかりません
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-6 gap-0.5">
            {loadingCustom && (
              <div className="col-span-6 text-[10px] text-gray-600 py-2 text-center">
                読み込み中...
              </div>
            )}
            {filteredCustom.map(([name, url]) => (
              <button
                key={name}
                onClick={() => {
                  onSelect(name);
                  onClose();
                }}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition p-1"
                title={`:${name}:`}
              >
                <img
                  src={url}
                  alt={`:${name}:`}
                  className="w-5 h-5 object-contain"
                  loading="lazy"
                />
              </button>
            ))}
            {!loadingCustom && filteredCustom.length === 0 && (
              <div className="col-span-6 text-[10px] text-gray-600 py-2 text-center">
                {searchQuery ? '見つかりません' : 'カスタム絵文字はありません'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default EmojiPicker;

export { COMMON_EMOJIS, STANDARD_EMOJI };
