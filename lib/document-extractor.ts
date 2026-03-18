/**
 * ドキュメントからテキストを抽出するユーティリティ
 *
 * 対応形式:
 *   - PDF (.pdf) → pdf-parse
 *   - Office (.docx, .xlsx, .pptx) → officeparser
 *   - テキスト (.md, .txt, .csv, .json) → 直接読み取り
 */

import fs from 'fs';
import path from 'path';

const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.csv', '.json', '.tsv', '.log', '.xml', '.html', '.htm']);

/**
 * ファイルパスからテキストを抽出する
 */
export async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  // テキストファイル: 直接読み取り
  if (TEXT_EXTENSIONS.has(ext)) {
    return fs.readFileSync(filePath, 'utf-8');
  }

  // PDF
  if (ext === '.pdf') {
    return extractPdfText(filePath);
  }

  // Office 形式 (docx, xlsx, pptx, odt, odp, ods)
  if (['.docx', '.xlsx', '.pptx', '.odt', '.odp', '.ods'].includes(ext)) {
    return extractOfficeText(filePath);
  }

  return `[テキスト抽出非対応: ${ext}]`;
}

async function extractPdfText(filePath: string): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string }>;
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text || '';
  } catch (err) {
    console.error('[DocumentExtractor] PDF extraction failed:', err);
    return '[PDF テキスト抽出エラー]';
  }
}

async function extractOfficeText(filePath: string): Promise<string> {
  try {
    const officeparser = await import('officeparser');
    // parseOffice はコールバック or Promise 対応
    const result = await officeparser.parseOffice(filePath, { outputAs: 'text' } as never);
    return String(result || '');
  } catch (err) {
    console.error('[DocumentExtractor] Office extraction failed:', err);
    return '[Office テキスト抽出エラー]';
  }
}

/**
 * MIME type からファイル種別を表すアイコン文字を返す
 */
export function getFileTypeIcon(mimeType: string): string {
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.includes('word') || mimeType.includes('.document')) return '📝';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📑';
  if (mimeType.startsWith('text/')) return '📃';
  return '📎';
}

/**
 * ファイルサイズを読みやすい形式に変換
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
