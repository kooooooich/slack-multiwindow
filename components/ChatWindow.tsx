'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import type { Task } from '@/types';

interface ChatWindowProps {
  task: Task;
  isFocused: boolean;
  zIndex: number;
}

export default function ChatWindow({ task, isFocused, zIndex }: ChatWindowProps) {
  const closeWindow = useAppStore((s) => s.closeWindow);
  const minimizeWindow = useAppStore((s) => s.minimizeWindow);
  const focusWindow = useAppStore((s) => s.focusWindow);
  const updateWindowPosition = useAppStore((s) => s.updateWindowPosition);
  const updateWindowSize = useAppStore((s) => s.updateWindowSize);

  const windowRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(task.windowPosition);
  const [size, setSize] = useState(task.windowSize);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // ドラッグ開始
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      focusWindow(task.id);
      setIsDragging(true);
      dragOffset.current = {
        x: e.clientX - pos.x,
        y: e.clientY - pos.y,
      };
    },
    [focusWindow, task.id, pos],
  );

  // リサイズ開始
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      focusWindow(task.id);
      setIsResizing(true);
      dragOffset.current = {
        x: e.clientX,
        y: e.clientY,
      };
    },
    [focusWindow, task.id],
  );

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newPos = {
          x: e.clientX - dragOffset.current.x,
          y: e.clientY - dragOffset.current.y,
        };
        setPos(newPos);
      } else if (isResizing) {
        const dx = e.clientX - dragOffset.current.x;
        const dy = e.clientY - dragOffset.current.y;
        setSize((prev) => ({
          width: Math.max(350, prev.width + dx),
          height: Math.max(300, prev.height + dy),
        }));
        dragOffset.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        setPos((p) => {
          updateWindowPosition(task.id, p);
          return p;
        });
      }
      if (isResizing) {
        setIsResizing(false);
        setSize((s) => {
          updateWindowSize(task.id, s);
          return s;
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, task.id, updateWindowPosition, updateWindowSize]);

  return (
    <div
      ref={windowRef}
      className={`absolute flex flex-col rounded-lg overflow-hidden ${
        isFocused ? 'border-[#4A9EFF]' : 'border-white/10'
      }`}
      style={{
        left: pos.x,
        top: pos.y,
        width: size.width,
        height: size.height,
        zIndex,
        border: '1px solid',
        borderColor: isFocused ? '#4A9EFF' : 'rgba(255,255,255,0.1)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        background: '#1E2235',
      }}
      onMouseDown={() => focusWindow(task.id)}
    >
      {/* ヘッダー */}
      <div
        className="h-9 bg-[#161929] flex items-center px-3 cursor-move shrink-0 select-none"
        onMouseDown={handleDragStart}
      >
        <div className="flex-1 text-xs text-gray-300 truncate">
          <span className="text-gray-500 mr-1">[{task.workspaceId.slice(0, 6)}]</span>
          <span className="text-[#4A9EFF]">#</span>
          {task.channelName}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => minimizeWindow(task.id)}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition text-xs"
            title="最小化"
          >
            &#8211;
          </button>
          <button
            onClick={() => closeWindow(task.id)}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#E74C3C]/30 text-gray-500 hover:text-[#E74C3C] transition text-xs"
            title="閉じる"
          >
            &#10005;
          </button>
        </div>
      </div>

      {/* メッセージ表示エリア（Step 7で完全実装） */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {task.threadMessages.length > 0 ? (
          task.threadMessages.map((msg) => (
            <div key={msg.id} className="flex gap-2">
              <div className="w-7 h-7 rounded bg-[#4A9EFF]/20 flex items-center justify-center text-[10px] text-[#4A9EFF] shrink-0">
                {msg.userName.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-gray-300">
                    {msg.userName}
                  </span>
                  <span className="text-[10px] text-gray-600">
                    {formatSlackTs(msg.ts)}
                  </span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5 break-words whitespace-pre-wrap">
                  {msg.text}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="flex gap-2">
            <div className="w-7 h-7 rounded bg-[#4A9EFF]/20 flex items-center justify-center text-[10px] text-[#4A9EFF] shrink-0">
              {task.triggerMessage.userName.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold text-gray-300">
                  {task.triggerMessage.userName}
                </span>
                <span className="text-[10px] text-gray-600">
                  {formatSlackTs(task.triggerMessage.ts)}
                </span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5 break-words whitespace-pre-wrap">
                {task.triggerMessage.text}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 返信エリアプレースホルダー（Step 7で実装） */}
      <div className="border-t border-white/5 p-2 shrink-0">
        <div className="text-[10px] text-gray-600 text-center py-2">
          返信機能（Step 7で実装）
        </div>
      </div>

      {/* リサイズハンドル */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
        onMouseDown={handleResizeStart}
        style={{
          background:
            'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.15) 50%)',
        }}
      />
    </div>
  );
}

function formatSlackTs(ts: string): string {
  try {
    const unixTs = parseFloat(ts);
    if (!isNaN(unixTs) && unixTs > 1000000000) {
      return new Date(unixTs * 1000).toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return new Date(ts).toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
