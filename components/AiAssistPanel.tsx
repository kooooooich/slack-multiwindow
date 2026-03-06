'use client';

import { useState } from 'react';
import type { Task } from '@/types';

interface AiAssistPanelProps {
  task: Task;
  onUseSuggestion: (text: string) => void;
}

export default function AiAssistPanel({ task, onUseSuggestion }: AiAssistPanelProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generate = async () => {
    setLoading(true);
    setError('');
    setSuggestions([]);

    try {
      const messages =
        task.threadMessages.length > 0
          ? task.threadMessages
          : [task.triggerMessage];

      const res = await fetch('/api/ai/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          triggerMessage: task.triggerMessage,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'AI生成に失敗しました');
        return;
      }

      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch {
      setError('AI生成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // 初回自動生成
  if (suggestions.length === 0 && !loading && !error) {
    generate();
  }

  return (
    <div className="border-t border-white/5 p-3 bg-[#161929] shrink-0 max-h-48 overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-purple-400 uppercase tracking-wider">
          AI 返信案
        </span>
        <button
          onClick={generate}
          disabled={loading}
          className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition disabled:opacity-50"
        >
          {loading ? '生成中...' : '再生成'}
        </button>
      </div>

      {error && (
        <div className="text-[10px] text-[#E74C3C] mb-2">{error}</div>
      )}

      {loading && (
        <div className="text-[10px] text-gray-500 py-2 text-center">
          返信案を生成中...
        </div>
      )}

      <div className="space-y-1.5">
        {suggestions.map((suggestion, i) => (
          <div
            key={i}
            className="flex items-start gap-2 p-2 rounded bg-white/5 hover:bg-white/10 transition group"
          >
            <div className="flex-1 text-xs text-gray-300 whitespace-pre-wrap">
              {suggestion}
            </div>
            <button
              onClick={() => onUseSuggestion(suggestion)}
              className="text-[10px] px-2 py-0.5 rounded bg-[#4A9EFF]/20 text-[#4A9EFF] hover:bg-[#4A9EFF]/30 transition shrink-0 opacity-0 group-hover:opacity-100"
            >
              使用
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
