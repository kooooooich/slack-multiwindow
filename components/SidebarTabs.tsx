'use client';

import { useAppStore } from '@/lib/store';

export default function SidebarTabs() {
  const sidebarTab = useAppStore((s) => s.sidebarTab);
  const setSidebarTab = useAppStore((s) => s.setSidebarTab);

  return (
    <div className="flex border-b border-white/5 shrink-0">
      <button
        onClick={() => setSidebarTab('tasks')}
        className={`flex-1 px-3 py-2 text-xs uppercase tracking-wider transition border-b-2 ${
          sidebarTab === 'tasks'
            ? 'text-[#4A9EFF] border-[#4A9EFF]'
            : 'text-gray-500 border-transparent hover:text-gray-400'
        }`}
      >
        タスク
      </button>
      <button
        onClick={() => setSidebarTab('channels')}
        className={`flex-1 px-3 py-2 text-xs uppercase tracking-wider transition border-b-2 ${
          sidebarTab === 'channels'
            ? 'text-[#4A9EFF] border-[#4A9EFF]'
            : 'text-gray-500 border-transparent hover:text-gray-400'
        }`}
      >
        チャネル
      </button>
    </div>
  );
}
