import { NextRequest, NextResponse } from 'next/server';
import { addSSEListener, removeSSEListener, startSlackBolt, isBoltRunning, getSSESequence } from '@/lib/bolt-server';
import { startThreadPoller, isThreadPollerRunning } from '@/lib/thread-poller';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Bolt自動起動（dev mode対応: server.jsを経由しない場合）
async function ensureBoltStarted() {
  if (isBoltRunning()) return;

  try {
    const started = await startSlackBolt();
    if (started) {
      console.log('[Stream] Slack Bolt auto-started from SSE endpoint');
    } else {
      console.log('[Stream] Slack Bolt not started (no workspaces or missing config)');
    }
  } catch (err) {
    console.log('[Stream] Slack Bolt auto-start failed:', err);
  }
}

export async function GET(req: NextRequest) {
  console.log('[Stream] SSE GET request received');

  try {
    await ensureBoltStarted();
  } catch (err) {
    console.error('[Stream] ensureBoltStarted error:', err);
  }

  // Socket Mode 障害時フォールバック: スレッドポーラー起動
  if (!isThreadPollerRunning()) {
    startThreadPoller();
  }

  const encoder = new TextEncoder();
  // AbortSignal によるクリーンアップ
  const abortSignal = req.signal;
  let listener: ((event: { type: string; data: unknown }) => void) | null = null;
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // SSE初期接続メッセージ（現在のシーケンス番号を含む）
      const initialSeq = getSSESequence();
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', seq: initialSeq })}\n\n`));

      // イベントリスナー登録
      listener = (event: { type: string; data: unknown }) => {
        try {
          const sseData = JSON.stringify(event);
          controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
        } catch {
          // クライアント切断時のエンコードエラーは無視
        }
      };

      addSSEListener(listener);

      // キープアライブ（15秒ごと）
      keepAliveTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          // 切断時は無視
        }
      }, 15000);

      // AbortSignal によるクリーンアップ
      const cleanup = () => {
        if (listener) {
          removeSSEListener(listener);
          listener = null;
        }
        if (keepAliveTimer) {
          clearInterval(keepAliveTimer);
          keepAliveTimer = null;
        }
      };

      if (abortSignal) {
        abortSignal.addEventListener('abort', cleanup, { once: true });
      }
    },
    cancel() {
      // ReadableStream がキャンセルされた場合のクリーンアップ
      if (listener) {
        removeSSEListener(listener);
        listener = null;
      }
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
