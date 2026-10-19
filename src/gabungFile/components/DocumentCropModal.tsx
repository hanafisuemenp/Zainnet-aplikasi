/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * DocumentCropModal
 * Interactive Auto-Crop & Deskew editor for student attachment photos.
 * Removes table/desk background and corrects skewed camera angles.
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Check, 
  Crop, 
  RotateCw, 
  Compass, 
  Sparkles, 
  Undo2, 
  Sliders, 
  Maximize2,
  Scan,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { ScanFile } from '../types/skripsi';
import { 
  detectDocumentBounds, 
  cropAndDeskewImage, 
  loadImage, 
  DocumentBounds,
  CropResult
} from '../utils/documentCropper';

interface DocumentCropModalProps {
  scan: ScanFile;
  onClose: () => void;
  onApplyCrop: (scanId: string, result: CropResult) => void;
  onRevertOriginal?: (scanId: string) => void;
}

export const DocumentCropModal: React.FC<DocumentCropModalProps> = ({
  scan,
  onClose,
  onApplyCrop,
  onRevertOriginal,
}) => {
  // Use original uncropped photo as base if available, or current dataUrl
  const baseImageSource = scan.originalDataUrl || scan.dataUrl;

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ width: scan.width, height: scan.height });

  // Margins in percentage (0 to 45%) from outer edges
  const [marginTop, setMarginTop] = useState(0);
  const [marginBottom, setMarginBottom] = useState(0);
  const [marginLeft, setMarginLeft] = useState(0);
  const [marginRight, setMarginRight] = useState(0);

  // Rotation skew angle in degrees (-25 to +25)
  const [angle, setAngle] = useState(scan.deskewAngle || 0);

  // Filter option
  const [enhanceContrast, setEnhanceContrast] = useState(!!scan.enhancedContrast);

  // Detected info
  const [detectedBounds, setDetectedBounds] = useState<DocumentBounds | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
  const [previewDimensions, setPreviewDimensions] = useState({ width: scan.width, height: scan.height });

  // 1. Initial Load and Auto-Detection
  useEffect(() => {
    let isMounted = true;
    const runInitialDetection = async () => {
      try {
        setIsLoading(true);
        const img = await loadImage(baseImageSource);
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!isMounted) return;
        setNaturalSize({ width: w, height: h });

        const detection = await detectDocumentBounds(img);
        if (!isMounted) return;
        setDetectedBounds(detection);

        if (scan.isCropped && scan.cropBounds) {
          // Restore already applied crop
          const b = scan.cropBounds;
          setMarginLeft(Math.max(0, Math.min(45, (b.x / w) * 100)));
          setMarginTop(Math.max(0, Math.min(45, (b.y / h) * 100)));
          setMarginRight(Math.max(0, Math.min(45, ((w - (b.x + b.width)) / w) * 100)));
          setMarginBottom(Math.max(0, Math.min(45, ((h - (b.y + b.height)) / h) * 100)));
          setAngle(scan.deskewAngle || 0);
        } else if (detection.hasTable || Math.abs(detection.angle) >= 0.8) {
          // Apply detected table boundaries and angle
          setMarginLeft(Math.max(0, Math.min(45, (detection.x / w) * 100)));
          setMarginTop(Math.max(0, Math.min(45, (detection.y / h) * 100)));
          setMarginRight(Math.max(0, Math.min(45, ((w - (detection.x + detection.width)) / w) * 100)));
          setMarginBottom(Math.max(0, Math.min(45, ((h - (detection.y + detection.height)) / h) * 100)));
          setAngle(detection.angle);
        }
      } catch (err) {
        console.error('Error running document crop detection:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    runInitialDetection();
    return () => {
      isMounted = false;
    };
  }, [baseImageSource]);

  // 2. Generate Real-time Preview whenever margins, angle or filter changes
  useEffect(() => {
    let isCancelled = false;
    const updatePreview = async () => {
      if (isLoading || naturalSize.width === 0) return;
      try {
        const w = naturalSize.width;
        const h = naturalSize.height;

        const x = Math.round((marginLeft / 100) * w);
        const y = Math.round((marginTop / 100) * h);
        const cropW = Math.max(50, Math.round(w - x - (marginRight / 100) * w));
        const cropH = Math.max(50, Math.round(h - y - (marginBottom / 100) * h));

        const res = await cropAndDeskewImage(baseImageSource, {
          bounds: { x, y, width: cropW, height: cropH },
          angle,
          enhanceContrast,
          fileName: scan.name,
        });

        if (!isCancelled) {
          setPreviewDataUrl(res.dataUrl);
          setPreviewDimensions({ width: res.width, height: res.height });
        }
      } catch (err) {
        console.warn('Preview generation error:', err);
      }
    };

    const timeout = setTimeout(updatePreview, 60);
    return () => {
      isCancelled = true;
      clearTimeout(timeout);
    };
  }, [marginLeft, marginTop, marginRight, marginBottom, angle, enhanceContrast, isLoading, naturalSize, baseImageSource, scan.name]);

  // Auto-Detect Table Button handler
  const handleAutoDetect = () => {
    if (!detectedBounds) return;
    const w = naturalSize.width;
    const h = naturalSize.height;
    setMarginLeft(Math.max(0, Math.min(45, (detectedBounds.x / w) * 100)));
    setMarginTop(Math.max(0, Math.min(45, (detectedBounds.y / h) * 100)));
    setMarginRight(Math.max(0, Math.min(45, ((w - (detectedBounds.x + detectedBounds.width)) / w) * 100)));
    setMarginBottom(Math.max(0, Math.min(45, ((h - (detectedBounds.y + detectedBounds.height)) / h) * 100)));
    setAngle(detectedBounds.angle);
  };

  // Reset to full uncropped original
  const handleReset = () => {
    setMarginTop(0);
    setMarginBottom(0);
    setMarginLeft(0);
    setMarginRight(0);
    setAngle(0);
    setEnhanceContrast(false);
  };

  // Apply and save
  const handleSaveAndApply = async () => {
    try {
      setIsProcessing(true);
      const w = naturalSize.width;
      const h = naturalSize.height;

      const x = Math.round((marginLeft / 100) * w);
      const y = Math.round((marginTop / 100) * h);
      const cropW = Math.max(50, Math.round(w - x - (marginRight / 100) * w));
      const cropH = Math.max(50, Math.round(h - y - (marginBottom / 100) * h));

      const res = await cropAndDeskewImage(baseImageSource, {
        bounds: { x, y, width: cropW, height: cropH },
        angle,
        enhanceContrast,
        fileName: scan.name,
      });

      onApplyCrop(scan.id, res);
      onClose();
    } catch (err: any) {
      alert('Gagal menerapkan hasil crop: ' + (err?.message || err));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden shadow-2xl text-slate-100">
        
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/30 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Crop className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Auto-Crop & Koreksi Kemiringan Dokumen</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold font-mono">
                  Presisi Dokumen
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 truncate max-w-md">
                {scan.name} • {naturalSize.width} × {naturalSize.height} px
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
          
          {/* Left Column: Visual Preview (Cropped Result) */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 min-h-[360px] relative">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center text-slate-400 py-12">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2" />
                <p className="text-xs font-medium">Mendeteksi kertas dokumen & batas meja...</p>
              </div>
            ) : previewDataUrl ? (
              <div className="relative max-h-[500px] flex items-center justify-center overflow-hidden rounded-lg shadow-md border border-slate-700/50 bg-white/5">
                <img
                  src={previewDataUrl}
                  alt="Pratinjau Hasil Crop"
                  className="max-h-[480px] max-w-full object-contain shadow-sm"
                />
                
                {/* Overlay Badge */}
                <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-md bg-black/75 backdrop-blur-sm text-[10px] text-emerald-300 font-mono flex items-center gap-1.5 border border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>{previewDimensions.width} × {previewDimensions.height} px</span>
                  {Math.abs(angle) > 0.1 && (
                    <span className="text-sky-300">• Lurus {angle > 0 ? `+${angle}` : angle}°</span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Gagal memuat pratinjau</p>
            )}
          </div>

          {/* Right Column: Adjustment Controls */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
            
            <div className="space-y-4">
              {/* Quick AI Presets Banner */}
              {detectedBounds && (
                <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-xs text-indigo-200">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold flex items-center gap-1.5 text-indigo-300">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      Deteksi Otomatis Sistem
                    </span>
                    <button
                      type="button"
                      onClick={handleAutoDetect}
                      className="px-2 py-0.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold transition cursor-pointer shadow-xs"
                    >
                      Terapkan AI
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    {detectedBounds.hasTable
                      ? `Latar meja terdeteksi di sekeliling kertas. Kemiringan kamera: ${detectedBounds.angle > 0 ? `+${detectedBounds.angle}` : detectedBounds.angle}°.`
                      : 'Kertas dokumen memenuhi sebagian besar foto dengan sudut yang cukup rapi.'}
                  </p>
                </div>
              )}

              {/* 1. Kemiringan / Angle Deskew Slider */}
              <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-bold text-slate-200 flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-sky-400" />
                    Kemiringan Dokumen (Deskew)
                  </label>
                  <span className="font-mono text-sky-400 font-bold bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800/40 text-[11px]">
                    {angle > 0 ? `+${angle}` : angle}°
                  </span>
                </div>
                <input
                  type="range"
                  min="-20"
                  max="20"
                  step="0.5"
                  value={angle}
                  onChange={(e) => setAngle(parseFloat(e.target.value) || 0)}
                  className="w-full accent-sky-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
                />
                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setAngle((prev) => Math.max(-20, Math.round((prev - 0.5) * 10) / 10))}
                    className="hover:text-white transition cursor-pointer"
                  >
                    -0.5°
                  </button>
                  <button
                    type="button"
                    onClick={() => setAngle(0)}
                    className="text-slate-400 hover:text-sky-300 font-semibold cursor-pointer"
                  >
                    Tegak Lurus (0°)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAngle((prev) => Math.min(20, Math.round((prev + 0.5) * 10) / 10))}
                    className="hover:text-white transition cursor-pointer"
                  >
                    +0.5°
                  </button>
                </div>
              </div>

              {/* 2. Potong Tepi Meja (Crop Sliders: Atas, Bawah, Kiri, Kanan) */}
              <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-bold text-slate-200 flex items-center gap-1.5">
                    <Crop className="w-3.5 h-3.5 text-emerald-400" />
                    Potong Tepi Meja / Background
                  </label>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="text-[10px] text-slate-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer transition"
                  >
                    <Undo2 className="w-3 h-3" />
                    Reset
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                      <span>Tepi Atas</span>
                      <span className="font-mono text-emerald-400">{marginTop}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="40"
                      value={marginTop}
                      onChange={(e) => setMarginTop(parseInt(e.target.value) || 0)}
                      className="w-full accent-emerald-500 cursor-pointer h-1 bg-slate-700 rounded-lg"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                      <span>Tepi Bawah</span>
                      <span className="font-mono text-emerald-400">{marginBottom}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="40"
                      value={marginBottom}
                      onChange={(e) => setMarginBottom(parseInt(e.target.value) || 0)}
                      className="w-full accent-emerald-500 cursor-pointer h-1 bg-slate-700 rounded-lg"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                      <span>Tepi Kiri</span>
                      <span className="font-mono text-emerald-400">{marginLeft}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="40"
                      value={marginLeft}
                      onChange={(e) => setMarginLeft(parseInt(e.target.value) || 0)}
                      className="w-full accent-emerald-500 cursor-pointer h-1 bg-slate-700 rounded-lg"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                      <span>Tepi Kanan</span>
                      <span className="font-mono text-emerald-400">{marginRight}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="40"
                      value={marginRight}
                      onChange={(e) => setMarginRight(parseInt(e.target.value) || 0)}
                      className="w-full accent-emerald-500 cursor-pointer h-1 bg-slate-700 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Document Filter: Perjelas Kontras Kertas */}
              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 cursor-pointer hover:bg-slate-800/70 transition">
                <input
                  type="checkbox"
                  checked={enhanceContrast}
                  onChange={(e) => setEnhanceContrast(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                <div className="text-xs">
                  <span className="font-semibold text-slate-200 block">
                    Tingkatkan Kontras Kertas (Scanner Filter)
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Memutihkan latar kertas & memperjelas tulisan/tanda tangan seperti scanner fisik
                  </span>
                </div>
              </label>
            </div>

            {/* Bottom Modal Actions */}
            <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2.5">
              {scan.isCropped && onRevertOriginal ? (
                <button
                  type="button"
                  onClick={() => {
                    onRevertOriginal(scan.id);
                    onClose();
                  }}
                  className="w-full sm:w-auto px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-950/50 hover:text-rose-300 text-slate-400 text-xs font-semibold transition cursor-pointer border border-slate-700"
                >
                  Kembalikan ke Foto Asli
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleSaveAndApply}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition shadow-lg shadow-emerald-600/30 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Terapkan Crop & Pelurusan</span>
                </button>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
