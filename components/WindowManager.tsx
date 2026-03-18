'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import ChatWindow from './ChatWindow';

export default function WindowManager() {
  const tasks = useAppStore((s) => s.tasks);
  const openWindowIds = useAppStore((s) => s.openWindowIds);
  const focusedWindowId = useAppStore((s) => s.focusedWindowId);
  const reorderWindows = useAppStore((s) => s.reorderWindows);

  // ドラッグ&ドロップ状態
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // コンテナサイズ計測
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // lastActivityAt 降順で表示するタスク一覧（最新が左上）
  const orderedTasks = useMemo(() => {
    return tasks
      .filter((t) => openWindowIds.includes(t.id))
      .sort((a, b) => {
        const aTime = a.lastActivityAt || a.createdAt;
        const bTime = b.lastActivityAt || b.createdAt;
        return bTime.localeCompare(aTime);
      });
  }, [tasks, openWindowIds]);

  // 動的グリッド計算（最大3列 × 2行）
  const gridStyle = useMemo(() => {
    const count = orderedTasks.length;
    if (count === 0) return {};

    const GAP = 12; // gap-3 = 12px
    // p-3 のパディングは contentRect に含まれない

    // 列数: 最大3列
    const cols = Math.min(count, 3);
    // 行数: 最大2行を表示枠として使う（それ以上はスクロール）
    const totalRows = Math.ceil(count / cols);
    const visibleRows = Math.min(totalRows, 2);

    // 行高さ計算
    let rowHeight = 500; // フォールバック
    if (containerHeight > 0) {
      const totalGap = (visibleRows - 1) * GAP;
      rowHeight = Math.floor((containerHeight - totalGap) / visibleRows);
      rowHeight = Math.max(rowHeight, 300); // 最小高さ
    }

    return {
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridAutoRows: `${rowHeight}px`,
    };
  }, [orderedTasks.length, containerHeight]);

  // ドラッグ&ドロップハンドラ
  const handleDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, taskId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(taskId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, toId: string) => {
    e.preventDefault();
    const fromId = e.dataTransfer.getData('text/plain');
    if (fromId && fromId !== toId) {
      reorderWindows(fromId, toId);
    }
    setDragOverId(null);
  }, [reorderWindows]);

  const handleDragEnd = useCallback(() => {
    setDragOverId(null);
  }, []);

  return (
    <div ref={containerRef} className="flex-1 bg-[#0F1117] overflow-auto p-3">
      {/* グリッド背景パターン */}
      <div
        className="fixed inset-0 opacity-[0.02] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {orderedTasks.length === 0 && (
        <div className="h-full flex items-center justify-center">
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

      {orderedTasks.length > 0 && (
        <div
          className="grid gap-3"
          style={gridStyle}
        >
          {orderedTasks.map((task) => (
            <div
              key={task.id}
              onDragOver={(e) => handleDragOver(e, task.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, task.id)}
              onDragEnd={handleDragEnd}
              className={`transition-all duration-150 rounded-lg ${
                dragOverId === task.id
                  ? 'ring-2 ring-[#4A9EFF] ring-offset-2 ring-offset-[#0F1117]'
                  : ''
              }`}
            >
              <ChatWindow
                task={task}
                isFocused={focusedWindowId === task.id}
                onHeaderDragStart={(e) => handleDragStart(e, task.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
