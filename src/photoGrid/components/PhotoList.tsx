import React from 'react';
import { Trash2, Copy, Plus, Minus, FileImage, RotateCw } from 'lucide-react';
import { PhotoItem } from '../types';

interface PhotoListProps {
  photos: PhotoItem[];
  onRemovePhoto: (id: string) => void;
  onUpdateCopies: (id: string, delta: number) => void;
  onSetCopies: (id: string, copies: number) => void;
  onDuplicatePhoto: (id: string) => void;
  onRotatePhoto?: (id: string) => void;
  onRotateAllPhotos?: () => void;
}

export const PhotoList: React.FC<PhotoListProps> = ({
  photos,
  onRemovePhoto,
  onUpdateCopies,
  onSetCopies,
  onDuplicatePhoto,
  onRotatePhoto,
  onRotateAllPhotos,
}) => {
  if (photos.length === 0) {
    return null;
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
          <FileImage className="w-4 h-4 text-neutral-600" />
          <span>Daftar Foto &amp; Dokumen KTP ({photos.length})</span>
        </h3>
        <div className="flex items-center gap-2">
          {onRotateAllPhotos && (
            <button
              type="button"
              onClick={onRotateAllPhotos}
              className="px-2.5 py-1 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer border border-neutral-200"
              title="Putar semua foto 90 derajat searah jarum jam"
            >
              <RotateCw className="w-3.5 h-3.5 text-neutral-600" />
              <span>Putar Manual Semua Foto (90°)</span>
            </button>
          )}
          <span className="text-xs text-neutral-500 hidden sm:inline">
            Atur jumlah salinan cetak &amp; rotasi per foto di bawah
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {photos.map((item, idx) => (
          <div
            key={item.id}
            className="group relative bg-neutral-50 rounded-lg border border-neutral-200 hover:border-neutral-300 transition-all p-2 flex flex-col justify-between"
          >
            {/* Delete button (X) */}
            <button
              onClick={() => onRemovePhoto(item.id)}
              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center opacity-90 hover:opacity-100 hover:scale-105 transition-all shadow-sm z-10 cursor-pointer"
              title="Hapus foto ini"
            >
              <Trash2 className="w-3 h-3" />
            </button>

            {/* Thumbnail with manual Rotate Button */}
            <div className="relative aspect-3/4 rounded-md overflow-hidden bg-neutral-200 mb-2 border border-neutral-200/60 group/thumb">
              <img
                src={item.processedDataUrl || item.dataUrl}
                alt={item.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-white font-mono">
                #{idx + 1}
              </div>

              {/* Quick Rotate Button on Thumbnail */}
              {onRotatePhoto && (
                <button
                  type="button"
                  onClick={() => onRotatePhoto(item.id)}
                  className="absolute bottom-1 right-1 px-1.5 py-1 rounded bg-black/70 hover:bg-amber-600 text-white text-[10px] font-medium flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
                  title="Putar foto 90° searah jarum jam (Manual Rotate)"
                >
                  <RotateCw className="w-3 h-3" />
                  <span>{item.rotation ? `${item.rotation}°` : 'Putar 90°'}</span>
                </button>
              )}
            </div>

            {/* Metadata */}
            <div className="space-y-1 mb-2">
              <p
                className="text-xs font-medium text-neutral-800 truncate"
                title={item.name}
              >
                {item.name}
              </p>
              <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono">
                <span>{item.originalWidth}×{item.originalHeight}</span>
                <span>{formatFileSize(item.size)}</span>
              </div>
            </div>

            {/* Action Bar: Rotate & Copies control */}
            <div className="pt-2 border-t border-neutral-200/80 flex items-center justify-between gap-1">
              {onRotatePhoto && (
                <button
                  type="button"
                  onClick={() => onRotatePhoto(item.id)}
                  className="px-1.5 py-1 text-[11px] text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded font-medium flex items-center gap-1 cursor-pointer"
                  title="Putar foto manual 90 derajat"
                >
                  <RotateCw className="w-3 h-3 text-amber-700" />
                  <span>{item.rotation ? `${item.rotation}°` : '90°'}</span>
                </button>
              )}
              <div className="flex items-center gap-1 bg-white rounded border border-neutral-200 px-1 py-0.5 ml-auto">
                <button
                  type="button"
                  onClick={() => onUpdateCopies(item.id, -1)}
                  disabled={item.copies <= 1}
                  className="w-4 h-4 flex items-center justify-center text-neutral-600 hover:text-neutral-900 disabled:opacity-30 cursor-pointer"
                  title="Kurangi cetakan"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={item.copies}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    onSetCopies(item.id, isNaN(val) ? 1 : Math.max(1, Math.min(99, val)));
                  }}
                  className="w-7 text-center text-xs font-semibold text-neutral-800 font-mono bg-transparent border-none p-0 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => onUpdateCopies(item.id, 1)}
                  className="w-4 h-4 flex items-center justify-center text-neutral-600 hover:text-neutral-900 cursor-pointer"
                  title="Tambah cetakan"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
