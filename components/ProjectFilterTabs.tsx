'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/lib/store';

export default function ProjectFilterTabs() {
  const projects = useAppStore((s) => s.projects);
  const setProjects = useAppStore((s) => s.setProjects);
  const filterProjectId = useAppStore((s) => s.filterProjectId);
  const setFilterProjectId = useAppStore((s) => s.setFilterProjectId);
  const tasks = useAppStore((s) => s.tasks);

  // プロジェクト一覧を取得
  useEffect(() => {
    fetch('/api/projects')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProjects(data);
      })
      .catch(() => {});
  }, [setProjects]);

  // 未分類タスク数
  const unassignedCount = tasks.filter((t) => !t.projectId && t.status === 'open').length;

  // プロジェクトごとのオープンタスク数
  const projectTaskCounts = new Map<string, number>();
  for (const t of tasks) {
    if (t.projectId && t.status === 'open') {
      projectTaskCounts.set(t.projectId, (projectTaskCounts.get(t.projectId) || 0) + 1);
    }
  }

  const tabs = [
    { id: null as string | null, label: 'ALL', count: tasks.filter((t) => t.status === 'open').length },
    ...projects.map((p) => ({
      id: p.id,
      label: p.name,
      count: projectTaskCounts.get(p.id) || 0,
    })),
    { id: 'unassigned', label: '未分類', count: unassignedCount },
  ];

  if (projects.length === 0) return null;

  return (
    <div className="bg-[#1A1D27] border-b border-white/10 px-4 shrink-0">
      <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide py-1">
        {tabs.map((tab) => (
          <button
            key={tab.id ?? 'all'}
            onClick={() => setFilterProjectId(tab.id)}
            className={`shrink-0 px-3 py-1.5 rounded text-[11px] transition whitespace-nowrap flex items-center gap-1.5 ${
              filterProjectId === tab.id
                ? 'bg-[#4A9EFF]/20 text-[#4A9EFF] font-medium'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`text-[9px] px-1 py-0 rounded-full min-w-[16px] text-center ${
                filterProjectId === tab.id
                  ? 'bg-[#4A9EFF]/30 text-[#4A9EFF]'
                  : 'bg-white/10 text-gray-500'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
