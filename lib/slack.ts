import { WebClient } from '@slack/web-api';
import type { SlackMessage } from '@/types';

const clientCache = new Map<string, WebClient>();

export function getSlackClient(botToken: string): WebClient {
  if (!clientCache.has(botToken)) {
    clientCache.set(botToken, new WebClient(botToken));
  }
  return clientCache.get(botToken)!;
}

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

  return result.messages.map((msg) => ({
    id: `${channelId}-${msg.ts}`,
    workspaceId,
    channelId,
    channelName,
    threadTs: threadTs,
    ts: msg.ts || '',
    userId: msg.user || msg.bot_id || '',
    userName: msg.user || msg.bot_id || 'unknown',
    text: msg.text || '',
    isDirectMention: false,
    isThreadParticipant: true,
  }));
}

export async function resolveUserName(
  botToken: string,
  userId: string,
): Promise<string> {
  try {
    const client = getSlackClient(botToken);
    const result = await client.users.info({ user: userId });
    const user = result.user as { real_name?: string; name?: string } | undefined;
    return user?.real_name || user?.name || userId;
  } catch {
    return userId;
  }
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
): Promise<void> {
  const client = getSlackClient(botToken);
  await client.chat.postMessage({
    channel: channelId,
    text,
    ...(threadTs ? { thread_ts: threadTs } : {}),
  });
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
