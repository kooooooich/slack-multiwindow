import { WebClient } from '@slack/web-api';
import type { SlackMessage } from '@/types';

const clientCache = new Map<string, WebClient>();

export function getSlackClient(botToken: string): WebClient {
  if (!clientCache.has(botToken)) {
    clientCache.set(botToken, new WebClient(botToken));
  }
  return clientCache.get(botToken)!;
}

// --- User Profile Cache ---

export interface UserProfile {
  userId: string;
  displayName: string;
  avatarUrl: string;
}

const userProfileCache = new Map<string, UserProfile>();

export async function resolveUserProfile(
  botToken: string,
  userId: string,
): Promise<UserProfile> {
  const cached = userProfileCache.get(userId);
  if (cached) return cached;

  try {
    const client = getSlackClient(botToken);
    const result = await client.users.info({ user: userId });
    const user = result.user as {
      real_name?: string;
      name?: string;
      profile?: { image_48?: string };
    } | undefined;

    const profile: UserProfile = {
      userId,
      displayName: user?.real_name || user?.name || userId,
      avatarUrl: user?.profile?.image_48 || '',
    };

    userProfileCache.set(userId, profile);
    return profile;
  } catch {
    return { userId, displayName: userId, avatarUrl: '' };
  }
}

async function resolveUserProfiles(
  botToken: string,
  userIds: string[],
): Promise<Map<string, UserProfile>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const results = new Map<string, UserProfile>();

  await Promise.all(
    unique.map(async (uid) => {
      const profile = await resolveUserProfile(botToken, uid);
      results.set(uid, profile);
    }),
  );

  return results;
}

// メンションテキスト内のユーザーIDを実名に置換
function resolveMentionsInText(
  text: string,
  profiles: Map<string, UserProfile>,
): string {
  return text.replace(/<@([A-Z0-9]+)>/g, (_, userId) => {
    const profile = profiles.get(userId);
    return `<@${userId}|${profile?.displayName || userId}>`;
  });
}

// --- Thread Messages ---

export async function fetchThreadMessages(
  botToken: string,
  channelId: string,
  threadTs: string,
  workspaceId: string,
): Promise<SlackMessage[]> {
  const client = getSlackClient(botToken);

  const result = await client.conversations.replies({
    channel: channelId,
    ts: threadTs,
    inclusive: true,
  });

  if (!result.messages) return [];

  // チャネル名を取得
  let channelName = channelId;
  try {
    const chInfo = await client.conversations.info({ channel: channelId });
    channelName = (chInfo.channel as { name?: string })?.name || channelId;
  } catch {
    // チャネル情報取得失敗時はIDをそのまま使う
  }

  // メッセージ・リアクション・メンションから全ユーザーIDを収集
  const userIds = new Set<string>();
  for (const msg of result.messages) {
    if (msg.user) userIds.add(msg.user);
    // リアクションのユーザー
    const reactions = msg.reactions as Array<{ users?: string[] }> | undefined;
    if (reactions) {
      for (const r of reactions) {
        for (const u of r.users || []) userIds.add(u);
      }
    }
    // テキスト内のメンション
    const mentions = (msg.text || '').matchAll(/<@([A-Z0-9]+)>/g);
    for (const m of mentions) userIds.add(m[1]);
  }

  // 一括でユーザープロフィールを解決
  const profiles = await resolveUserProfiles(botToken, [...userIds]);

  return result.messages.map((msg) => {
    const profile = profiles.get(msg.user || '');
    const rawReactions = msg.reactions as Array<{
      name: string;
      count: number;
      users: string[];
    }> | undefined;

    return {
      id: `${channelId}-${msg.ts}`,
      workspaceId,
      channelId,
      channelName,
      threadTs: threadTs,
      ts: msg.ts || '',
      userId: msg.user || msg.bot_id || '',
      userName: profile?.displayName || msg.user || msg.bot_id || 'unknown',
      avatarUrl: profile?.avatarUrl || '',
      text: resolveMentionsInText(msg.text || '', profiles),
      isDirectMention: false,
      isThreadParticipant: true,
      reactions: rawReactions?.map((r) => ({
        name: r.name,
        count: r.count,
        users: r.users,
      })) || [],
    };
  });
}

// --- 後方互換のための既存関数 ---

export async function resolveUserName(
  botToken: string,
  userId: string,
): Promise<string> {
  const profile = await resolveUserProfile(botToken, userId);
  return profile.displayName;
}

export async function getChannelName(
  botToken: string,
  channelId: string,
): Promise<string> {
  try {
    const client = getSlackClient(botToken);
    const result = await client.conversations.info({ channel: channelId });
    return (result.channel as { name?: string })?.name || channelId;
  } catch {
    return channelId;
  }
}

export async function postMessage(
  botToken: string,
  channelId: string,
  text: string,
  threadTs?: string,
  userToken?: string,
): Promise<void> {
  // userTokenがあればユーザー自身として投稿、なければBotとして投稿
  const client = getSlackClient(userToken || botToken);
  await client.chat.postMessage({
    channel: channelId,
    text,
    ...(threadTs ? { thread_ts: threadTs } : {}),
  });
}

// --- 全チャンネル自動参加 ---

export async function joinAllChannels(
  botToken: string,
): Promise<{ joined: string[]; alreadyIn: string[]; failed: string[] }> {
  const client = getSlackClient(botToken);
  const joined: string[] = [];
  const alreadyIn: string[] = [];
  const failed: string[] = [];

  // パブリックチャンネル一覧を取得（ページネーション対応）
  let cursor: string | undefined;
  const allChannels: { id: string; name: string; is_member: boolean }[] = [];

  do {
    const result = await client.conversations.list({
      types: 'public_channel',
      limit: 200,
      exclude_archived: true,
      ...(cursor ? { cursor } : {}),
    });

    for (const ch of result.channels || []) {
      const channel = ch as { id: string; name: string; is_member?: boolean };
      allChannels.push({
        id: channel.id,
        name: channel.name,
        is_member: channel.is_member || false,
      });
    }

    cursor = result.response_metadata?.next_cursor || undefined;
  } while (cursor);

  // 未参加のチャンネルに参加
  for (const ch of allChannels) {
    if (ch.is_member) {
      alreadyIn.push(ch.name);
      continue;
    }
    try {
      await client.conversations.join({ channel: ch.id });
      joined.push(ch.name);
    } catch {
      failed.push(ch.name);
    }
  }

  console.log(`[Slack] Auto-join: ${joined.length} joined, ${alreadyIn.length} already in, ${failed.length} failed`);
  return { joined, alreadyIn, failed };
}

export async function listChannels(
  botToken: string,
): Promise<{ id: string; name: string }[]> {
  const client = getSlackClient(botToken);
  const result = await client.conversations.list({
    types: 'public_channel,private_channel',
    limit: 200,
    exclude_archived: true,
  });

  return (result.channels || []).map((ch) => ({
    id: (ch as { id: string }).id,
    name: (ch as { name: string }).name,
  }));
}
