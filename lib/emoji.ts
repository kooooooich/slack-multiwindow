/**
 * カスタム絵文字の取得・キャッシュユーティリティ
 */

import { getSlackClient } from './slack';

interface EmojiCache {
  data: Record<string, string>;
  fetchedAt: number;
}

// ワークスペース(botToken)ごとのキャッシュ (TTL 10分)
const emojiCache = new Map<string, EmojiCache>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10分

/**
 * カスタム絵文字一覧を取得（キャッシュ付き）
 * @returns Record<emojiName, imageUrl> マップ
 */
export async function fetchCustomEmojis(
  botToken: string,
): Promise<Record<string, string>> {
  const cached = emojiCache.get(botToken);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const client = getSlackClient(botToken);
    const result = await client.emoji.list();

    if (!result.ok || !result.emoji) {
      return cached?.data || {};
    }

    const emojis: Record<string, string> = {};

    // エイリアスを解決
    for (const [name, value] of Object.entries(result.emoji)) {
      if (typeof value === 'string') {
        if (value.startsWith('alias:')) {
          // エイリアスは後で解決
          continue;
        }
        emojis[name] = value;
      }
    }

    // エイリアス解決（2パス目）
    for (const [name, value] of Object.entries(result.emoji)) {
      if (typeof value === 'string' && value.startsWith('alias:')) {
        const target = value.slice(6); // 'alias:' を除去
        if (emojis[target]) {
          emojis[name] = emojis[target];
        }
      }
    }

    emojiCache.set(botToken, { data: emojis, fetchedAt: Date.now() });
    return emojis;
  } catch (error) {
    console.error('Failed to fetch custom emojis:', error);
    return cached?.data || {};
  }
}

/**
 * キャッシュをクリア
 */
export function clearEmojiCache(botToken?: string): void {
  if (botToken) {
    emojiCache.delete(botToken);
  } else {
    emojiCache.clear();
  }
}
