import { WebClient } from '@slack/web-api';
import type { SlackMessage, SlackFile } from '@/types';

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
      profile?: { image_48?: string; display_name?: string; real_name?: string };
    } | undefined;

    const profile: UserProfile = {
      userId,
      displayName: user?.profile?.display_name || user?.profile?.real_name || user?.real_name || user?.name || userId,
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

    // ファイル添付を解析
    const rawFiles = msg.files as Array<{
      id: string;
      name: string;
      mimetype: string;
      size: number;
      url_private: string;
      thumb_360?: string;
      thumb_480?: string;
      thumb_160?: string;
      permalink?: string;
    }> | undefined;

    const files: SlackFile[] | undefined = rawFiles?.map((f) => ({
      id: f.id,
      name: f.name || 'unknown',
      mimetype: f.mimetype || 'application/octet-stream',
      size: f.size || 0,
      urlPrivate: f.url_private || '',
      thumbUrl: f.thumb_360 || f.thumb_480 || f.thumb_160 || undefined,
      permalink: f.permalink || undefined,
    }));

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
      files: files && files.length > 0 ? files : undefined,
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

// --- Channel Members (for mention suggestions, including shared channels) ---

interface ChannelMember {
  id: string;
  name: string;
  realName: string;
  avatarUrl: string;
}

const channelMembersCache = new Map<string, { members: ChannelMember[]; cachedAt: number }>();
const CHANNEL_MEMBERS_TTL = 10 * 60 * 1000; // 10分

export async function fetchChannelMembers(
  botToken: string,
  channelId: string,
): Promise<ChannelMember[]> {
  // キャッシュチェック
  const cached = channelMembersCache.get(channelId);
  if (cached && Date.now() - cached.cachedAt < CHANNEL_MEMBERS_TTL) {
    return cached.members;
  }

  const client = getSlackClient(botToken);

  // 1. conversations.members でメンバーIDリストを取得
  const memberIds: string[] = [];
  let cursor: string | undefined;
  try {
    do {
      const result = await client.conversations.members({
        channel: channelId,
        limit: 200,
        ...(cursor ? { cursor } : {}),
      });
      if (result.members) {
        memberIds.push(...result.members);
      }
      cursor = result.response_metadata?.next_cursor || undefined;
    } while (cursor);
  } catch (e) {
    console.error('[fetchChannelMembers] conversations.members failed:', e);
    return [];
  }

  // 2. 各メンバーのプロフィールを並列解決（resolveUserProfile で統一）
  const filteredIds = memberIds.filter((id) => id !== 'USLACKBOT');

  const BATCH_SIZE = 20; // Slack API レートリミット考慮
  const members: ChannelMember[] = [];

  for (let i = 0; i < filteredIds.length; i += BATCH_SIZE) {
    const batch = filteredIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (userId) => {
        const profile = await resolveUserProfile(botToken, userId);
        // resolveUserProfile はキャッシュ+API呼び出しを統一的に処理
        return {
          id: userId,
          name: userId,
          realName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        } as ChannelMember;
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        members.push(r.value);
      }
    }
  }

  // キャッシュ保存
  channelMembersCache.set(channelId, { members, cachedAt: Date.now() });
  return members;
}

// --- Channel Messages (non-thread) ---

// --- Channel Info Cache (TTL: 10分) ---
const channelInfoCache = new Map<string, { name: string; cachedAt: number }>();
const CHANNEL_INFO_TTL = 10 * 60 * 1000; // 10分

async function resolveChannelName(
  client: WebClient,
  channelId: string,
  knownName?: string,
): Promise<string> {
  // フロントから名前が渡されていればそのまま使用
  if (knownName) return knownName;

  // キャッシュチェック
  const cached = channelInfoCache.get(channelId);
  if (cached && Date.now() - cached.cachedAt < CHANNEL_INFO_TTL) {
    return cached.name;
  }

  // API呼出し
  try {
    const chInfo = await client.conversations.info({ channel: channelId });
    const name = (chInfo.channel as { name?: string })?.name || channelId;
    channelInfoCache.set(channelId, { name, cachedAt: Date.now() });
    return name;
  } catch {
    return channelId;
  }
}

