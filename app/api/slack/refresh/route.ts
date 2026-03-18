import { NextResponse } from 'next/server';
import {
  refreshAllTasksNow,
  isThreadPollerRunning,
  startThreadPoller,
  getLastPollTimestamp,
} from '@/lib/thread-poller';
import { isBoltRunning } from '@/lib/bolt-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/slack/refresh
 *
 * 即座に全追跡タスクのスレッドを軽量チェックし、変更を反映する。
 * ブラウザリロード時やタブ復帰時に呼ばれる想定。
 */
export async function POST() {
  try {
    // ポーラーが未起動なら起動
    if (!isThreadPollerRunning()) {
      startThreadPoller();
    }

    // 即時ポーリング実行
    const result = await refreshAllTasksNow();

    return NextResponse.json({
      refreshed: true,
      checked: result.checked,
      updated: result.updated,
      boltRunning: isBoltRunning(),
      pollerRunning: isThreadPollerRunning(),
    });
  } catch (error) {
    console.error('[Refresh] Error:', error);
    return NextResponse.json(
      { error: 'Refresh failed', refreshed: false },
      { status: 500 },
    );
  }
}

/**
 * GET /api/slack/refresh
 *
 * ポーリングシステムのステータス確認用
 */
export async function GET() {
  return NextResponse.json({
    boltRunning: isBoltRunning(),
    pollerRunning: isThreadPollerRunning(),
    lastPollAt: getLastPollTimestamp(),
  });
}
