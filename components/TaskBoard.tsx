'use client';

import { useAppStore } from '@/lib/store';

export default function TaskBoard() {
  const tasks = useAppStore((s) => s.tasks);
  const openWindow = useAppStore((s) => s.openWindow);
  const restoreWindow = useAppStore((s) => s.restoreWindow);
  const focusedWindowId = useAppStore((s) => s.focusedWindowId);

  const openTasks = tasks.filter((t) => t.status === 'open');
  const completedTasks = tasks.filter((t) => t.status === 'completed');

  const formatTime = (ts: string) => {
    try {
      // Slack ts format: "1234567890.123456" → Unix timestamp
      const unixTs = parseFloat(ts);
      if (!isNaN(unixTs) && unixTs > 1000000000) {
        return new Date(unixTs * 1000).toLocaleTimeString('ja-JP', {
          hour: '2-digit',
          minute: '2-digit',
        });
      }
      // ISO string
      return new Date(ts).toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const truncate = (text: string, len: number) =>
    text.length > len ? text.slice(0, len) + '...' : text;

  return (
    <div className="w-64 bg-[#1A1D27] border-r border-white/10 flex flex-col h-full">
      {/* 未完了タスク */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-2 flex items-center justify-between border-b border-white/5">
          <span className="text-xs text-gray-400 uppercase tracking-wider">
            未完了
          </span>
          {openTasks.length > 0 && (
            <span className="text-xs bg-[#E74C3C] text-white px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
              {openTasks.length}
            </span>
          )}
        </div>

        <div className="space-y-0.5 p-1">
          {openTasks.length === 0 && (
            <div className="text-xs text-gray-600 px-3 py-4 text-center">
              未完了タスクはありません
            </div>
          )}
          {openTasks.map((task) => (
            <button
              key={task.id}
              onClick={() => {
                if (task.isMinimized) {
                  restoreWindow(task.id);
                } else {
                  openWindow(task.id);
                }
              }}
              className={`w-full text-left px-3 py-2 rounded text-xs transition hover:bg-white/5 ${
                focusedWindowId === task.id
                  ? 'bg-[#4A9EFF]/10 border-l-2 border-[#4A9EFF]'
                  : 'border-l-2 border-transparent'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[#4A9EFF]">#</span>
                <span className="text-gray-300 truncate">
                  {task.channelName}
                </span>
                {task.isMinimized && (
                  <span className="text-[10px] text-gray-500 ml-auto">min</span>
                )}
              </div>
              <div className="text-gray-500 truncate">
                {truncate(task.triggerMessage.text, 40)}
              </div>
              <div className="text-gray-600 mt-0.5">
                {formatTime(task.triggerMessage.ts)}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 完了済みタスク */}
      <CompletedSection tasks={completedTasks} formatTime={formatTime} truncate={truncate} />
    </div>
  );
}

function CompletedSection({
  tasks,
  formatTime,
  truncate,
}: {
  tasks: ReturnType<typeof useAppStore.getState>['tasks'];
  formatTime: (ts: string) => string;
  truncate: (text: string, len: number) => string;
}) {
  const openWindow = useAppStore((s) => s.openWindow);

  if (tasks.length === 0) return null;

  return (
    <details className="border-t border-white/5">
      <summary className="px-3 py-2 text-xs text-gray-500 cursor-pointer hover:text-gray-400 flex items-center justify-between">
        <span className="uppercase tracking-wider">完了済み</span>
        <span className="bg-[#2ECC71]/20 text-[#2ECC71] px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
          {tasks.length}
        </span>
      </summary>
      <div className="space-y-0.5 p-1 max-h-48 overflow-y-auto">
        {tasks.map((task) => (
          <button
            key={task.id}
            onClick={() => openWindow(task.id)}
            className="w-full text-left px-3 py-2 rounded text-xs transition hover:bg-white/5 opacity-60 border-l-2 border-transparent"
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[#2ECC71]">&#10003;</span>
              <span className="text-gray-400 truncate">
                {task.channelName}
              </span>
            </div>
            <div className="text-gray-600 truncate">
              {truncate(task.triggerMessage.text, 40)}
            </div>
            <div className="text-gray-700 mt-0.5">
              {formatTime(task.triggerMessage.ts)}
            </div>
          </button>
        ))}
      </div>
    </details>
  );
}
