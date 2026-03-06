'use client';

import { useState } from 'react';

interface LoginScreenProps {
  onLogin: () => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth', {
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
            チームパスワードを入力してログイン
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
      </div>
    </div>
  );
}
