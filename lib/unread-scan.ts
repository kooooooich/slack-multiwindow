/**
 * 未読メンションスキャン
 *
 * ログイン時にワークスペースの全チャンネルをスキャンし、
 * targetUserId へのメンションを含む未読メッセージを検出する。
 */

import { getSlackClient, resolveUserProfile, getChannelName } from './slack';
import type { Workspace, SlackMessage } from '@/types';

interface ScanResult {
  messages: SlackMessage[];
  scannedChannels: number;
  foundMentions: number;
}

/**
 * ワークスペースの未読メンションをスキャンする
 *
 * 方式:
 * 1. userToken がある場合: search.messages API で効率的に検索
 * 2. userToken がない場合: conversations.history を各チャンネルで巡回
 */
export async function scanUnreadMentions(
  workspace: Workspace,
  existingThreadTs: Set<string>,
): Promise<ScanResult> {
  const { botToken, targetUserId, lastScanAt } = workspace;

  if (!targetUserId) {
    return { messages: [], scannedChannels: 0, foundMentions: 0 };
  }

  // 24時間前をデフォルトのスキャン開始時刻とする
  const defaultOldest = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000).toString();
  const oldest = lastScanAt
    ? Math.floor(new Date(lastScanAt).getTime() / 1000).toString()
    : defaultOldest;

  // userToken がある場合は search.messages を使用（効率的）
  if (workspace.userToken) {
    return scanWithSearch(workspace, oldest, existingThreadTs);
  }

  // userToken がない場合は conversations.history で巡回
  return scanWithHistory(workspace, oldest, existingThreadTs);
}

/**
 * search.messages API を使った効率的なスキャン
 */
async function scanWithSearch(
  workspace: Workspace,
  oldest: string,
  existingThreadTs: Set<string>,
): Promise<ScanResult> {
  const client = getSlackClient(workspace.userToken!);
  const messages: SlackMessage[] = [];

  try {
    // 自分宛のメンションを検索
    const result = await client.search.messages({
      query: `<@${workspace.targetUserId}> after:${formatDateForSearch(oldest)}`,
      sort: 'timestamp',
      sort_dir: 'desc',
      count: 50,
    });

    const matches = result.messages?.matches || [];

    for (const match of matches) {
      const msg = match as {
        ts: string;
        text: string;
        user: string;
        channel: { id: string; name: string };
        thread_ts?: string;
        permalink?: string;
      };

      const threadTs = msg.thread_ts || msg.ts;

      // 既にタスク化済みのスレッドはスキップ
      if (existingThreadTs.has(threadTs)) continue;

      // プロフィール解決
      const profile = await resolveUserProfile(workspace.botToken, msg.user);
      const channelName = msg.channel?.name || await getChannelName(workspace.botToken, msg.channel.id);

      messages.push({
        id: `${msg.channel.id}-${msg.ts}`,
        workspaceId: workspace.id,
        channelId: msg.channel.id,
        channelName,
        threadTs,
        ts: msg.ts,
        userId: msg.user,
        userName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        text: msg.text || '',
        isDirectMention: true,
        isThreadParticipant: false,
      });

      // 同一スレッドの重複を避ける
      existingThreadTs.add(threadTs);
    }

    return {
      messages,
      scannedChannels: 0, // search API ではチャンネル数不明
      foundMentions: messages.length,
    };
  } catch (error) {
    console.error('[Scan] search.messages failed:', error);
    // フォールバック: history ベースのスキャン
    return scanWithHistory(workspace, oldest, existingThreadTs);
  }
}

/**
 * conversations.history を使ったスキャン（フォールバック）
 */
async function scanWithHistory(
  workspace: Workspace,
  oldest: string,
  existingThreadTs: Set<string>,
): Promise<ScanResult> {
  const client = getSlackClient(workspace.botToken);
  const messages: SlackMessage[] = [];
  const mentionPattern = `<@${workspace.targetUserId}>`;
  let scannedChannels = 0;

  try {
    // チャンネル一覧を取得
    let cursor: string | undefined;
    const channels: { id: string; name: string }[] = [];

    do {
      const result = await client.conversations.list({
        types: 'public_channel,private_channel',
        limit: 200,
        exclude_archived: true,
        ...(cursor ? { cursor } : {}),
      });

      for (const ch of result.channels || []) {
        const channel = ch as { id: string; name: string; is_member?: boolean };
        if (channel.is_member) {
          channels.push({ id: channel.id, name: channel.name });
        }
      }

      cursor = result.response_metadata?.next_cursor || undefined;
    } while (cursor);

    // 各チャンネルの履歴をスキャン（レート制限を考慮）
    for (const channel of channels) {
      scannedChannels++;

      try {
        const result = await client.conversations.history({
          channel: channel.id,
          oldest,
          limit: 100,
        });

        for (const msg of result.messages || []) {
          const rawMsg = msg as {
            ts: string;
            text?: string;
            user?: string;
            thread_ts?: string;
          };

          // メンションチェック
          if (!rawMsg.text?.includes(mentionPattern)) continue;

          const threadTs = rawMsg.thread_ts || rawMsg.ts;

          // 既にタスク化済みのスレッドはスキップ
          if (existingThreadTs.has(threadTs)) continue;

          const profile = rawMsg.user
            ? await resolveUserProfile(workspace.botToken, rawMsg.user)
            : { displayName: 'unknown', avatarUrl: '' };

          messages.push({
            id: `${channel.id}-${rawMsg.ts}`,
            workspaceId: workspace.id,
            channelId: channel.id,
            channelName: channel.name,
            threadTs,
            ts: rawMsg.ts,
            userId: rawMsg.user || '',
            userName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            text: rawMsg.text || '',
            isDirectMention: true,
            isThreadParticipant: false,
          });

          existingThreadTs.add(threadTs);
        }
      } catch {
        // チャンネルアクセスエラーはスキップ
        continue;
      }
    }
  } catch (error) {
    console.error('[Scan] conversations scan failed:', error);
  }

  return {
    messages,
    scannedChannels,
    foundMentions: messages.length,
  };
}

/**
 * Unix timestamp を search API 用の日付文字列に変換
 */
function formatDateForSearch(unixTs: string): string {
  const date = new Date(parseInt(unixTs) * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
