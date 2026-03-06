import { NextRequest, NextResponse } from 'next/server';
import { auth, getAuthMode } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const mode = getAuthMode();

  if (mode === 'none') {
    return NextResponse.json({ authMode: 'none', authenticated: true });
  }

  if (mode === 'google') {
    const session = await auth();
    return NextResponse.json({
      authMode: 'google',
      authenticated: !!session,
      user: session?.user
        ? {
            name: session.user.name,
            email: session.user.email,
            image: session.user.image,
          }
        : null,
      userId: (session as unknown as Record<string, unknown>)?.userId || null,
    });
  }

  // パスワードモード
  const APP_PASSWORD = process.env.APP_PASSWORD;
  if (!APP_PASSWORD) {
    return NextResponse.json({ authMode: 'none', authenticated: true });
  }

  const token = request.cookies.get('auth_token')?.value;
  const crypto = require('crypto');
  const expectedToken = crypto
    .createHash('sha256')
    .update(`slack-multiwindow:${APP_PASSWORD}`)
    .digest('hex');

  return NextResponse.json({
    authMode: 'password',
    authenticated: token === expectedToken,
    passwordRequired: true,
  });
}
