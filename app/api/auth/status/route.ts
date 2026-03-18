import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function GET() {
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
