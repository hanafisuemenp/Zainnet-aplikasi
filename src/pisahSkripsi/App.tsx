import React, { useState, useRef } from 'react';
import { FileUpload } from './components/FileUpload';
import { MetadataEditor } from './components/MetadataEditor';
import { SectionSplitterView } from './components/SectionSplitterView';
import { ThumbnailGrid } from './components/ThumbnailGrid';
import { ManualRangeModal } from './components/ManualRangeModal';
import { PdfPreviewModal } from './components/PdfPreviewModal';
import { BatchSplitterView } from './components/BatchSplitterView';

import {
  AnalysisProgress,
  PageTextInfo,
  SectionRange,
  ThesisMetadata,
} from './types';
import { extractPdfText, forceHighPrecisionOcr } from './lib/pdfExtractor';
import { extractDocxText } from './lib/docxExtractor';
import { convertImagesToPdfBuffer } from './lib/imageToPdf';
import {
  detectMetadataFromText,
  detectSectionsFromText,
} from './lib/heuristicsDetector';
import { getProdiCode } from './lib/prodiMapping';
import { createSampleThesisPdf } from './lib/sampleThesisGenerator';
import * as pdfjsLib from 'pdfjs-dist';

export default function App({ onExportComplete }: { onExportComplete?: (fileName: string) => void }) {
  const [darkMode, setDarkMode] = useState(false);
  const [sessionFinished, setSessionFinished] = useState(false);
  const sessionFinishedRef = useRef(false);
  const handleExportComplete = (fileName: string) => {
    if (sessionFinishedRef.current) return;
    sessionFinishedRef.current = true;
    setSessionFinished(true);
    onExportComplete?.(fileName);
  };
  // Aplikasi embedded: admin, pembayaran dan izin dikelola website utama.
  const isAdminLoggedIn = false;

  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pagesText, setPagesText] = useState<PageTextInfo[]>([]);

  // Batch Multi-File state
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [isReScanningOcr, setIsReScanningOcr] = useState<boolean>(false);

  const [metadata, setMetadata] = useState<ThesisMetadata>({
    nama: 'M. RIFQI',
    nim: '22382071037',
    prodi: 'Hukum Keluarga Islam',
    prodiCode: 'HKI',
    judul: 'IMPLEMENTASI HUKUM KELUARGA ISLAM DALAM HAK ASUH ANAK PASCA PERCERAIAN',
    email: 'm.rifqi@example.com',
  });

  const [sections, setSections] = useState<SectionRange[]>([]);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);

  // Modals state
  const [previewModal, setPreviewModal] = useState<{ url: string | null; title: string }>({
    url: null,
    title: '',
  });
  const [manualSectionModal, setManualSectionModal] = useState<SectionRange | null>(null);

  // Process loaded PDF or Word ArrayBuffer
  const processPdfBuffer = async (buffer: ArrayBuffer, name: string, size: number) => {
    const safeBuffer = buffer.slice(0);
    const isWord = name.toLowerCase().endsWith('.docx') || name.toLowerCase().endsWith('.doc');

    setPdfBuffer(safeBuffer);
    setFileName(name);
    setFileSize(size);

    setProgress({
      step: 'reading',
      message: isWord ? 'Membaca dokumen Word (.docx)...' : 'Membaca dokumen PDF...',
      percentage: 10,
    });

    try {
      let pages: PageTextInfo[] = [];
      let loadedDoc: pdfjsLib.PDFDocumentProxy | null = null;

      // Step 1: Extract Text Page by Page
      setProgress({
        step: 'extracting_text',
        message: isWord
          ? 'Mengekstrak naskah dari file Word...'
          : 'Mengekstrak teks halaman & mendeteksi OCR jika diperlukan...',
        percentage: 30,
      });

      if (isWord) {
        const docxResult = await extractDocxText(safeBuffer, (curr, tot) => {
          setProgress({
            step: 'extracting_text',
            message: `Memproses struktur naskah Word (${curr} bagian)...`,
            percentage: 50,
          });
        });
        pages = docxResult.pages;
        loadedDoc = null;
      } else {
        const pdfResult = await extractPdfText(safeBuffer, (curr, tot) => {
          const pct = 30 + Math.floor((curr / tot) * 30);
          setProgress({
            step: 'extracting_text',
            message: `Membaca halaman ${curr} dari ${tot}...`,
            percentage: pct,
          });
        });
        pages = pdfResult.pages;
        loadedDoc = pdfResult.pdfDoc;
      }

      setPdfDoc(loadedDoc);
      setPagesText(pages);

      // Step 2: Instant Client-side Heuristic Detection
      setProgress({
        step: 'ai_analysis',
        message: 'Menganalisis struktur skripsi dan metadata cover...',
        percentage: 70,
      });

      const detectedMeta = detectMetadataFromText(pages, name);
      setMetadata(detectedMeta);

      const detectedSections = detectSectionsFromText(pages, detectedMeta);
      setSections(detectedSections);

      // Step 3: Server Gemini Refinement (if online)
      if (import.meta.env.VITE_SPLIT3_AI_ENDPOINT) try {
        const aiRes = await fetch(import.meta.env.VITE_SPLIT3_AI_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pages: pages.map(p => ({ pageNumber: p.pageNumber, text: p.text })),
            totalPages: pages.length,
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          if (aiData.metadata) {
            const updatedJudul = aiData.metadata.judul || detectedMeta.judul;
            const updatedNama = aiData.metadata.nama || detectedMeta.nama;
            const updatedProdi = aiData.metadata.prodi || detectedMeta.prodi;
            const updatedEmail = aiData.metadata.email || detectedMeta.email;

            setMetadata(prev => ({
              ...prev,
              nama: updatedNama,
              nim: aiData.metadata.nim || prev.nim,
              prodi: updatedProdi,
              judul: updatedJudul,
              email: updatedEmail,
            }));
          }
          if (aiData.sections && Array.isArray(aiData.sections)) {
            setSections(prev => {
              return prev.map(sec => {
                const aiSec = aiData.sections.find((s: any) => s.key === sec.key);
                if (aiSec && aiSec.startPage > 0 && aiSec.endPage >= aiSec.startPage) {
                  return {
                    ...sec,
                    startPage: aiSec.startPage,
                    endPage: aiSec.endPage,
                    pageCount: aiSec.endPage - aiSec.startPage + 1,
                    detected: true,
                    notes: `Terdeteksi: Halaman ${aiSec.startPage}–${aiSec.endPage}`,
                  };
                }
                return sec;
              });
            });
          }
        }
      } catch (aiErr) {
        console.warn('AI analysis endpoint skipped, using heuristic detection:', aiErr);
      }

      setProgress({
        step: 'done',
        message: 'Analisis selesai!',
        percentage: 100,
      });
    } catch (err: any) {
      console.error('Error processing PDF:', err);
      setProgress({
        step: 'error',
        message: 'Gagal memproses file PDF.',
        percentage: 0,
      });
    }
  };

  const handleFileSelect = async (file: File) => {
    if (sessionFinishedRef.current) return;
    setBatchFiles([]);
    const ext = file.name.toLowerCase();
    const isImage =
      ext.endsWith('.jpg') ||
      ext.endsWith('.jpeg') ||
      ext.endsWith('.png') ||
      ext.endsWith('.webp') ||
      ext.endsWith('.bmp') ||
      file.type.startsWith('image/');

    if (isImage) {
      setProgress({
        step: 'reading',
        message: 'Mengonversi gambar naskah (JPG/PNG) ke format PDF...',
        percentage: 15,
      });
      const convertedBuffer = await convertImagesToPdfBuffer([file]);
      processPdfBuffer(convertedBuffer, `${file.name.replace(/\.[^/.]+$/, '')}.pdf`, file.size);
    } else {
      const arrayBuffer = await file.arrayBuffer();
      processPdfBuffer(arrayBuffer, file.name, file.size);
    }
  };

  const handleBatchSelect = (files: File[]) => {
    if (sessionFinishedRef.current) return;
    handleReset();
    setBatchFiles(files);
  };

  const handleReScanOcr = async () => {
    if (!pdfBuffer) return;
    setIsReScanningOcr(true);
    try {
      setProgress({
        step: 'ocr',
        message: 'Menjalankan High-Precision Tesseract OCR (Scale 2.0)...',
        percentage: 20,
      });

      const ocrPages = await forceHighPrecisionOcr(pdfBuffer, (curr, tot) => {
        const pct = 20 + Math.floor((curr / tot) * 70);
        setProgress({
          step: 'ocr',
          message: `Melakukan OCR Tesseract halaman ${curr} dari ${tot}...`,
          percentage: pct,
        });
      });

      setPagesText(ocrPages);

      // Re-detect metadata & sections
      const detectedMeta = detectMetadataFromText(ocrPages, fileName || '');
      setMetadata(detectedMeta);

      const detectedSections = detectSectionsFromText(ocrPages, detectedMeta);
      setSections(detectedSections);

      setProgress({
        step: 'done',
        message: 'Re-Scan OCR selesai! Struktur bab diperbarui.',
        percentage: 100,
      });
      alert('Re-Scan OCR Presisi Tinggi selesai! Struktur bab telah diperbarui secara akurat.');
    } catch (err) {
      console.error('Error during forced OCR:', err);
      alert('Gagal melakukan Re-Scan OCR.');
    } finally {
      setIsReScanningOcr(false);
    }
  };

  const handleSampleSelect = async () => {
    if (sessionFinishedRef.current) return;
    setBatchFiles([]);
    const sampleBuffer = await createSampleThesisPdf();
    processPdfBuffer(sampleBuffer, 'Skripsi_Lengkap_M_RIFQI_HKI.pdf', sampleBuffer.byteLength);
  };

  const handleReset = () => {
    setPdfBuffer(null);
    setFileName(null);
    setFileSize(null);
    setPdfDoc(null);
    setPagesText([]);
    setSections([]);
    setBatchFiles([]);
    setProgress(null);
  };

  const handleUpdateSectionRange = (key: string, startPage: number, endPage: number) => {
    setSections(prev =>
      prev.map(sec => {
        if (sec.key === key) {
          const pageCount = endPage >= startPage ? endPage - startPage + 1 : 0;
          return {
            ...sec,
            startPage,
            endPage,
            pageCount,
            detected: startPage > 0 && endPage >= startPage,
            notes: `Manual: Halaman ${startPage}–${endPage}`,
          };
        }
        return sec;
      })
    );
  };

  return (
    <div className={`${darkMode ? 'dark' : ''} min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200 font-sans pb-16`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white p-4 dark:bg-slate-900 dark:border-slate-800">
        <div>
          <h2 className="font-extrabold text-base">ZAIN.NET — Pemisah File Skripsi (Link 3)</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Pemisahan 15 bagian, PDF/DOCX, OCR, dan batch ZIP. Kuota mengikuti akun ZAIN.NET.</p>
        </div>
        <button type="button" onClick={() => setDarkMode(x => !x)} className="rounded-xl px-3 py-2 bg-slate-200 dark:bg-slate-700 text-xs font-bold">{darkMode ? 'Mode terang' : 'Mode gelap'}</button>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        <>
            {/* Upload Zone */}
            {sessionFinished ? (
              <div className="rounded-xl border border-emerald-400 bg-emerald-50 p-4 text-emerald-900">
                <strong>Pemisahan selesai.</strong> Hasil masih dapat diunduh dari bawah. Untuk memulai dokumen baru, tutup modul dan buka Link 3 lagi menggunakan kuota berikutnya.
              </div>
            ) : <FileUpload
              onFileSelect={handleFileSelect}
              onBatchSelect={handleBatchSelect}
              onSampleSelect={handleSampleSelect}
              fileName={fileName}
              fileSize={fileSize}
              progress={progress}
              onReset={handleReset}
              batchCount={batchFiles.length}
            />}

            {/* Batch Multi-File Mode */}
            {batchFiles.length > 0 && (
              <BatchSplitterView
                onExportComplete={handleExportComplete}
                files={batchFiles}
                onResetBatch={handleReset}
                onSelectSingleFile={(file, buffer, pgText, meta, secs) => {
                  setPdfBuffer(buffer);
                  setFileName(file.name);
                  setFileSize(file.size);
                  setPagesText(pgText);
                  setMetadata(meta);
                  setSections(secs);
                  setBatchFiles([]);
                }}
              />
            )}

            {pdfBuffer && (
              <>
                {/* Metadata Editor */}
                <MetadataEditor
                  metadata={metadata}
                  onChange={(updated) => {
                    setMetadata(updated);
                    // regenerate section filenames
                    setSections(prev =>
                      prev.map(sec => {
                        const suffix = sec.key;
                        const filename = `${updated.nama}_${updated.nim}_${suffix}_${updated.prodiCode}.pdf`.replace(/\s+/g, '_');
                        return { ...sec, filename };
                      })
                    );
                  }}
                />

                {/* Section Splitter View */}
                <SectionSplitterView
                  onExportComplete={handleExportComplete}
                  sections={sections}
                  metadata={metadata}
                  pdfBuffer={pdfBuffer}
                  pagesText={pagesText}
                  onUpdateSectionRange={handleUpdateSectionRange}
                  onOpenPreview={(url, title) => setPreviewModal({ url, title })}
                  onOpenManualModal={(sec) => setManualSectionModal(sec)}
                  onReScanOcr={handleReScanOcr}
                  isReScanningOcr={isReScanningOcr}
                  isAdminLoggedIn={isAdminLoggedIn}
                />

                {/* Thumbnail Grid & Keyword Search */}
                <ThumbnailGrid
                  pdfDoc={pdfDoc}
                  pagesText={pagesText}
                  sections={sections}
                />
              </>
            )}
          </>
      </main>

      {/* Manual Range Modal */}
      <ManualRangeModal
        section={manualSectionModal}
        totalPages={pagesText.length}
        onClose={() => setManualSectionModal(null)}
        onSave={handleUpdateSectionRange}
      />

      {/* PDF Preview Modal */}
      <PdfPreviewModal
        url={previewModal.url}
        title={previewModal.title}
        onClose={() => setPreviewModal({ url: null, title: '' })}
      />
    </div>
  );
}
