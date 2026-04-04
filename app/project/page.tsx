'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Project, ProjectMemo, ProjectDocument, ProjectChannel, Task } from '@/types';

// Slack mrkdwn を表示名に変換
function stripMrkdwn(text: string) {
  return text
    .replace(/<@[A-Z0-9]+\|([^>]+)>/g, '@$1')
    .replace(/<@([A-Z0-9]+)>/g, '@$1')
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1')
    .replace(/<#([A-Z0-9]+)>/g, '#$1')
    .replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, '$2')
    .replace(/<(https?:\/\/[^>]+)>/g, '$1');
}

export default function ProjectPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [memos, setMemos] = useState<ProjectMemo[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);

  // プロジェクト名インライン編集
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');

  // メモインライン編集
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [editingMemoText, setEditingMemoText] = useState('');
  const [editingMemoNote, setEditingMemoNote] = useState('');

  // タスク選択モーダル
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [savingMemoTs, setSavingMemoTs] = useState<string | null>(null);

  // README（プロジェクト概要）
  const [readme, setReadme] = useState('');
  const [editingReadme, setEditingReadme] = useState(false);
  const [readmeText, setReadmeText] = useState('');

  // スタンドアロンメモ作成
  const [showNewMemo, setShowNewMemo] = useState(false);
  const [newMemoText, setNewMemoText] = useState('');
  const [newMemoNote, setNewMemoNote] = useState('');

  // プロジェクト削除確認
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // ドキュメント管理
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadDocError, setUploadDocError] = useState<string | null>(null);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editingDocDesc, setEditingDocDesc] = useState('');
  const [deleteDocConfirmId, setDeleteDocConfirmId] = useState<string | null>(null);
  const [copiedMemoId, setCopiedMemoId] = useState<string | null>(null);

  // AI
  const [aiResult, setAiResult] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');

  // IME 入力中フラグ
  const [isComposing, setIsComposing] = useState(false);

  // メモ削除確認
  const [deleteMemoConfirmId, setDeleteMemoConfirmId] = useState<string | null>(null);

  // チャネル紐付け管理
  const [projectChannels, setProjectChannels] = useState<ProjectChannel[]>([]);
  const [showChannelPicker, setShowChannelPicker] = useState(false);
  const [availableChannels, setAvailableChannels] = useState<{ id: string; name: string; type?: string }[]>([]);
  const [channelSearchQuery, setChannelSearchQuery] = useState('');
  const [allProjectChannels, setAllProjectChannels] = useState<ProjectChannel[]>([]);

  // 右パネル（概要）のリサイズ
  const [rightPanelWidth, setRightPanelWidth] = useState(380);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // リサイズハンドラ
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const diff = resizeRef.current.startX - e.clientX;
      const newWidth = Math.min(Math.max(resizeRef.current.startWidth + diff, 260), 700);
      setRightPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  const startResize = useCallback((e: React.MouseEvent) => {
    resizeRef.current = { startX: e.clientX, startWidth: rightPanelWidth };
    setIsResizing(true);
  }, [rightPanelWidth]);

  // プロジェクト一覧取得
  useEffect(() => {
    fetch('/api/projects')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProjects(data);
      })
      .catch(() => {});
  }, []);

  // メモ取得 + README読み込み + ドキュメント取得 + チャネル紐付け取得
  useEffect(() => {
    if (!selectedProjectId) {
      setMemos([]);
      setDocuments([]);
      setProjectChannels([]);
      setReadme('');
      return;
    }
    fetch(`/api/projects/memos?projectId=${selectedProjectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setMemos(data);
      })
      .catch(() => {});
    fetch(`/api/projects/documents?projectId=${selectedProjectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setDocuments(data);
      })
      .catch(() => {});
    fetch(`/api/projects/channels?projectId=${selectedProjectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProjectChannels(data);
      })
      .catch(() => {});
    // プロジェクトの readme を反映
    const p = projects.find((pr) => pr.id === selectedProjectId);
    setReadme(p?.readme || '');
    setEditingReadme(false);
  }, [selectedProjectId, projects]);

  // 全プロジェクトチャネル紐付けを取得（重複チェック用）
  useEffect(() => {
    fetch('/api/projects/channels')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setAllProjectChannels(data);
      })
      .catch(() => {});
  }, [projectChannels]);

  // プロジェクト作成
  const createProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName.trim() }),
      });
      if (res.ok) {
        const project = await res.json();
        setProjects((prev) => [project, ...prev]);
        setSelectedProjectId(project.id);
        setNewProjectName('');
        setShowNewProject(false);
      }
    } catch {
      // ignore
    }
  };

  // プロジェクト削除
  const deleteProject = async (id: string) => {
    try {
      await fetch(`/api/projects?id=${id}`, { method: 'DELETE' });
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (selectedProjectId === id) {
        setSelectedProjectId(null);
        setMemos([]);
      }
    } catch {
      // ignore
    }
  };

  // メモ削除
  const deleteMemo = async (id: string) => {
    try {
      await fetch(`/api/projects/memos?id=${id}`, { method: 'DELETE' });
      setMemos((prev) => prev.filter((m) => m.id !== id));
    } catch {
      // ignore
    }
  };

  // プロジェクト名更新
  const updateProjectName = async (id: string, name: string) => {
    if (!name.trim()) {
      setEditingProjectId(null);
      return;
    }
    try {
      const res = await fetch('/api/projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: name.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name: updated.name } : p)));
      }
    } catch {
      // ignore
    }
    setEditingProjectId(null);
  };

  // README 保存
  const saveReadme = async (text: string) => {
    if (!selectedProjectId) return;
    try {
      const res = await fetch('/api/projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedProjectId, readme: text }),
      });
      if (res.ok) {
        const updated = await res.json();
        setReadme(updated.readme || '');
        setProjects((prev) => prev.map((p) => (p.id === selectedProjectId ? { ...p, readme: updated.readme || '' } : p)));
      }
    } catch {
      // ignore
    }
    setEditingReadme(false);
  };

  // スタンドアロンメモ作成
  const createStandaloneMemo = async () => {
    if (!selectedProjectId || !newMemoText.trim()) return;
    try {
      const res = await fetch('/api/projects/memos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          messageText: newMemoText.trim(),
          note: newMemoNote.trim(),
        }),
      });
      if (res.ok) {
        const memo = await res.json();
        setMemos((prev) => [...prev, memo]);
        setNewMemoText('');
        setNewMemoNote('');
        setShowNewMemo(false);
      }
    } catch {
      // ignore
    }
  };

  // メモをAIで概要に統合
  const [appendingMemoId, setAppendingMemoId] = useState<string | null>(null);

  const appendMemoToReadme = async (memoText: string, memoId?: string) => {
    if (!selectedProjectId) return;
    if (memoId) setAppendingMemoId(memoId);
    try {
      const res = await fetch('/api/ai/memo-to-readme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          memoText,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const updatedReadme = data.result;
        if (updatedReadme) {
          await saveReadme(updatedReadme);
        }
      }
    } catch {
      // AI失敗時はフォールバック（単純追記）
      const newReadme = readme ? `${readme}\n\n${memoText}` : memoText;
      await saveReadme(newReadme);
    } finally {
      setAppendingMemoId(null);
    }
  };

  // メモ更新
  const updateMemoContent = async (id: string) => {
    try {
      const res = await fetch('/api/projects/memos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, messageText: editingMemoText, note: editingMemoNote }),
      });
      if (res.ok) {
        const updated = await res.json();
        setMemos((prev) => prev.map((m) => (m.id === id ? { ...m, messageText: updated.messageText, note: updated.note } : m)));
      }
    } catch {
      // ignore
    }
    setEditingMemoId(null);
  };

  // タスク一覧取得
  const openTaskPicker = async () => {
    setShowTaskPicker(true);
    try {
      const res = await fetch('/api/tasks');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setTasks(data);
      }
    } catch {
      // ignore
    }
  };

  // メッセージをメモに追加
  const addMessageAsMemo = async (task: Task, msgText: string, msgUser: string, msgTs: string) => {
    if (!selectedProjectId) return;
    setSavingMemoTs(msgTs);
    try {
      const res = await fetch('/api/projects/memos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          taskId: task.id,
          messageTs: msgTs,
          messageUser: msgUser,
          messageText: msgText,
          channelId: task.channelId,
          workspaceId: task.workspaceId,
        }),
      });
      if (res.ok) {
        const memo = await res.json();
        setMemos((prev) => [...prev, memo]);
      }
    } catch {
      // ignore
    } finally {
      setSavingMemoTs(null);
    }
  };

  // AI Q&A
  const handleAskQuestion = async () => {
    if (!selectedProjectId || !aiQuestion.trim() || (memos.length === 0 && !readme.trim())) return;
    setAiLoading(true);
    setAiResult('');
    try {
      const res = await fetch('/api/ai/memo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          action: 'chat',
          question: aiQuestion.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiResult(data.result || '');
      }
    } catch {
      setAiResult('エラーが発生しました');
    } finally {
      setAiLoading(false);
      setAiQuestion('');
    }
  };

  // ドキュメントアップロード
  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedProjectId) return;
    setUploadingDoc(true);
    setUploadDocError(null);
    try {
      // クライアント側サイズチェック
      const maxSize = 30 * 1024 * 1024;
      if (file.size > maxSize) {
        setUploadDocError(`ファイルサイズが大きすぎます（${(file.size / 1024 / 1024).toFixed(1)}MB）。30MB以下のファイルを選択してください。`);
        return;
      }
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', selectedProjectId);
      const res = await fetch('/api/projects/documents', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const doc = await res.json();
        setDocuments((prev) => [doc, ...prev]);
      } else {
        const data = await res.json().catch(() => null);
        setUploadDocError(data?.error || `アップロードに失敗しました（${res.status}）`);
      }
    } catch (err) {
      setUploadDocError(`アップロードに失敗しました: ${err instanceof Error ? err.message : 'ネットワークエラー'}`);
    } finally {
      setUploadingDoc(false);
      e.target.value = '';
    }
  };

  // ドキュメント概要更新
  const updateDocDescription = async (id: string) => {
    try {
      const res = await fetch('/api/projects/documents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, description: editingDocDesc }),
      });
      if (res.ok) {
        const updated = await res.json();
        setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, description: updated.description } : d)));
      }
    } catch { /* ignore */ }
    setEditingDocId(null);
  };

  // ドキュメント削除
  const deleteDoc = async (id: string) => {
    try {
      await fetch(`/api/projects/documents?id=${id}`, { method: 'DELETE' });
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch { /* ignore */ }
  };

  // メモURLをクリップボードにコピー
  const copyMemoUrl = (url: string, memoId: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedMemoId(memoId);
      setTimeout(() => setCopiedMemoId(null), 2000);
    }).catch(() => {});
  };

  // チャネル紐付け追加
  const addChannel = async (channelId: string, channelName: string) => {
    if (!selectedProjectId) return;
    try {
      const res = await fetch('/api/projects/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selectedProjectId, channelId, channelName }),
      });
      if (res.ok) {
        const pc = await res.json();
        setProjectChannels((prev) => [...prev, pc]);
        setShowChannelPicker(false);
        setChannelSearchQuery('');
      } else if (res.status === 409) {
        alert('このチャネルは既に別のプロジェクトに紐付けられています');
      }
    } catch { /* ignore */ }
  };

  // チャネル紐付け解除
  const removeChannel = async (channelId: string) => {
    if (!selectedProjectId) return;
    try {
      await fetch(`/api/projects/channels?projectId=${selectedProjectId}&channelId=${channelId}`, { method: 'DELETE' });
      setProjectChannels((prev) => prev.filter((pc) => pc.channelId !== channelId));
    } catch { /* ignore */ }
  };

  // チャネルピッカーを開く（Slack チャネル一覧取得）
  const openChannelPicker = async () => {
    setShowChannelPicker(true);
    try {
      const res = await fetch('/api/slack/channels');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setAvailableChannels(data);
      }
    } catch { /* ignore */ }
  };

  // ファイルサイズ表示
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ファイルタイプアイコン
  const getFileIcon = (mimeType: string) => {
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType.includes('word') || mimeType.includes('.document')) return '📝';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📑';
    if (mimeType.startsWith('text/')) return '📃';
    return '📎';
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div className="h-screen flex flex-col bg-[#0F1117]">
      {/* ヘッダー */}
      <header className="h-11 bg-[#1A1D27] border-b border-white/10 flex items-center px-4 shrink-0">
        <Link
          href="/"
          className="text-gray-500 hover:text-gray-300 transition p-1 rounded hover:bg-white/5 mr-3"
          title="メインに戻る"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-sm font-bold text-white tracking-wide">
          プロジェクト
        </h1>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* プロジェクトサイドバー */}
        <div className="w-56 bg-[#1A1D27] border-r border-white/10 flex flex-col shrink-0">
          <div className="px-3 py-2 flex items-center justify-between border-b border-white/5">
            <span className="text-xs text-gray-400 uppercase tracking-wider">プロジェクト</span>
            <button
              onClick={() => setShowNewProject(!showNewProject)}
              className="text-[#4A9EFF] hover:text-[#4A9EFF]/80 transition text-sm"
            >
              +
            </button>
          </div>

          {showNewProject && (
            <div className="p-2 border-b border-white/5">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isComposing) createProject();
                }}
                placeholder="プロジェクト名..."
                className="w-full bg-[#0F1117] border border-white/10 rounded px-2 py-1 text-[10px] text-white placeholder-gray-600 focus:outline-none focus:border-[#4A9EFF]"
                autoFocus
              />
              <div className="flex gap-1 mt-1">
                <button
                  onClick={createProject}
                  className="px-2 py-0.5 text-[10px] rounded bg-[#4A9EFF]/20 text-[#4A9EFF] hover:bg-[#4A9EFF]/30 transition"
                >
                  作成
                </button>
                <button
                  onClick={() => { setShowNewProject(false); setNewProjectName(''); }}
                  className="px-2 py-0.5 text-[10px] rounded bg-white/5 text-gray-500 hover:bg-white/10 transition"
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
            {projects.length === 0 && (
              <div className="text-xs text-gray-600 px-3 py-4 text-center">
                プロジェクトを作成してください
              </div>
            )}
            {projects.map((p) => (
              <div
                key={p.id}
                className={`group flex items-center justify-between px-3 py-2 rounded text-xs cursor-pointer transition ${
                  selectedProjectId === p.id
                    ? 'bg-[#4A9EFF]/10 text-white border-l-2 border-[#4A9EFF]'
                    : 'text-gray-400 hover:bg-white/5 border-l-2 border-transparent'
                }`}
                onClick={() => setSelectedProjectId(p.id)}
              >
                {editingProjectId === p.id ? (
                  <input
                    type="text"
                    value={editingProjectName}
                    onChange={(e) => setEditingProjectName(e.target.value)}
                    onCompositionStart={() => setIsComposing(true)}
                    onCompositionEnd={() => setIsComposing(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isComposing) {
                        updateProjectName(p.id, editingProjectName);
                      } else if (e.key === 'Escape') {
                        setEditingProjectId(null);
                      }
                    }}
                    onBlur={() => updateProjectName(p.id, editingProjectName)}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 bg-[#0F1117] border border-[#4A9EFF] rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
                    autoFocus
                  />
                ) : (
                  <span
                    className="truncate"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingProjectId(p.id);
                      setEditingProjectName(p.name);
                    }}
                    title="ダブルクリックで名前を編集"
                  >
                    {p.name}
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirmId(p.id);
                  }}
                  className="text-gray-600 hover:text-[#E74C3C] transition opacity-0 group-hover:opacity-100 text-[10px] shrink-0"
                  title="プロジェクトを削除"
                >
                  &#10005;
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* メインコンテンツ（メモ + 概要パネル） */}
        <div className="flex-1 flex overflow-hidden">
          {!selectedProject ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-xs text-gray-600">プロジェクトを選択してください</div>
            </div>
          ) : (
            <>
              {/* 左: メモ一覧 + AI */}
              <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                {/* メモ一覧 */}
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm text-gray-300 font-semibold">{selectedProject.name}</h2>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setShowNewMemo(!showNewMemo)}
                        className="px-2.5 py-1 text-[10px] rounded bg-[#2ECC71]/20 text-[#2ECC71] hover:bg-[#2ECC71]/30 transition"
                      >
                        + メモを作成
                      </button>
                      <button
                        onClick={openTaskPicker}
                        className="px-2.5 py-1 text-[10px] rounded bg-[#4A9EFF]/20 text-[#4A9EFF] hover:bg-[#4A9EFF]/30 transition"
                      >
                        + タスクから追加
                      </button>
                    </div>
                  </div>

                  {/* スタンドアロンメモ作成フォーム */}
                  {showNewMemo && (
                    <div className="mb-3 p-3 rounded-lg bg-[#1A1D27] border border-[#2ECC71]/20">
                      <div className="space-y-2">
                        <textarea
                          value={newMemoText}
                          onChange={(e) => setNewMemoText(e.target.value)}
                          placeholder="メモの内容を入力..."
                          className="w-full bg-[#0F1117] border border-white/10 rounded px-2.5 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[#2ECC71] resize-y min-h-[60px]"
                          rows={3}
                          autoFocus
                        />
                        <input
                          type="text"
                          value={newMemoNote}
                          onChange={(e) => setNewMemoNote(e.target.value)}
                          placeholder="注記（任意）..."
                          className="w-full bg-[#0F1117] border border-white/10 rounded px-2.5 py-1.5 text-[10px] text-white placeholder-gray-600 focus:outline-none focus:border-[#2ECC71]"
                        />
                        <div className="flex gap-1">
                          <button
                            onClick={createStandaloneMemo}
                            disabled={!newMemoText.trim()}
                            className="px-2 py-0.5 text-[10px] rounded bg-[#2ECC71]/20 text-[#2ECC71] hover:bg-[#2ECC71]/30 transition disabled:opacity-30"
                          >
                            追加
                          </button>
                          <button
                            onClick={() => { setShowNewMemo(false); setNewMemoText(''); setNewMemoNote(''); }}
                            className="px-2 py-0.5 text-[10px] rounded bg-white/5 text-gray-500 hover:bg-white/10 transition"
                          >
                            キャンセル
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {memos.length === 0 && (
                    <div className="text-xs text-gray-600 text-center py-8">
                      メモはまだありません。「メモを作成」またはタスクから追加してください。
                    </div>
                  )}

                  <div className="space-y-2">
                    {memos.map((memo) => (
                      <div
                        key={memo.id}
                        className="p-3 rounded-lg bg-[#1A1D27] border border-white/5 group"
                      >
                        {editingMemoId === memo.id ? (
                          /* 編集モード */
                          <div className="space-y-2">
                            {memo.messageUser && (
                              <span className="text-[10px] text-[#4A9EFF] font-medium">
                                {memo.messageUser}
                              </span>
                            )}
                            <textarea
                              value={editingMemoText}
                              onChange={(e) => setEditingMemoText(e.target.value)}
                              className="w-full bg-[#0F1117] border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#4A9EFF] resize-y min-h-[60px]"
                              rows={3}
                            />
                            <div>
                              <label className="text-[10px] text-gray-500 block mb-0.5">注記:</label>
                              <input
                                type="text"
                                value={editingMemoNote}
                                onChange={(e) => setEditingMemoNote(e.target.value)}
                                placeholder="注記を入力..."
                                className="w-full bg-[#0F1117] border border-white/10 rounded px-2 py-1 text-[10px] text-white placeholder-gray-600 focus:outline-none focus:border-[#4A9EFF]"
                              />
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={() => updateMemoContent(memo.id)}
                                className="px-2 py-0.5 text-[10px] rounded bg-[#4A9EFF]/20 text-[#4A9EFF] hover:bg-[#4A9EFF]/30 transition"
                              >
                                保存
                              </button>
                              <button
                                onClick={() => setEditingMemoId(null)}
                                className="px-2 py-0.5 text-[10px] rounded bg-white/5 text-gray-500 hover:bg-white/10 transition"
                              >
                                キャンセル
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* 表示モード */
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              {memo.messageUser && (
                                <span className="text-[10px] text-[#4A9EFF] font-medium">
                                  {memo.messageUser}
                                </span>
                              )}
                              <p className="text-xs text-gray-300 mt-0.5 whitespace-pre-wrap break-words">
                                {stripMrkdwn(memo.messageText)}
                              </p>
                              {memo.note && (
                                <p className="text-[10px] text-gray-500 mt-1 italic">
                                  注記: {memo.note}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition">
                              {memo.messageUrl && (
                                <>
                                  <a
                                    href={memo.messageUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-gray-600 hover:text-[#4A9EFF] transition text-xs"
                                    title="Slackで開く"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                  </a>
                                  <button
                                    onClick={() => copyMemoUrl(memo.messageUrl!, memo.id)}
                                    className="text-gray-600 hover:text-[#4A9EFF] transition text-[10px]"
                                    title="URLをコピー"
                                  >
                                    {copiedMemoId === memo.id ? '✓' : '🔗'}
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => appendMemoToReadme(memo.messageText, memo.id)}
                                disabled={appendingMemoId === memo.id}
                                className="text-gray-600 hover:text-[#2ECC71] transition text-[10px] disabled:opacity-50"
                                title="AIで概要に統合"
                              >
                                {appendingMemoId === memo.id ? '処理中...' : '↗概要'}
                              </button>
                              <button
                                onClick={() => {
                                  setEditingMemoId(memo.id);
                                  setEditingMemoText(memo.messageText);
                                  setEditingMemoNote(memo.note || '');
                                }}
                                className="text-gray-600 hover:text-[#4A9EFF] transition text-xs"
                                title="編集"
                              >
                                &#9998;
                              </button>
                              <button
                                onClick={() => setDeleteMemoConfirmId(memo.id)}
                                className="text-gray-600 hover:text-[#E74C3C] transition text-xs"
                                title="削除"
                              >
                                &#10005;
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* ドキュメントセクション */}
                <div className="border-t border-white/10 px-4 py-3 bg-[#151820] shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-400 font-semibold">ドキュメント</span>
                    <label className={`px-2.5 py-1 text-[10px] rounded cursor-pointer transition ${
                      uploadingDoc
                        ? 'bg-gray-500/20 text-gray-500 animate-pulse'
                        : 'bg-[#F39C12]/20 text-[#F39C12] hover:bg-[#F39C12]/30'
                    }`}>
                      {uploadingDoc ? 'アップロード中...' : '+ ファイル追加'}
                      <input
                        type="file"
                        onChange={handleDocUpload}
                        disabled={uploadingDoc}
                        className="hidden"
                        accept=".pdf,.docx,.xlsx,.pptx,.md,.txt,.csv,.json,.odt,.odp,.ods"
                      />
                    </label>
                  </div>

                  {uploadDocError && (
                    <div className="mb-2 px-2.5 py-1.5 bg-red-500/15 border border-red-500/30 rounded text-[11px] text-red-400 flex items-start gap-1.5">
                      <span className="shrink-0 mt-px">&#9888;</span>
                      <span className="flex-1">{uploadDocError}</span>
                      <button onClick={() => setUploadDocError(null)} className="shrink-0 text-red-400/60 hover:text-red-400">&#10005;</button>
                    </div>
                  )}

                  {documents.length > 0 && (
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded bg-[#1A1D27] border border-white/5 group text-xs"
                        >
                          <span className="text-sm shrink-0">{getFileIcon(doc.mimeType)}</span>
                          <div className="flex-1 min-w-0">
                            <a
                              href={`/api/projects/documents/download?id=${doc.id}`}
                              className="text-gray-300 hover:text-[#4A9EFF] transition truncate block"
                              title={`ダウンロード: ${doc.originalName}`}
                            >
                              {doc.originalName}
                            </a>
                            {editingDocId === doc.id ? (
                              <div className="flex gap-1 mt-0.5">
                                <input
                                  type="text"
                                  value={editingDocDesc}
                                  onChange={(e) => setEditingDocDesc(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') updateDocDescription(doc.id);
                                    if (e.key === 'Escape') setEditingDocId(null);
                                  }}
                                  className="flex-1 bg-[#0F1117] border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white focus:outline-none focus:border-[#4A9EFF]"
                                  placeholder="ファイルの概要..."
                                  autoFocus
                                />
                                <button
                                  onClick={() => updateDocDescription(doc.id)}
                                  className="text-[10px] text-[#4A9EFF] hover:text-[#4A9EFF]/80"
                                >
                                  保存
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-gray-600">{formatFileSize(doc.sizeBytes)}</span>
                                {doc.description ? (
                                  <span
                                    className="text-[10px] text-gray-500 truncate cursor-pointer hover:text-gray-400"
                                    onClick={() => { setEditingDocId(doc.id); setEditingDocDesc(doc.description); }}
                                    title="クリックして編集"
                                  >
                                    — {doc.description}
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => { setEditingDocId(doc.id); setEditingDocDesc(''); }}
                                    className="text-[10px] text-gray-700 hover:text-gray-500 transition opacity-0 group-hover:opacity-100"
                                  >
                                    + 概要を追加
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => setDeleteDocConfirmId(doc.id)}
                            className="text-gray-700 hover:text-[#E74C3C] transition text-[10px] opacity-0 group-hover:opacity-100 shrink-0"
                            title="削除"
                          >
                            &#10005;
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {documents.length === 0 && (
                    <p className="text-[10px] text-gray-700">PDF・Office・Markdown等のファイルを添付できます</p>
                  )}
                </div>

                {/* AI チャットパネル */}
                <div className="border-t border-white/10 p-4 bg-[#1A1D27] shrink-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-purple-400 font-semibold">AI分析</span>
                  </div>

                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={aiQuestion}
                      onChange={(e) => setAiQuestion(e.target.value)}
                      onCompositionStart={() => setIsComposing(true)}
                      onCompositionEnd={() => setIsComposing(false)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isComposing) handleAskQuestion();
                      }}
                      placeholder="メモの内容について質問..."
                      className="flex-1 bg-[#0F1117] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition"
                    />
                    <button
                      onClick={handleAskQuestion}
                      disabled={aiLoading || !aiQuestion.trim() || (memos.length === 0 && !readme.trim())}
                      className="px-3 py-1.5 text-[10px] rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition disabled:opacity-30"
                    >
                      質問
                    </button>
                  </div>

                  {aiLoading && (
                    <div className="text-[10px] text-gray-500 mt-2">AI分析中...</div>
                  )}

                  {aiResult && (
                    <div className="mt-2 p-3 rounded bg-[#0F1117] border border-purple-500/10 max-h-48 overflow-y-auto">
                      <p className="text-xs text-gray-300 whitespace-pre-wrap">{aiResult}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* リサイズハンドル */}
              <div
                onMouseDown={startResize}
                className="w-1 bg-white/5 hover:bg-[#4A9EFF]/40 active:bg-[#4A9EFF]/60 cursor-col-resize transition-colors shrink-0 relative group/resize"
              >
                <div className="absolute inset-y-0 -left-1 -right-1" />
                {/* 中央のグリップインジケータ */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-0 group-hover/resize:opacity-100 transition-opacity">
                  <div className="w-0.5 h-0.5 rounded-full bg-gray-400" />
                  <div className="w-0.5 h-0.5 rounded-full bg-gray-400" />
                  <div className="w-0.5 h-0.5 rounded-full bg-gray-400" />
                </div>
              </div>

              {/* 右: 概要 (README) パネル */}
              <div
                className="bg-[#1A1D27] flex flex-col overflow-hidden shrink-0"
                style={{ width: rightPanelWidth }}
              >
                {/* チャネル紐付け */}
                <div className="px-4 py-2.5 border-b border-white/5 shrink-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">紐付きチャネル</span>
                    <button
                      onClick={openChannelPicker}
                      className="text-[#4A9EFF] hover:text-[#4A9EFF]/80 transition text-xs"
                      title="チャネルを追加"
                    >
                      +
                    </button>
                  </div>
                  {projectChannels.length === 0 ? (
                    <div className="text-[10px] text-gray-600">チャネル未設定</div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {projectChannels.map((pc) => (
                        <span
                          key={pc.id}
                          className="group inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#4A9EFF]/10 text-[10px] text-[#4A9EFF]"
                        >
                          #{pc.channelName}
                          <button
                            onClick={() => removeChannel(pc.channelId)}
                            className="text-gray-600 hover:text-[#E74C3C] opacity-0 group-hover:opacity-100 transition"
                          >
                            &#10005;
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 概要ヘッダー */}
                <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between shrink-0">
                  <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">概要 (README)</span>
                  {!editingReadme && (
                    <button
                      onClick={() => {
                        setEditingReadme(true);
                        setReadmeText(readme);
                      }}
                      className="text-gray-600 hover:text-[#4A9EFF] transition text-xs"
                      title="概要を編集"
                    >
                      &#9998;
                    </button>
                  )}
                </div>

                {/* 概要コンテンツ */}
                <div className="flex-1 overflow-y-auto p-4">
                  {editingReadme ? (
                    <div className="h-full flex flex-col">
                      <textarea
                        value={readmeText}
                        onChange={(e) => setReadmeText(e.target.value)}
                        placeholder="プロジェクトの概要を記入してください..."
                        className="flex-1 w-full bg-[#0F1117] border border-white/10 rounded px-2.5 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[#4A9EFF] resize-none min-h-[120px]"
                        autoFocus
                      />
                      <div className="flex gap-1 mt-2 shrink-0">
                        <button
                          onClick={() => saveReadme(readmeText)}
                          className="px-2.5 py-1 text-[10px] rounded bg-[#4A9EFF]/20 text-[#4A9EFF] hover:bg-[#4A9EFF]/30 transition"
                        >
                          保存
                        </button>
                        <button
                          onClick={() => setEditingReadme(false)}
                          className="px-2.5 py-1 text-[10px] rounded bg-white/5 text-gray-500 hover:bg-white/10 transition"
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : readme || documents.length > 0 ? (
                    <>
                    {/* ドキュメント参照リスト */}
                    {documents.length > 0 && (
                      <div className="mb-4 p-2.5 rounded-lg bg-[#0F1117] border border-white/5">
                        <h4 className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 font-semibold">添付ドキュメント</h4>
                        <div className="space-y-1">
                          {documents.map((doc) => (
                            <a
                              key={doc.id}
                              href={`/api/projects/documents/download?id=${doc.id}`}
                              className="flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-[#4A9EFF] transition py-0.5"
                            >
                              <span>{getFileIcon(doc.mimeType)}</span>
                              <span className="truncate">{doc.originalName}</span>
                              {doc.description && <span className="text-gray-600 truncate">— {doc.description}</span>}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    {readme ? (
                    <div className="prose prose-invert prose-xs max-w-none
                      [&_h1]:text-sm [&_h1]:text-gray-200 [&_h1]:font-bold [&_h1]:mt-3 [&_h1]:mb-1.5
                      [&_h2]:text-xs [&_h2]:text-gray-300 [&_h2]:font-semibold [&_h2]:mt-2.5 [&_h2]:mb-1
                      [&_h3]:text-xs [&_h3]:text-gray-400 [&_h3]:font-medium [&_h3]:mt-2 [&_h3]:mb-0.5
                      [&_p]:text-xs [&_p]:text-gray-300 [&_p]:leading-relaxed [&_p]:mb-2
                      [&_ul]:text-xs [&_ul]:text-gray-300 [&_ul]:ml-3 [&_ul]:mb-2 [&_ul]:list-disc
                      [&_ol]:text-xs [&_ol]:text-gray-300 [&_ol]:ml-3 [&_ol]:mb-2 [&_ol]:list-decimal
                      [&_li]:mb-0.5
                      [&_code]:text-[10px] [&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-purple-300
                      [&_pre]:bg-[#0F1117] [&_pre]:rounded [&_pre]:p-2 [&_pre]:mb-2 [&_pre]:overflow-x-auto
                      [&_pre_code]:bg-transparent [&_pre_code]:p-0
                      [&_blockquote]:border-l-2 [&_blockquote]:border-gray-600 [&_blockquote]:pl-2 [&_blockquote]:text-gray-400 [&_blockquote]:italic
                      [&_a]:text-[#4A9EFF] [&_a]:underline [&_a:hover]:text-[#4A9EFF]/80
                      [&_table]:text-[10px] [&_table]:w-full [&_table]:mb-2
                      [&_th]:border [&_th]:border-white/10 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-white/5 [&_th]:text-gray-300
                      [&_td]:border [&_td]:border-white/10 [&_td]:px-2 [&_td]:py-1 [&_td]:text-gray-400
                      [&_hr]:border-white/10 [&_hr]:my-3
                    ">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{readme}</ReactMarkdown>
                    </div>
                    ) : !documents.length ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <p className="text-[10px] text-gray-600 mb-2">概要を作成してください</p>
                        <button
                          onClick={() => {
                            setEditingReadme(true);
                            setReadmeText('');
                          }}
                          className="px-2.5 py-1 text-[10px] rounded bg-[#4A9EFF]/20 text-[#4A9EFF] hover:bg-[#4A9EFF]/30 transition"
                        >
                          概要を作成
                        </button>
                      </div>
                    ) : null}
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-3">
                        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <p className="text-[10px] text-gray-600 mb-2">概要が設定されていません</p>
                      <button
                        onClick={() => {
                          setEditingReadme(true);
                          setReadmeText('');
                        }}
                        className="px-2.5 py-1 text-[10px] rounded bg-[#4A9EFF]/20 text-[#4A9EFF] hover:bg-[#4A9EFF]/30 transition"
                      >
                        概要を作成
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* プロジェクト削除確認ダイアログ */}
      {deleteConfirmId && (() => {
        const targetProject = projects.find((p) => p.id === deleteConfirmId);
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="w-[360px] bg-[#1A1D27] rounded-lg border border-white/10 shadow-2xl">
              <div className="px-5 py-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-full bg-[#E74C3C]/15 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-[#E74C3C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-sm text-white font-semibold">プロジェクトの削除</h3>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  プロジェクト「<span className="text-gray-200 font-medium">{targetProject?.name}</span>」を削除しますか？
                </p>
                <p className="text-[10px] text-gray-500 mt-1.5">
                  この操作は取り消せません。プロジェクトに含まれるすべてのメモと概要も削除されます。
                </p>
              </div>
              <div className="px-5 py-3 border-t border-white/5 flex justify-end gap-2">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="px-3 py-1.5 text-[11px] rounded bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-300 transition"
                >
                  キャンセル
                </button>
                <button
                  onClick={() => {
                    deleteProject(deleteConfirmId);
                    setDeleteConfirmId(null);
                  }}
                  className="px-3 py-1.5 text-[11px] rounded bg-[#E74C3C]/20 text-[#E74C3C] hover:bg-[#E74C3C]/30 transition font-medium"
                >
                  削除する
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* メモ削除確認ダイアログ */}
      {deleteMemoConfirmId && (() => {
        const targetMemo = memos.find((m) => m.id === deleteMemoConfirmId);
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="w-[360px] bg-[#1A1D27] rounded-lg border border-white/10 shadow-2xl">
              <div className="px-5 py-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-full bg-[#E74C3C]/15 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-[#E74C3C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-sm text-white font-semibold">メモの削除</h3>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  以下のメモを削除しますか？
                </p>
                {targetMemo && (
                  <div className="mt-2 p-2 rounded bg-[#0F1117] border border-white/5 max-h-20 overflow-y-auto">
                    <p className="text-[10px] text-gray-500 whitespace-pre-wrap break-words">
                      {stripMrkdwn(targetMemo.messageText).slice(0, 200)}
                      {targetMemo.messageText.length > 200 ? '...' : ''}
                    </p>
                  </div>
                )}
                <p className="text-[10px] text-gray-500 mt-1.5">
                  この操作は取り消せません。
                </p>
              </div>
              <div className="px-5 py-3 border-t border-white/5 flex justify-end gap-2">
                <button
                  onClick={() => setDeleteMemoConfirmId(null)}
                  className="px-3 py-1.5 text-[11px] rounded bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-300 transition"
                >
                  キャンセル
                </button>
                <button
                  onClick={() => {
                    deleteMemo(deleteMemoConfirmId);
                    setDeleteMemoConfirmId(null);
                  }}
                  className="px-3 py-1.5 text-[11px] rounded bg-[#E74C3C]/20 text-[#E74C3C] hover:bg-[#E74C3C]/30 transition font-medium"
                >
                  削除する
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ドキュメント削除確認ダイアログ */}
      {deleteDocConfirmId && (() => {
        const targetDoc = documents.find((d) => d.id === deleteDocConfirmId);
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="w-[360px] bg-[#1A1D27] rounded-lg border border-white/10 shadow-2xl">
              <div className="px-5 py-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-full bg-[#E74C3C]/15 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-[#E74C3C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-sm text-white font-semibold">ドキュメントの削除</h3>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  「<span className="text-gray-200 font-medium">{targetDoc?.originalName}</span>」を削除しますか？
                </p>
                <p className="text-[10px] text-gray-500 mt-1.5">
                  この操作は取り消せません。ファイルも完全に削除されます。
                </p>
              </div>
              <div className="px-5 py-3 border-t border-white/5 flex justify-end gap-2">
                <button
                  onClick={() => setDeleteDocConfirmId(null)}
                  className="px-3 py-1.5 text-[11px] rounded bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-300 transition"
                >
                  キャンセル
                </button>
                <button
                  onClick={() => {
                    deleteDoc(deleteDocConfirmId);
                    setDeleteDocConfirmId(null);
                  }}
                  className="px-3 py-1.5 text-[11px] rounded bg-[#E74C3C]/20 text-[#E74C3C] hover:bg-[#E74C3C]/30 transition font-medium"
                >
                  削除する
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* チャネル選択モーダル */}
      {showChannelPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="w-[400px] max-h-[60vh] bg-[#1A1D27] rounded-lg border border-white/10 shadow-2xl flex flex-col">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between shrink-0">
              <span className="text-sm text-gray-300">チャネルを紐付け</span>
              <button
                onClick={() => { setShowChannelPicker(false); setChannelSearchQuery(''); }}
                className="text-gray-500 hover:text-gray-300 transition"
              >
                &#10005;
              </button>
            </div>

            <div className="px-3 py-2 border-b border-white/5 shrink-0">
              <input
                type="text"
                value={channelSearchQuery}
                onChange={(e) => setChannelSearchQuery(e.target.value)}
                placeholder="チャネル名で検索..."
                className="w-full bg-[#0F1117] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[#4A9EFF]"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {availableChannels.length === 0 && (
                <div className="text-xs text-gray-600 text-center py-4">チャネルを読み込み中...</div>
              )}
              {availableChannels
                .filter((ch) => ch.name.toLowerCase().includes(channelSearchQuery.toLowerCase()))
                .map((ch) => {
                  const assigned = allProjectChannels.find((pc) => pc.channelId === ch.id);
                  const isCurrentProject = projectChannels.some((pc) => pc.channelId === ch.id);
                  return (
                    <button
                      key={ch.id}
                      onClick={() => !assigned && addChannel(ch.id, ch.name)}
                      disabled={!!assigned}
                      className={`w-full text-left px-3 py-2 rounded text-xs transition flex items-center justify-between ${
                        assigned
                          ? 'text-gray-600 cursor-not-allowed'
                          : 'text-gray-300 hover:bg-white/5 cursor-pointer'
                      }`}
                    >
                      <span>
                        <span className="text-[#4A9EFF]">#</span> {ch.name}
                        {ch.type === 'dm' && <span className="text-gray-600 ml-1">(DM)</span>}
                        {ch.type === 'group_dm' && <span className="text-gray-600 ml-1">(グループDM)</span>}
                      </span>
                      {isCurrentProject ? (
                        <span className="text-[10px] text-[#2ECC71]">紐付け済み</span>
                      ) : assigned ? (
                        <span className="text-[10px] text-gray-600">
                          他プロジェクト使用中
                        </span>
                      ) : null}
                    </button>
                  );
                })}
            </div>

            <div className="px-4 py-2 border-t border-white/5 shrink-0">
              <button
                onClick={() => { setShowChannelPicker(false); setChannelSearchQuery(''); }}
                className="px-3 py-1.5 text-[10px] rounded bg-white/5 text-gray-400 hover:bg-white/10 transition"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* タスクメッセージ選択モーダル */}
      {showTaskPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="w-[600px] max-h-[80vh] bg-[#1A1D27] rounded-lg border border-white/10 shadow-2xl flex flex-col">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between shrink-0">
              <span className="text-sm text-gray-300">タスクからメッセージを選択</span>
              <button
                onClick={() => setShowTaskPicker(false)}
                className="text-gray-500 hover:text-gray-300 transition"
              >
                &#10005;
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {tasks.length === 0 && (
                <div className="text-xs text-gray-600 text-center py-4">タスクがありません</div>
              )}
              {tasks.map((task) => (
                <div key={task.id} className="rounded border border-white/5 overflow-hidden">
                  <button
                    onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                    className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5 transition flex items-center gap-2"
                  >
                    <span className="text-[#4A9EFF]">#</span>
                    <span>{task.channelName}</span>
                    <span className="text-gray-600 truncate flex-1">
                      {stripMrkdwn(task.triggerMessage.text).slice(0, 50)}
                    </span>
                    <span className="text-[10px] text-gray-600">
                      {expandedTaskId === task.id ? '▲' : '▼'}
                    </span>
                  </button>

                  {expandedTaskId === task.id && (
                    <div className="border-t border-white/5 bg-[#0F1117] max-h-60 overflow-y-auto">
                      {/* トリガーメッセージ */}
                      <MessagePickerItem
                        userName={task.triggerMessage.userName}
                        text={task.triggerMessage.text}
                        ts={task.triggerMessage.ts}
                        saving={savingMemoTs === task.triggerMessage.ts}
                        onAdd={() => addMessageAsMemo(
                          task,
                          task.triggerMessage.text,
                          task.triggerMessage.userName,
                          task.triggerMessage.ts,
                        )}
                      />
                      {/* スレッドメッセージ */}
                      {task.threadMessages.map((msg, i) => (
                        <MessagePickerItem
                          key={msg.ts || i}
                          userName={msg.userName}
                          text={msg.text}
                          ts={msg.ts}
                          saving={savingMemoTs === msg.ts}
                          onAdd={() => addMessageAsMemo(task, msg.text, msg.userName, msg.ts)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="px-4 py-2 border-t border-white/5 shrink-0">
              <button
                onClick={() => setShowTaskPicker(false)}
                className="px-3 py-1.5 text-[10px] rounded bg-white/5 text-gray-400 hover:bg-white/10 transition"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessagePickerItem({
  userName,
  text,
  ts,
  onAdd,
  saving,
}: {
  userName: string;
  text: string;
  ts: string;
  onAdd: () => void;
  saving?: boolean;
}) {
  const [added, setAdded] = useState(false);

  const formatTime = (ts: string) => {
    try {
      const unixTs = parseFloat(ts);
      if (!isNaN(unixTs) && unixTs > 1000000000) {
        return new Date(unixTs * 1000).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      }
      return '';
    } catch {
      return '';
    }
  };

  return (
    <div className="flex items-start gap-2 px-3 py-2 hover:bg-white/5 transition group">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] text-gray-300 font-medium">{userName}</span>
          <span className="text-[9px] text-gray-600">{formatTime(ts)}</span>
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5 break-words whitespace-pre-wrap max-h-40 overflow-y-auto">
          {stripMrkdwn(text)}
        </p>
      </div>
      <button
        onClick={() => {
          onAdd();
          setAdded(true);
        }}
        disabled={added || saving}
        className={`shrink-0 px-2 py-1 text-[9px] rounded transition ${
          added
            ? 'bg-[#2ECC71]/10 text-[#2ECC71]'
            : saving
              ? 'bg-yellow-500/10 text-yellow-400 animate-pulse'
              : 'bg-[#4A9EFF]/20 text-[#4A9EFF] hover:bg-[#4A9EFF]/30 opacity-0 group-hover:opacity-100'
        }`}
      >
        {added ? '追加済' : saving ? '保存中...' : '追加'}
      </button>
    </div>
  );
}
