'use client';

import { useState, useEffect } from 'react';
import WorkspaceSetup from '@/components/WorkspaceSetup';

export default function Home() {
  const [mode, setMode] = useState<'loading' | 'setup' | 'app'>('loading');

  useEffect(() => {
    fetch('/api/workspaces')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setMode('app');
        } else {
          setMode('setup');
        }
      })
      .catch(() => setMode('setup'));
  }, []);

  if (mode === 'loading') {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center">
        <div className="text-gray-400 font-mono">Loading...</div>
      </div>
    );
  }

  if (mode === 'setup') {
    return <WorkspaceSetup onComplete={() => setMode('app')} />;
  }

  // メインアプリ（Step 6で実装）
  return (
    <div className="min-h-screen bg-[#0F1117] flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white font-mono mb-4">
          Slack Multi-Window
        </h1>
        <p className="text-gray-400 font-mono text-sm mb-4">
          メインUI（Step 6で実装予定）
        </p>
        <button
          onClick={() => setMode('setup')}
          className="px-4 py-2 bg-white/10 text-gray-300 rounded font-mono text-sm hover:bg-white/20 transition"
        >
          ワークスペース設定に戻る
        </button>
      </div>
    </div>
  );
}
