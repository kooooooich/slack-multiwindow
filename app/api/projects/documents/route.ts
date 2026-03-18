import { NextRequest, NextResponse } from 'next/server';
import { getDocumentsByProject, createDocument, updateDocument, deleteDocument, getDocument } from '@/lib/db';
import { extractText } from '@/lib/document-extractor';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'projects');

// 最大 20MB
const MAX_FILE_SIZE = 20 * 1024 * 1024;

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** GET: プロジェクトのドキュメント一覧 */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }
  const docs = getDocumentsByProject(projectId);
  // extractedText はリスト取得時には返さない（サイズ削減）
  const result = docs.map(({ extractedText: _, ...rest }) => rest);
  return NextResponse.json(result);
}

/** POST: ドキュメントアップロード */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const projectId = formData.get('projectId') as string | null;
    const description = (formData.get('description') as string) || '';

    if (!file || !projectId) {
      return NextResponse.json({ error: 'file and projectId are required' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'ファイルサイズは20MB以下にしてください' }, { status: 400 });
    }

    // ファイル保存
    const ext = path.extname(file.name);
    const storedName = `${uuidv4()}${ext}`;
    const projectDir = path.join(UPLOAD_DIR, projectId);
    ensureDir(projectDir);

    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = path.join(projectDir, storedName);
    fs.writeFileSync(filePath, buffer);

    // テキスト抽出
    let extractedText: string | undefined;
    try {
      extractedText = await extractText(filePath);
      // 抽出テキストが大きすぎる場合は切り詰め（AI分析用に 50KB まで）
      if (extractedText && extractedText.length > 50000) {
        extractedText = extractedText.slice(0, 50000) + '\n\n[... テキストが長すぎるため切り詰めました]';
      }
    } catch {
      // 抽出失敗は致命的でない
      extractedText = undefined;
    }

    const doc = createDocument({
      projectId,
      fileName: storedName,
      originalName: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      description,
      extractedText,
    });

    // レスポンスから extractedText を除外
    const { extractedText: _, ...result } = doc;
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Document upload failed:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

/** PATCH: ドキュメントの概要を更新 */
export async function PATCH(req: NextRequest) {
  try {
    const { id, description } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    const doc = updateDocument(id, { description });
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    const { extractedText: _, ...result } = doc;
    return NextResponse.json(result);
  } catch (error) {
    console.error('Document update failed:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}

/** DELETE: ドキュメント削除（ファイルも削除） */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  // ファイル削除
  const doc = getDocument(id);
  if (doc) {
    const filePath = path.join(UPLOAD_DIR, doc.projectId, doc.fileName);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch { /* ignore */ }
  }

  const deleted = deleteDocument(id);
  if (!deleted) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
