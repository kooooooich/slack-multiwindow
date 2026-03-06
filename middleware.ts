import { NextRequest, NextResponse } from 'next/server';

// 認証モード判定（環境変数ベース）
const authMode = (() => {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) return 'google';
  if (process.env.APP_PASSWORD) return 'password';
  return 'none';
})();

export function middleware(request: NextRequest) {
  // 認証未設定 → 全てスルー
  if (authMode === 'none') {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // 認証不要のパス
  const publicPaths = [
    '/api/auth',         // next-auth ルート + パスワード認証 + ステータス
    '/api/health',
    '/api/slack/events', // Slackイベント受信は認証不要
  ];

  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 静的ファイルは認証不要
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon.ico')) {
    return NextResponse.next();
  }

  // Google OAuth モード
  if (authMode === 'google') {
    // セッション Cookie の存在チェック（Edge Runtime なので DB アクセスは避ける）
    const sessionToken =
      request.cookies.get('authjs.session-token')?.value ||
      request.cookies.get('__Secure-authjs.session-token')?.value;

    if (!sessionToken) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      // ページリクエストはそのまま通す（クライアント側でログイン画面を表示）
      return NextResponse.next();
    }
    return NextResponse.next();
  }

  // パスワードモード（既存ロジック）
  if (authMode === 'password') {
    const token = request.cookies.get('auth_token')?.value;
    const crypto = require('crypto');
    const expectedToken = crypto
      .createHash('sha256')
      .update(`slack-multiwindow:${process.env.APP_PASSWORD}`)
      .digest('hex');

    if (token !== expectedToken) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.next();
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
