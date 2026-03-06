import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const APP_PASSWORD = process.env.APP_PASSWORD;

  // パスワード未設定の場合は全てスルー
  if (!APP_PASSWORD) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // 認証不要のパス
  const publicPaths = [
    '/api/auth',
    '/api/health',
    '/api/slack/events', // Slackイベント受信は認証不要
  ];

  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 静的ファイル（_next）は認証不要
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon.ico')) {
    return NextResponse.next();
  }

  // Cookie認証チェック
  const token = request.cookies.get('auth_token')?.value;
  const crypto = require('crypto');
  const expectedToken = crypto
    .createHash('sha256')
    .update(`slack-multiwindow:${APP_PASSWORD}`)
    .digest('hex');

  if (token !== expectedToken) {
    // APIリクエストの場合は401を返す
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ページリクエストの場合はそのまま通す（クライアント側でログイン画面を表示）
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // 静的ファイルを除外
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
