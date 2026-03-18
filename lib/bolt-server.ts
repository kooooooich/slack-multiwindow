import { App, LogLevel } from '@slack/bolt';
import { getAllWorkspaces } from './db';
import { processSlackEvent } from './event-handler';
import type { SlackEventPayload } from './event-handler';
import { startThreadPoller } from './thread-poller';

// SSE用のイベントバス
type EventListener = (event: { type: string; data: unknown }) => void;
const listeners: Set<EventListener> = new Set();

let sseSequence = 0;

export function addSSEListener(listener: EventListener) {
  listeners.add(listener);
}

export function removeSSEListener(listener: EventListener) {
  listeners.delete(listener);
}

export function notifyListeners(type: string, data: unknown) {
  sseSequence++;
  for (const listener of listeners) {
    listener({ type, data, seq: sseSequence } as { type: string; data: unknown });
  }
}

export function getSSESequence(): number {
  return sseSequence;
}

let boltApp: App | null = null;
let lastEventReceivedAt = 0;

// Bolt が実際に起動したかどうか（外部から参照可能）
export function isBoltRunning(): boolean {
  return boltApp !== null;
}

/** Socket Mode 接続の健全性情報 */
export function getSocketModeHealth(): {
  running: boolean;
  lastEventAt: number;
  timeSinceLastEvent: number;
} {
  return {
    running: boltApp !== null,
    lastEventAt: lastEventReceivedAt,
    timeSinceLastEvent: lastEventReceivedAt > 0
      ? Date.now() - lastEventReceivedAt
      : -1,
  };
}

export async function startSlackBolt(): Promise<boolean> {
  // 既に起動済みの場合はスキップ
  if (boltApp) {
    console.log('[Bolt] Already running. Skipping.');
    return true;
  }

  const workspaces = getAllWorkspaces();

  if (workspaces.length === 0) {
    console.log('[Bolt] No workspaces configured. Skipping Slack Bolt startup.');
    return false;
  }

  // 最初のワークスペースの設定を使用（マルチワークスペースは将来対応）
  const ws = workspaces[0];
  const useSocketMode = !!ws.appToken || !!process.env.SLACK_APP_TOKEN;

  const appToken = ws.appToken || process.env.SLACK_APP_TOKEN;
  const botToken = ws.botToken || process.env.SLACK_BOT_TOKEN;
  const signingSecret = ws.signingSecret || process.env.SLACK_SIGNING_SECRET;
  const targetUserId = ws.targetUserId || process.env.SLACK_TARGET_USER_ID;

  if (!botToken || !signingSecret) {
    console.log('[Bolt] Missing bot token or signing secret. Skipping.');
    return false;
  }

  if (!targetUserId) {
    console.log('[Bolt] No target user ID configured. Mention detection disabled.');
  } else {
    console.log(`[Bolt] Monitoring mentions for user: ${targetUserId}`);
  }

  const appConfig: ConstructorParameters<typeof App>[0] = {
    token: botToken,
    signingSecret,
    logLevel: LogLevel.INFO,
  };

  if (useSocketMode && appToken) {
    appConfig.socketMode = true;
    appConfig.appToken = appToken;
    console.log('[Bolt] Starting in Socket Mode...');
  } else {
    console.log('[Bolt] Starting in Events API mode...');
    console.log('[Bolt] Events will be received via /api/slack/events');
  }

  boltApp = new App(appConfig);

  // --- グローバルミドルウェア: 全イベントログ + 健全性追跡 ---
  boltApp.use(async ({ body, next }) => {
    const b = body as Record<string, unknown>;
    const event = b.event as Record<string, unknown> | undefined;
    if (event) {
      lastEventReceivedAt = Date.now();
      console.log(`[Bolt:ALL] Event received: type=${event.type}, subtype=${event.subtype || 'none'}, channel=${event.channel}, channel_type=${event.channel_type || 'unknown'}, user=${event.user}, ts=${event.ts}`);
    }
    await next();
  });

  // --- Event Handler: 統合イベントハンドラに委譲 ---
  boltApp.event('message', async ({ event, context }) => {
    try {
      const msg = event as unknown as Record<string, unknown>;
      const payload: SlackEventPayload = {
        type: 'message',
        channel: (msg.channel as string) || '',
        channelType: (msg.channel_type as string) || '',
        threadTs: (msg.thread_ts as string) || undefined,
        ts: (msg.ts as string) || '',
        user: (msg.user as string) || undefined,
        text: (msg.text as string) || undefined,
        subtype: (msg.subtype as string) || undefined,
        // message_changed
        message: msg.message as SlackEventPayload['message'],
        previousMessage: msg.previous_message as SlackEventPayload['previousMessage'],
        // message_deleted
        deletedTs: (msg.deleted_ts as string) || undefined,
      };

      await processSlackEvent(payload, {
        botToken: context.botToken || botToken,
        workspaceId: ws.id,
        targetUserId: targetUserId || '',
      });
    } catch (error) {
      console.error('[Bolt] Error handling message event:', error);
    }
  });

  // app_mention: targetUserId 未設定時のフォールバック
  boltApp.event('app_mention', async ({ event, context }) => {
    if (targetUserId) return;
    try {
      const msg = event as unknown as Record<string, unknown>;
      await processSlackEvent(
        {
          type: 'app_mention',
          channel: (msg.channel as string) || '',
          ts: (msg.ts as string) || '',
          user: (msg.user as string) || undefined,
          text: (msg.text as string) || undefined,
          threadTs: (msg.thread_ts as string) || undefined,
        },
        {
          botToken: context.botToken || botToken,
          workspaceId: ws.id,
          targetUserId: '',
        },
      );
    } catch (error) {
      console.error('[Bolt] Error handling app_mention event:', error);
    }
  });

  // Socket Mode の障害時フォールバックとしてスレッドポーラーを起動
  // boltApp.start() より先に起動することで、Socket Mode接続失敗時もポーラーが動作する
  startThreadPoller();

  if (useSocketMode) {
    await boltApp.start();
    console.log('[Bolt] Socket Mode app started successfully');
  }

  return true;
}

export function getBoltApp(): App | null {
  return boltApp;
}
