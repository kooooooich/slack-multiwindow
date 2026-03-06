'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';

interface LoginScreenProps {
  onLogin: () => void;
  authMode?: 'google' | 'password';
}

export default function LoginScreen({ onLogin, authMode = 'password' }: LoginScreenProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Google OAuth ログイン
  const handleGoogleLogin = () => {
    setLoading(true);
    signIn('google', { callbackUrl: '/' });
  };

  // パスワードログイン
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        onLogin();
      } else {
        setError('パスワードが正しくありません');
      }
    } catch {
      setError('接続エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F1117] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-xl font-bold text-white tracking-wide mb-2">
            Slack Multi-Window
          </h1>
          <p className="text-xs text-gray-500">
            {authMode === 'google'
              ? 'Googleアカウントでログイン'
              : 'チームパスワードを入力してログイン'}
          </p>
        </div>

        {authMode === 'google' ? (
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-3 rounded-lg text-sm font-medium transition bg-white text-gray-800 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            {loading ? 'リダイレクト中...' : 'Googleでログイン'}
          </button>
        ) : (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="パスワード"
                autoFocus
                className="w-full bg-[#1A1D27] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#4A9EFF] transition"
              />
            </div>

            {error && (
              <div className="text-xs text-[#E74C3C] text-center animate-fade-in">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!password || loading}
              className="w-full py-3 rounded-lg text-sm font-medium transition bg-[#4A9EFF] text-white hover:bg-[#4A9EFF]/80 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
