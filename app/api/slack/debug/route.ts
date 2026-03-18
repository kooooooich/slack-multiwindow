import { NextResponse } from 'next/server';
import { getAllWorkspaces } from '@/lib/db';
import { getSlackClient } from '@/lib/slack';

export const runtime = 'nodejs';

/**
 * Slack デバッグ API
 * GET: Bot Token のスコープ確認、DMチャンネル一覧取得テスト
 */
export async function GET() {
  try {
    const workspaces = getAllWorkspaces();
    if (workspaces.length === 0) {
      return NextResponse.json({ error: 'No workspaces configured' }, { status: 404 });
    }

    const ws = workspaces[0];
    const client = getSlackClient(ws.botToken);

    // 1. auth.test でBot情報とスコープを確認
    const authResult = await client.auth.test();

    // 2. Bot Token のスコープはレスポンスヘッダーに含まれる
    // auth.test の結果を使う
    const authInfo = {
      ok: authResult.ok,
      botUserId: authResult.user_id,
      botName: authResult.user,
      teamId: authResult.team_id,
      teamName: authResult.team,
    };

    // 3. conversations.list でDMチャンネルを取得してみる
    let dmChannels: { ok: boolean; channels?: unknown[]; error?: string } = { ok: false };
    try {
      const dmResult = await client.conversations.list({
        types: 'im,mpim',
        limit: 5,
      });
      dmChannels = {
        ok: true,
        channels: (dmResult.channels || []).map((ch) => ({
          id: (ch as Record<string, unknown>).id,
          name: (ch as Record<string, unknown>).name || '(DM)',
          is_im: (ch as Record<string, unknown>).is_im,
          is_mpim: (ch as Record<string, unknown>).is_mpim,
          user: (ch as Record<string, unknown>).user,
        })),
      };
    } catch (err) {
      dmChannels = {
        ok: false,
        error: String(err),
      };
    }

    // 4. Shared channels を取得してみる
    let sharedChannels: { ok: boolean; channels?: unknown[]; error?: string } = { ok: false };
    try {
      const sharedResult = await client.conversations.list({
        types: 'public_channel,private_channel',
        limit: 10,
      });
      sharedChannels = {
        ok: true,
        channels: (sharedResult.channels || []).filter((ch) =>
          (ch as Record<string, unknown>).is_shared ||
          (ch as Record<string, unknown>).is_ext_shared ||
          (ch as Record<string, unknown>).is_org_shared
        ).map((ch) => ({
          id: (ch as Record<string, unknown>).id,
          name: (ch as Record<string, unknown>).name,
          is_shared: (ch as Record<string, unknown>).is_shared,
          is_ext_shared: (ch as Record<string, unknown>).is_ext_shared,
          is_org_shared: (ch as Record<string, unknown>).is_org_shared,
        })),
      };
    } catch (err) {
      sharedChannels = {
        ok: false,
        error: String(err),
      };
    }

    // 5. api.test はヘッダーにスコープ情報を含む
    // WebClient経由ではヘッダーが取れないので、直接fetchする
    let botScopes = 'unknown';
    let userScopes = 'unknown';
    try {
      const resp = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ws.botToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      botScopes = resp.headers.get('x-oauth-scopes') || 'not returned';

      if (ws.userToken) {
        const userResp = await fetch('https://slack.com/api/auth.test', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${ws.userToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });
        userScopes = userResp.headers.get('x-oauth-scopes') || 'not returned';
      }
    } catch {
      // ignore
    }

    // DM イベント受信に必要なスコープをチェック
    const botScopeList = botScopes.split(',').map((s: string) => s.trim());
    const requiredForDM = {
      'im:history': botScopeList.includes('im:history'),
      'im:read': botScopeList.includes('im:read'),
      'im:write': botScopeList.includes('im:write'),
      'mpim:history': botScopeList.includes('mpim:history'),
      'mpim:read': botScopeList.includes('mpim:read'),
      'mpim:write': botScopeList.includes('mpim:write'),
      'groups:history': botScopeList.includes('groups:history'),
      'groups:read': botScopeList.includes('groups:read'),
      'channels:history': botScopeList.includes('channels:history'),
      'channels:read': botScopeList.includes('channels:read'),
    };

    const missingScopes = Object.entries(requiredForDM)
      .filter(([key, has]) => !has && ['im:history', 'mpim:history', 'groups:history'].includes(key))
      .map(([key]) => key);

    return NextResponse.json({
      workspace: { id: ws.id, name: ws.name, targetUserId: ws.targetUserId },
      auth: authInfo,
      botScopes,
      userScopes,
      scopeCheck: requiredForDM,
      missingCriticalScopes: missingScopes,
      dmChannelTest: dmChannels,
      sharedChannelTest: sharedChannels,
      diagnosis: missingScopes.length > 0
        ? `Missing scopes: ${missingScopes.join(', ')}. Add these in Slack App settings (OAuth & Permissions > Bot Token Scopes), then reinstall the app to the workspace.`
        : 'All critical scopes appear to be present. Check Event Subscriptions for message.im, message.mpim, message.groups.',
    }, { status: 200 });
  } catch (error) {
    console.error('[Debug] Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
