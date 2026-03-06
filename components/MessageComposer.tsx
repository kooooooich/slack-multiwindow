'use client';

import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import type { Task } from '@/types';

interface MessageComposerProps {
  task: Task;
  onAiAssist: () => void;
  replyText: string;
  setReplyText: (text: string) => void;
}

export default function MessageComposer({
  task,
  onAiAssist,
  replyText,
  setReplyText,
}: MessageComposerProps) {
  const [sending, setSending] = useState(false);
  const completeTask = useAppStore((s) => s.completeTask);
  const updateTask = useAppStore((s) => s.updateTask);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // テキストエリアの高さを自動調整
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 100) + 'px';
    }
  }, [replyText]);

  const handleSend = async () => {
    if (!replyText.trim() || sending) return;
    setSending(true);

    try {
      const res = await fetch('/api/slack/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: task.workspaceId,
          channelId: task.channelId,
          text: replyText.trim(),
          threadTs: task.threadTs,
        }),
      });

      if (res.ok) {
        setReplyText('');
        // スレッドメッセージを再取得
        await refreshThread();
      }
    } catch (error) {
      console.error('Failed to send:', error);
    } finally {
      setSending(false);
    }
  };

  const handleComplete = async () => {
    // サーバー側も更新
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: task.id,
        status: 'completed',
        completedAt: new Date().toISOString(),
      }),
    });
    completeTask(task.id);
  };

  const refreshThread = async () => {
    try {
      const res = await fetch('/api/tasks');
      if (res.ok) {
        const tasks = await res.json();
        const updated = tasks.find((t: Task) => t.id === task.id);
        if (updated) {
          updateTask(task.id, {
            threadMessages: updated.threadMessages,
          });
        }
      }
    } catch {
      // ignore
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-white/5 p-2 shrink-0">
      <textarea
        ref={textareaRef}
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="返信を入力... (Cmd+Enter で送信)"
        rows={1}
        className="w-full bg-[#0F1117] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white placeholder-gray-600 resize-none focus:outline-none focus:border-[#4A9EFF] transition"
      />
      <div className="flex items-center gap-1.5 mt-1.5">
        <button
          onClick={onAiAssist}
          className="px-2 py-1 text-[10px] rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition"
        >
          AI補助
        </button>
        <button
          onClick={handleSend}
          disabled={!replyText.trim() || sending}
          className="px-2 py-1 text-[10px] rounded bg-[#4A9EFF]/20 text-[#4A9EFF] hover:bg-[#4A9EFF]/30 transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {sending ? '送信中...' : '返信'}
        </button>
        <button
          onClick={handleComplete}
          className="px-2 py-1 text-[10px] rounded bg-[#2ECC71]/20 text-[#2ECC71] hover:bg-[#2ECC71]/30 transition ml-auto"
        >
          &#10003; 完了
        </button>
      </div>
    </div>
  );
}
