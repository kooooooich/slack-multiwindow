'use client';

import { useAppStore } from '@/lib/store';
import ChatWindow from './ChatWindow';

export default function WindowManager() {
  const tasks = useAppStore((s) => s.tasks);
  const openWindowIds = useAppStore((s) => s.openWindowIds);
  const focusedWindowId = useAppStore((s) => s.focusedWindowId);

  const openTasks = tasks.filter((t) => openWindowIds.includes(t.id));

  return (
    <div className="flex-1 relative overflow-hidden bg-[#0F1117]">
      {openTasks.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-gray-600 text-4xl mb-4">&#9744;</div>
            <p className="text-gray-600 text-sm">
              Slackメンションを受信するとここにウィンドウが表示されます
            </p>
            <p className="text-gray-700 text-xs mt-2">
              サイドバーのタスクをクリックしてウィンドウを開くこともできます
            </p>
          </div>
        </div>
      )}

      {openTasks.map((task) => (
        <ChatWindow
          key={task.id}
          task={task}
          isFocused={focusedWindowId === task.id}
          zIndex={focusedWindowId === task.id ? 50 : 10}
        />
      ))}
    </div>
  );
}
