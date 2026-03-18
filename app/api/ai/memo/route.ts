import { NextRequest, NextResponse } from 'next/server';
import { getMemosByProject, getProject, getDocumentsByProject } from '@/lib/db';
import { analyzeMemos } from '@/lib/anthropic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, action, question } = body;

    if (!projectId || !action) {
      return NextResponse.json({ error: 'projectId, action required' }, { status: 400 });
    }

    const project = getProject(projectId);
    const readme = project?.readme?.trim() || '';

    const memos = getMemosByProject(projectId);
    const documents = getDocumentsByProject(projectId);
    const hasContent = memos.length > 0 || !!readme || documents.length > 0;

    if (!hasContent) {
      return NextResponse.json({ error: 'No memos, readme, or documents found' }, { status: 400 });
    }

    // コンテキストを構築（README + メモ + ドキュメント）
    let fullContext = '';

    if (readme) {
      fullContext += `## プロジェクト概要 (README)\n${readme}\n\n`;
    }

    if (memos.length > 0) {
      const memosContext = memos.map((m, i) => {
        const header = m.messageUser ? `[${m.messageUser}]` : `[メモ ${i + 1}]`;
        const note = m.note ? `\n  注記: ${m.note}` : '';
        return `${header}: ${m.messageText}${note}`;
      }).join('\n\n');
      fullContext += `## メモ一覧\n${memosContext}\n\n`;
    }

    // ドキュメントの抽出テキストをコンテキストに追加
    const docsWithText = documents.filter((d) => d.extractedText);
    if (docsWithText.length > 0) {
      const docsContext = docsWithText.map((d) => {
        const desc = d.description ? ` (${d.description})` : '';
        return `### ${d.originalName}${desc}\n${d.extractedText}`;
      }).join('\n\n');
      fullContext += `## 添付ドキュメント\n${docsContext}`;
    }

    const result = await analyzeMemos(fullContext, action, question);
    return NextResponse.json({ result });
  } catch (error) {
    console.error('[AI Memo] Error:', error);
    return NextResponse.json({ error: 'AI analysis failed' }, { status: 500 });
  }
}
