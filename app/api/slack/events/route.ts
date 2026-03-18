import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAllWorkspaces } from '@/lib/db';
import { isBoltRunning } from '@/lib/bolt-server';
import { processSlackEvent } from '@/lib/event-handler';
import type { SlackEventPayload } from '@/lib/event-handler';

// Slack Events API Webhook 受信（本番 Events API モード用）
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);

    // URL Verification challenge
    if (body.type === 'url_verification') {
      return NextResponse.json({ challenge: body.challenge });
    }

    // Signing Secret 検証
    const signingSecret = process.env.SLACK_SIGNING_SECRET || '';
    const timestamp = req.headers.get('x-slack-request-timestamp') || '';
    const slackSignature = req.headers.get('x-slack-signature') || '';

    if (signingSecret) {
      const sigBasestring = `v0:${timestamp}:${rawBody}`;
      const mySignature = 'v0=' + crypto
        .createHmac('sha256', signingSecret)
        .update(sigBasestring)
        .digest('hex');

      if (!crypto.timingSafeEqual(
        Buffer.from(mySignature),
        Buffer.from(slackSignature),
      )) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    // イベント処理
    if (body.type === 'event_callback') {
      const event = body.event;
      const teamId = body.team_id;
      const workspaces = getAllWorkspaces();
      const ws = workspaces.find((w) => w.teamId === teamId) || workspaces[0];

      if (!ws) {
        console.log('[Events API] No workspace found for team:', teamId);
        return NextResponse.json({ ok: true });
      }

      // Bolt（Socket Mode）が稼働中の場合はイベント処理をスキップ（重複防止）
      if (isBoltRunning()) {
        console.log('[Events API] Bolt is running (Socket Mode), skipping event to avoid duplicate processing');
      } else {
        // 非同期で処理（Slackの3秒タイムアウトを避ける）
        const targetUserId = ws.targetUserId || process.env.SLACK_TARGET_USER_ID || '';

        const payload: SlackEventPayload = {
          type: event.type,
          channel: event.channel,
          channelType: event.channel_type,
          threadTs: event.thread_ts,
          ts: event.ts,
          user: event.user,
          text: event.text,
          subtype: event.subtype,
          // message_changed
          message: event.message,
          previousMessage: event.previous_message,
          // message_deleted
          deletedTs: event.deleted_ts,
        };

        processSlackEvent(payload, {
          botToken: ws.botToken,
          workspaceId: ws.id,
          targetUserId,
        }).catch(console.error);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Events API] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
