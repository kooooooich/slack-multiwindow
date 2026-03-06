import { NextResponse } from 'next/server';
import { addSSEListener, removeSSEListener } from '@/lib/bolt-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // SSE初期接続メッセージ
      controller.enqueue(encoder.encode('data: {"type":"connected"}\n\n'));

      // イベントリスナー登録
      const listener = (event: { type: string; data: unknown }) => {
        try {
          const sseData = JSON.stringify({ type: event.type, data: event.data });
          controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
        } catch {
          // ignore encoding errors
        }
      };

      addSSEListener(listener);

      // キープアライブ（30秒ごと）
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          clearInterval(keepAlive);
        }
      }, 30000);

      // クリーンアップ（クライアント切断時）
      const cleanup = () => {
        removeSSEListener(listener);
        clearInterval(keepAlive);
      };

      // AbortSignal がないのでリスナー内でエラーをキャッチして対応
      const originalEnqueue = controller.enqueue.bind(controller);
      controller.enqueue = (chunk) => {
        try {
          originalEnqueue(chunk);
        } catch {
          cleanup();
        }
      };
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
