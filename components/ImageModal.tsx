'use client';

import React, { useEffect, useCallback } from 'react';

interface ImageModalProps {
  src: string;
  alt: string;
  onClose: () => void;
}

const ImageModal = React.memo(function ImageModal({
  src,
  alt,
  onClose,
}: ImageModalProps) {
  // ESC キーで閉じる
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* 閉じるボタン */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-xl transition"
        title="閉じる (ESC)"
      >
        &#10005;
      </button>

      {/* 画像 */}
      <img
        src={src}
        alt={alt}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />

      {/* ファイル名 */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-gray-400 bg-black/50 px-4 py-2 rounded-lg">
        {alt}
      </div>
    </div>
  );
});

export default ImageModal;
