import { NextRequest, NextResponse } from 'next/server';
import { getDocumentsByProject, updateDocument } from '@/lib/db';
import { extractText } from '@/lib/document-extractor';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'projects');

/** POST: プロジェクト内ドキュメントのテキストを一括再抽出 */
export async function POST(req: NextRequest) {
  try {
    const { projectId } = await req.json();
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const docs = getDocumentsByProject(projectId);
    const results: { id: string; originalName: string; status: string; textLength?: number }[] = [];

    for (const doc of docs) {
      const filePath = path.join(UPLOAD_DIR, doc.projectId, doc.fileName);

      if (!fs.existsSync(filePath)) {
        results.push({ id: doc.id, originalName: doc.originalName, status: 'file_missing' });
        continue;
      }

      try {
        let extractedText = await extractText(filePath);
        // 50KB 上限
        if (extractedText && extractedText.length > 50000) {
          extractedText = extractedText.slice(0, 50000) + '\n\n[... テキストが長すぎるため切り詰めました]';
        }

        updateDocument(doc.id, { extractedText });
        results.push({
          id: doc.id,
          originalName: doc.originalName,
          status: 'success',
          textLength: extractedText.length,
        });
      } catch (err) {
        console.error(`[Reextract] Failed for ${doc.originalName}:`, err);
        results.push({ id: doc.id, originalName: doc.originalName, status: 'error' });
      }
    }

    return NextResponse.json({
      total: docs.length,
      results,
    });
  } catch (error) {
    console.error('Reextract failed:', error);
    return NextResponse.json({ error: 'Reextract failed' }, { status: 500 });
  }
}
