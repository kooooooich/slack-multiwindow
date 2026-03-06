'use client';

import { useAppStore } from '@/lib/store';
import ChatWindow from './ChatWindow';

export default function WindowManager() {
  const tasks = useAppStore((s) => s.tasks);
  const openWindowIds = useAppStore((s) => s.openWindowIds);
  const focusedWindowId = useAppStore((s) => s.focusedWindowId);

  const openTasks = tasks.filter((t) => openWindowIds.includes(t.id));

  // z-indexを計算: フォーカスされたウィンドウが最前面
  const getZIndex = (taskId: string) => {
    if (focusedWindowId === taskId) return 50;
    const idx = openWindowIds.indexOf(taskId);
    return 10 + idx;
  };

  return (
    <div className="flex-1 relative overflow-hidden bg-[#0F1117]">
      {/* グリッド背景パターン */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {openTasks.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center animate-fade-in">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-gray-600"
              >
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </div>
            <p className="text-gray-500 text-sm mb-1">
              ウィンドウが開かれていません
            </p>
            <p className="text-gray-700 text-xs">
              Slackメンションを受信するか、サイドバーのタスクをクリック
            </p>
          </div>
        </div>
      )}

      {openTasks.map((task) => (
        <ChatWindow
          key={task.id}
          task={task}
          isFocused={focusedWindowId === task.id}
          zIndex={getZIndex(task.id)}
        />
      ))}
    </div>
  );
}
