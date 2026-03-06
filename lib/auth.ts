import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { upsertUser, getUserByGoogleId } from './db';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30日間
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'google' && profile?.sub) {
        upsertUser({
          googleId: profile.sub,
          email: user.email || '',
          name: user.name || '',
          avatarUrl: user.image || '',
        });
      }
      return true;
    },
    async jwt({ token, account, profile }) {
      // 初回サインイン時に Google sub と DB userId をトークンに保存
      if (account?.provider === 'google' && profile?.sub) {
        token.googleId = profile.sub;
        const dbUser = getUserByGoogleId(profile.sub);
        if (dbUser) {
          token.userId = dbUser.id;
        }
      }
      return token;
    },
    async session({ session, token }) {
      // userId と googleId をクライアントセッションに公開
      if (token.userId) {
        (session as unknown as Record<string, unknown>).userId = token.userId as string;
      }
      if (token.googleId) {
        (session as unknown as Record<string, unknown>).googleId = token.googleId as string;
      }
      return session;
    },
  },
});

/** 環境変数から認証モードを判定 */
export function getAuthMode(): 'google' | 'password' | 'none' {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return 'google';
  }
  if (process.env.APP_PASSWORD) {
    return 'password';
  }
  return 'none';
}
