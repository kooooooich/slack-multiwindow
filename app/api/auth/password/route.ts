import { NextRequest, NextResponse } from 'next/server';

const APP_PASSWORD = process.env.APP_PASSWORD;

// POST /api/auth — ログイン
export async function POST(request: NextRequest) {
  if (!APP_PASSWORD) {
    // パスワード未設定の場合は認証不要（ローカル開発用）
    return NextResponse.json({ ok: true });
  }

  try {
    const { password } = await request.json();

    if (password !== APP_PASSWORD) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });

    // httpOnly cookie をセット（7日間有効）
    response.cookies.set('auth_token', generateToken(APP_PASSWORD), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

// GET /api/auth — 認証状態チェック
export async function GET(request: NextRequest) {
  if (!APP_PASSWORD) {
    // パスワード未設定 → 常に認証済み
    return NextResponse.json({ authenticated: true, passwordRequired: false });
  }

  const token = request.cookies.get('auth_token')?.value;
  const isValid = token === generateToken(APP_PASSWORD);

  return NextResponse.json({
    authenticated: isValid,
    passwordRequired: true,
  });
}

// DELETE /api/auth — ログアウト
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete('auth_token');
  return response;
}

// 簡易トークン生成（パスワードのハッシュ）
function generateToken(password: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(`slack-multiwindow:${password}`).digest('hex');
}
