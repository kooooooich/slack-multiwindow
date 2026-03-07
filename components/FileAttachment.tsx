'use client';

import React, { useState } from 'react';
import type { SlackFile } from '@/types';
import ImageModal from './ImageModal';

interface FileAttachmentProps {
  files: SlackFile[];
  workspaceId: string;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function isImageMimetype(mimetype: string): boolean {
  return mimetype.startsWith('image/');
}

function getProxyUrl(fileUrl: string, workspaceId: string): string {
  return `/api/slack/files?workspaceId=${encodeURIComponent(workspaceId)}&fileUrl=${encodeURIComponent(fileUrl)}`;
}

const FileAttachment = React.memo(function FileAttachment({
  files,
  workspaceId,
}: FileAttachmentProps) {
  const [modalImage, setModalImage] = useState<{ url: string; name: string } | null>(null);

  return (
    <>
      <div className="flex flex-wrap gap-2 mt-1.5">
        {files.map((file) => {
          if (isImageMimetype(file.mimetype)) {
            // 画像ファイル: サムネイル表示
            const thumbSrc = getProxyUrl(file.thumbUrl || file.urlPrivate, workspaceId);
            const fullSrc = getProxyUrl(file.urlPrivate, workspaceId);

            return (
              <button
                key={file.id}
                onClick={() => setModalImage({ url: fullSrc, name: file.name })}
                className="rounded overflow-hidden border border-white/10 hover:border-[#4A9EFF]/50 transition max-w-[200px] cursor-pointer"
                title={`${file.name} (${formatFileSize(file.size)})`}
              >
                <img
                  src={thumbSrc}
                  alt={file.name}
                  className="max-h-[150px] object-contain bg-[#0D1117]"
                  loading="lazy"
                />
              </button>
            );
          }

          // 非画像ファイル: ファイルカード表示
          return (
            <a
              key={file.id}
              href={getProxyUrl(file.urlPrivate, workspaceId)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-white/10 bg-white/5 hover:bg-white/10 transition max-w-[250px]"
              title={`${file.name} (${formatFileSize(file.size)})`}
            >
              {/* ファイルアイコン */}
              <svg
                className="w-5 h-5 text-gray-500 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
              <div className="min-w-0">
                <div className="text-[11px] text-gray-300 truncate">{file.name}</div>
                <div className="text-[10px] text-gray-600">{formatFileSize(file.size)}</div>
              </div>
            </a>
          );
        })}
      </div>

      {/* 画像拡大モーダル */}
      {modalImage && (
        <ImageModal
          src={modalImage.url}
          alt={modalImage.name}
          onClose={() => setModalImage(null)}
        />
      )}
    </>
  );
});

export default FileAttachment;