export async function fetchChannelMessages(
  botToken: string,
  channelId: string,
  workspaceId: string,
  cursor?: string,
  limit: number = 20,
  knownChannelName?: string,
): Promise<{ messages: SlackMessage[]; nextCursor?: string; channelName: string }> {
  const client = getSlackClient(botToken);

  const channelName = await resolveChannelName(client, channelId, knownChannelName);

  const result = await client.conversations.history({
    channel: channelId,
    limit,
    ...(cursor ? { cursor } : {}),
  });

  if (!result.messages) return { messages: [], channelName };

  // ユーザーIDを収集
  const userIds = new Set<string>();
  for (const msg of result.messages) {
    if (msg.user) userIds.add(msg.user);
    const reactions = msg.reactions as Array<{ users?: string[] }> | undefined;
    if (reactions) {
      for (const r of reactions) {
        for (const u of r.users || []) userIds.add(u);
      }
    }
    const mentions = (msg.text || '').matchAll(/<@([A-Z0-9]+)>/g);
    for (const m of mentions) userIds.add(m[1]);
  }

  // 一括でプロフィール解決
  const profiles = await resolveUserProfiles(botToken, [...userIds]);

  const messages: SlackMessage[] = result.messages.map((msg) => {
    const profile = profiles.get(msg.user || '');
    const rawReactions = msg.reactions as Array<{
      name: string;
      count: number;
      users: string[];
    }> | undefined;

    const rawFiles = msg.files as Array<{
      id: string;
      name: string;
      mimetype: string;
      size: number;
      url_private: string;
      thumb_360?: string;
      thumb_480?: string;
      thumb_160?: string;
      permalink?: string;
    }> | undefined;

    const files: SlackFile[] | undefined = rawFiles?.map((f) => ({
      id: f.id,
      name: f.name || 'unknown',
      mimetype: f.mimetype || 'application/octet-stream',
      size: f.size || 0,
      urlPrivate: f.url_private || '',
      thumbUrl: f.thumb_360 || f.thumb_480 || f.thumb_160 || undefined,
      permalink: f.permalink || undefined,
    }));

    return {
      id: `${channelId}-${msg.ts}`,
      workspaceId,
      channelId,
      channelName,
      threadTs: (msg as { thread_ts?: string }).thread_ts || undefined,
      ts: msg.ts || '',
      userId: msg.user || msg.bot_id || '',
      userName: profile?.displayName || msg.user || msg.bot_id || 'unknown',
      avatarUrl: profile?.avatarUrl || '',
      text: resolveMentionsInText(msg.text || '', profiles),
      isDirectMention: false,
      isThreadParticipant: false,
      replyCount: (msg as { reply_count?: number }).reply_count || 0,
      reactions: rawReactions?.map((r) => ({
        name: r.name,
        count: r.count,
        users: r.users,
      })) || [],
      files: files && files.length > 0 ? files : undefined,
    };
  });

  const nextCursor = result.response_metadata?.next_cursor || undefined;
  return { messages, nextCursor, channelName };
}

export async function listChannels(
  botToken: string,
): Promise<{ id: string; name: string; type?: 'channel' | 'dm' | 'group_dm' }[]> {
  const client = getSlackClient(botToken);
  const channels: { id: string; name: string; type?: 'channel' | 'dm' | 'group_dm' }[] = [];

  // private_channel には groups:read スコープが必要。
  // im には im:read, mpim には mpim:read が必要。
  // スコープ不足時は段階的にフォールバック。

  const fetchWithTypes = async (channelTypes: string) => {
    let cursor: string | undefined;
    do {
      const result = await client.conversations.list({
        types: channelTypes,
        limit: 200,
        exclude_archived: true,
        cursor,
      });

      for (const ch of result.channels || []) {
        const c = ch as {
          id?: string;
          name?: string;
          is_im?: boolean;
          is_mpim?: boolean;
          user?: string;
        };
        if (!c.id) continue;

        if (c.is_im) {
          // 1対1 DM: name がないので user ID を仮名にする（後で解決）
          channels.push({
            id: c.id,
            name: c.user || c.id,
            type: 'dm',
          });
        } else if (c.is_mpim) {
          // グループDM: name が "mpdm-user1--user2--user3-1" 形式
          channels.push({
            id: c.id,
            name: c.name || c.id,
            type: 'group_dm',
          });
        } else if (c.name) {
          channels.push({ id: c.id, name: c.name, type: 'channel' });
        }
      }

      cursor = result.response_metadata?.next_cursor || undefined;
    } while (cursor);
  };

  // まず全タイプを試行し、スコープ不足時は段階的にフォールバック
  const typeGroups = [
    'public_channel,private_channel,im,mpim',
    'public_channel,private_channel,im',
    'public_channel,private_channel',
    'public_channel,im',
    'public_channel',
  ];

  for (const types of typeGroups) {
    try {
      channels.length = 0;
      await fetchWithTypes(types);
      break;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('missing_scope') || msg.includes('not_allowed_token_type')) {
        console.log(`[listChannels] Scope missing for types="${types}", trying next fallback`);
        continue;
      }
      throw e;
    }
  }

  // DM の user ID をユーザー名に解決
  const dmChannels = channels.filter((ch) => ch.type === 'dm');
  if (dmChannels.length > 0) {
    const resolvePromises = dmChannels.map(async (ch) => {
      try {
        const profile = await resolveUserProfile(botToken, ch.name);
        ch.name = profile.displayName || ch.name;
      } catch {
        // user ID のまま
      }
    });
    await Promise.all(resolvePromises);
  }

  return channels;
}
