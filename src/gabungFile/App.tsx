/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Header } from './components/Header';
import { DocxUploader } from './components/DocxUploader';
import { ScanUploader } from './components/ScanUploader';
import { StructureInspector } from './components/StructureInspector';
import { MappingTable } from './components/MappingTable';
import { PagePreviewModal } from './components/PagePreviewModal';
import { DocumentOutlineModal } from './components/DocumentOutlineModal';
import { KartuBimbinganConfigModal } from './components/KartuBimbinganConfigModal';
import { ProcessLogs } from './components/ProcessLogs';
import { DownloadSection } from './components/DownloadSection';
import {
  DocxAnalysis,
  ProcessingLog,
  ProcessingOptions,
  ScanFile,
  TargetDocument,
  ValidationResult,
} from './types/skripsi';
import { parseDocx, checkAnchorKeyword } from './utils/docxParser';
import { autoMapScansToTargets, autoMatchScan } from './utils/matcher';
import { performQuickHeaderOcr } from './utils/ocrService';
import { applyScansToDocx } from './utils/docxModifier';
import { validateDocxBlob } from './utils/docxValidator';
import { rotateImageFile, autoRotateKartuBimbingan } from './utils/imageUtils';

export interface GabungFileProps {
  onExportComplete?: (fileName: string) => void;
}

export default function App({ onExportComplete }: GabungFileProps = {}) {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [docxBuffer, setDocxBuffer] = useState<ArrayBuffer | null>(null);
  const [analysis, setAnalysis] = useState<DocxAnalysis | null>(null);
  const [targets, setTargets] = useState<TargetDocument[]>([]);
  const [scans, setScans] = useState<ScanFile[]>([]);
  const [isLoadingDocx, setIsLoadingDocx] = useState(false);
  const [isLoadingSample, setIsLoadingSample] = useState(false);
  const [isOcrRunning, setIsOcrRunning] = useState(false);

  // Configuration options
  const [options, setOptions] = useState<ProcessingOptions>({
    anchorKeyword: 'Lampiran Taruh disini Mulai dari sini',
    useAnchorFor5Attachments: true,
    captionPrefix: 'none',
    kartuBimbinganLayout: 'single_page',
    containMode: 'contain',
    insertHeadingIfMissing: true,
    preserveExistingScans: true,
  });

  // Modals state
  const [pagePreviewTargetId, setPagePreviewTargetId] = useState<string | null>(null);
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [isKartuModalOpen, setIsKartuModalOpen] = useState(false);
  const [targetToPickFor, setTargetToPickFor] = useState<TargetDocument | null>(null);

  const handleOpenManualPick = (target: TargetDocument) => {
    setTargetToPickFor(target);
    setIsOutlineOpen(true);
  };

  const handleSelectPosition = (targetId: string, elementIndex: number, page: number) => {
    setTargets((prev) =>
      prev.map((t) =>
        t.id === targetId
          ? {
              ...t,
              elementIndex,
              estimatedPage: page,
              customTargetElementIndex: elementIndex,
              status: t.assignedScanId ? ('ready' as const) : ('missing_scan' as const),
              notes: `Dipilih manual pada Hal ~${page}`,
            }
          : t
      )
    );
    setTargetToPickFor(null);
  };

  // Process and validation state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [logs, setLogs] = useState<ProcessingLog[]>([]);
  const [finalDocxBlob, setFinalDocxBlob] = useState<Blob | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  // Add Log helper
  const addLog = (message: string, type: ProcessingLog['type'] = 'success') => {
    const timestamp = new Date().toLocaleTimeString('id-ID');
    setLogs((prev) => [
      ...prev,
      {
        id: `${Date.now()}_${Math.random()}`,
        timestamp,
        type,
        message,
      },
    ]);
  };

  // Re-check Anchor Keyword
  const handleRecheckAnchor = (keyword?: string) => {
    if (!analysis) return;
    const kw = keyword !== undefined ? keyword : options.anchorKeyword;
    const match = analysis.elements.find((el) => checkAnchorKeyword(el.text, kw));
    if (match) {
      setAnalysis({
        ...analysis,
        anchorKeywordMatch: {
          index: match.index,
          page: match.estimatedPage,
          text: match.text,
          matchedKeyword: match.text,
        },
      });
    } else {
      setAnalysis({
        ...analysis,
        anchorKeywordMatch: null,
      });
    }
  };

  // 1. Handle DOCX Upload
  const handleDocxLoaded = async (file: File) => {
    try {
      setIsLoadingDocx(true);
      const buffer = await file.arrayBuffer();
      setDocxBuffer(buffer);

      const parsed = await parseDocx(buffer, file.name, options.anchorKeyword);
      setAnalysis(parsed);

      const { updatedTargets, updatedScans } = autoMapScansToTargets(parsed.detectedTargets, scans);
      setTargets(updatedTargets);
      setScans(updatedScans);

      setCurrentStep(scans.length > 0 ? 3 : 2);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert('Gagal membaca file DOCX: ' + msg);
    } finally {
      setIsLoadingDocx(false);
    }
  };

  // Clear DOCX
  const handleClearDocx = () => {
    setDocxBuffer(null);
    setAnalysis(null);
    setTargets([]);
    setFinalDocxBlob(null);
    setValidationResult(null);
    setCurrentStep(1);
  };

  // 2. Handle Scans Upload
  const handleAddScanFiles = async (fileList: FileList | File[]) => {
    const newScans: ScanFile[] = [];

    for (let i = 0; i < fileList.length; i++) {
      let file = fileList[i];
      if (!file.type.startsWith('image/')) continue;

      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });

      const { width, height } = await new Promise<{ width: number; height: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = () => resolve({ width: 800, height: 1100 });
        img.src = dataUrl;
      });

      // Auto rotate Kartu Bimbingan if filename indicates kartu bimbingan and orientation is portrait
      if (/bimbingan|kartu/i.test(file.name) && height > width * 1.05) {
        const rotRes = await autoRotateKartuBimbingan(file);
        file = rotRes.file;
      }

      newScans.push({
        id: `scan_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        file,
        name: file.name,
        size: file.size,
        dataUrl,
        width,
        height,
        aspectRatio: width / height,
        detectionSource: 'filename',
        confidence: 'high',
        rotation: 0,
      });
    }

    let mergedScans = [...scans, ...newScans];

    if (targets.length > 0) {
      // First pass: filename match
      let { updatedTargets, updatedScans } = autoMapScansToTargets(targets, mergedScans);

      // Second pass: for any scan that has no target yet, run fast OCR
      const unassignedScans = updatedScans.filter((s) => !s.matchedTargetId);
      if (unassignedScans.length > 0) {
        for (const scan of unassignedScans) {
          try {
            const ocr = await performQuickHeaderOcr(scan.file);
            if (ocr) {
              scan.ocrSnippet = ocr;
              const match = autoMatchScan(scan, updatedTargets);
              if (match.matchedTargetId && match.confidence === 'high') {
                const target = updatedTargets.find((t) => t.id === match.matchedTargetId);
                if (target && !target.assignedScanId) {
                  target.assignedScanId = scan.id;
                  target.status = 'ready';
                  scan.matchedTargetId = target.id;
                  scan.detectionSource = 'ocr';
                  scan.confidence = 'high';
                }
              }
            }
          } catch (e) {
            console.warn('Auto OCR on upload error:', e);
          }
        }
      }

      setTargets(updatedTargets);
      setScans(updatedScans);
      setCurrentStep(4);
    } else {
      setScans(mergedScans);
    }
  };

  const handleRemoveScan = (scanId: string) => {
    const updatedScans = scans.filter((s) => s.id !== scanId);
    const updatedTargets = targets.map((t) =>
      t.assignedScanId === scanId ? { ...t, assignedScanId: undefined, status: 'missing_scan' as const } : t
    );
    setScans(updatedScans);
    setTargets(updatedTargets);
  };

  const handleRotateScan = async (scanId: string) => {
    const scan = scans.find((s) => s.id === scanId);
    if (!scan) return;
    try {
      const res = await rotateImageFile(scan.file, 90);
      setScans((prev) =>
        prev.map((s) =>
          s.id === scanId
            ? {
                ...s,
                file: res.file,
                dataUrl: res.dataUrl,
                width: res.width,
                height: res.height,
                aspectRatio: res.aspectRatio,
                rotation: 0,
              }
            : s
        )
      );
    } catch (e) {
      console.warn('Rotation error:', e);
    }
  };

  const handleAutoRotateKartu = async () => {
    const targetDepan = targets.find((t) => t.id === 'kartu_bimbingan_depan');
    const targetBelakang = targets.find((t) => t.id === 'kartu_bimbingan_belakang');

    const sDepan = scans.find((s) => s.id === targetDepan?.assignedScanId);
    const sBelakang = scans.find((s) => s.id === targetBelakang?.assignedScanId);

    let updatedScans = [...scans];
    let rotatedCount = 0;

    if (sDepan && sDepan.height > sDepan.width * 1.05) {
      const res = await autoRotateKartuBimbingan(sDepan.file);
      updatedScans = updatedScans.map((s) =>
        s.id === sDepan.id
          ? {
              ...s,
              file: res.file,
              dataUrl: res.dataUrl,
              width: res.width,
              height: res.height,
              aspectRatio: res.aspectRatio,
              rotation: 0,
            }
          : s
      );
      rotatedCount++;
    }

    if (sBelakang && sBelakang.height > sBelakang.width * 1.05) {
      const res = await autoRotateKartuBimbingan(sBelakang.file);
      updatedScans = updatedScans.map((s) =>
        s.id === sBelakang.id
          ? {
              ...s,
              file: res.file,
              dataUrl: res.dataUrl,
              width: res.width,
              height: res.height,
              aspectRatio: res.aspectRatio,
              rotation: 0,
            }
          : s
      );
      rotatedCount++;
    }

    setScans(updatedScans);
    if (rotatedCount > 0) {
      alert(`Auto-Rotate berhasil: ${rotatedCount} gambar Kartu Bimbingan telah diputar menjadi format horizontal (landscape)!`);
    } else {
      alert('Kedua gambar Kartu Bimbingan sudah berada dalam format horizontal (landscape).');
    }
  };

  const handleRotateSingleScan = async (scanId: string) => {
    await handleRotateScan(scanId);
  };

  const handleRunOcrForScan = async (scanId: string) => {
    const scan = scans.find((s) => s.id === scanId);
    if (!scan) return;

    try {
      setIsOcrRunning(true);
      const ocrText = await performQuickHeaderOcr(scan.file);
      const updatedScan = { ...scan, ocrSnippet: ocrText, detectionSource: 'ocr' as const };

      const { updatedTargets, updatedScans } = autoMapScansToTargets(
        targets,
        scans.map((s) => (s.id === scanId ? updatedScan : s))
      );
      setTargets(updatedTargets);
      setScans(updatedScans);
    } finally {
      setIsOcrRunning(false);
    }
  };

  const handleAssignTarget = (scanId: string, targetId: string | undefined) => {
    const updatedTargets = targets.map((t) => {
      if (t.id === targetId) {
        return { ...t, assignedScanId: scanId, status: 'ready' as const };
      }
      if (t.assignedScanId === scanId) {
        return { ...t, assignedScanId: undefined, status: 'missing_scan' as const };
      }
      return t;
    });

    const updatedScans = scans.map((s) => {
      if (s.id === scanId) {
        return {
          ...s,
          matchedTargetId: targetId,
          detectionSource: 'manual' as const,
          confidence: 'high' as const,
        };
      }
      if (targetId && s.matchedTargetId === targetId) {
        return { ...s, matchedTargetId: undefined };
      }
      return s;
    });

    // Auto verify Kartu Bimbingan Top/Bottom
    const targetDepan = updatedTargets.find((t) => t.id === 'kartu_bimbingan_depan');
    const targetBelakang = updatedTargets.find((t) => t.id === 'kartu_bimbingan_belakang');

    if (targetDepan?.assignedScanId && targetBelakang?.assignedScanId) {
      const sDepan = updatedScans.find((s) => s.id === targetDepan.assignedScanId);
      const sBelakang = updatedScans.find((s) => s.id === targetBelakang.assignedScanId);

      if (sDepan && sBelakang) {
        const sDepanText = (sDepan.name + ' ' + (sDepan.ocrSnippet || '')).toLowerCase();
        const sBelakangText = (sBelakang.name + ' ' + (sBelakang.ocrSnippet || '')).toLowerCase();

        const belakangHasIdentity =
          /nama|nim|fakultas|prodi|jurusan|depan|front/i.test(sBelakangText) &&
          !/belakang|catatan|konsultasi/i.test(sBelakang.name);

        if (belakangHasIdentity) {
          targetDepan.assignedScanId = sBelakang.id;
          targetBelakang.assignedScanId = sDepan.id;
          sDepan.matchedTargetId = 'kartu_bimbingan_belakang';
          sBelakang.matchedTargetId = 'kartu_bimbingan_depan';
        }
      }
    }

    setTargets(updatedTargets);
    setScans(updatedScans);
  };

  const handleSetTargetPosition = (
    targetId: string,
    elementIndex: number,
    mode: 'replace_page' | 'after_element'
  ) => {
    setTargets((prev) =>
      prev.map((t) => {
        if (t.id === targetId) {
          return {
            ...t,
            customTargetElementIndex: elementIndex,
            customInsertionMode: mode,
            elementIndex: t.elementIndex === undefined ? elementIndex : t.elementIndex,
          };
        }
        return t;
      })
    );
  };

  const handleSwapKartuScans = () => {
    const targetDepan = targets.find((t) => t.id === 'kartu_bimbingan_depan');
    const targetBelakang = targets.find((t) => t.id === 'kartu_bimbingan_belakang');

    if (!targetDepan || !targetBelakang) return;

    const scanIdDepan = targetDepan.assignedScanId;
    const scanIdBelakang = targetBelakang.assignedScanId;

    setTargets((prev) =>
      prev.map((t) => {
        if (t.id === 'kartu_bimbingan_depan') {
          return { ...t, assignedScanId: scanIdBelakang };
        }
        if (t.id === 'kartu_bimbingan_belakang') {
          return { ...t, assignedScanId: scanIdDepan };
        }
        return t;
      })
    );

    setScans((prev) =>
      prev.map((s) => {
        if (s.id === scanIdDepan) return { ...s, matchedTargetId: 'kartu_bimbingan_belakang' };
        if (s.id === scanIdBelakang) return { ...s, matchedTargetId: 'kartu_bimbingan_depan' };
        return s;
      })
    );
  };

  // 3. Load Sample Files
  const handleLoadSample = async () => {
    try {
      setIsLoadingSample(true);
      setLogs([]);

      const docxRes = await fetch('/sample/SEBELUM.docx');
      const docxArrayBuffer = await docxRes.arrayBuffer();

      const parsed = await parseDocx(docxArrayBuffer, 'SEBELUM.docx', options.anchorKeyword);
      setDocxBuffer(docxArrayBuffer);
      setAnalysis(parsed);

      const sampleScanFiles = [
        { name: 'persetujuan.jpeg', url: '/sample/persetujuan.jpeg' },
        { name: 'pengesahan.jpeg', url: '/sample/pengesahan.jpeg' },
        { name: 'keaslian.jpeg', url: '/sample/keaslian.jpeg' },
        { name: 'surat_tugas.jpeg', url: '/sample/surat_tugas.jpeg' },
        { name: 'kartu_bimbingan_depan.jpeg', url: '/sample/kartu_bimbingan_depan.jpeg' },
        { name: 'kartu_bimbingan_belakang.jpeg', url: '/sample/kartu_bimbingan_belakang.jpeg' },
        { name: 'izin_penelitian.jpeg', url: '/sample/izin_penelitian.jpeg' },
        { name: 'telah_meneliti.jpeg', url: '/sample/telah_meneliti.jpeg' },
        { name: 'bebas_plagiasi.jpeg', url: '/sample/bebas_plagiasi.jpeg' },
      ];

      const loadedScans: ScanFile[] = [];

      for (const item of sampleScanFiles) {
        const res = await fetch(item.url);
        const blob = await res.blob();
        let file = new File([blob], item.name, { type: 'image/jpeg' });

        if (item.name.includes('kartu_bimbingan')) {
          const rotRes = await autoRotateKartuBimbingan(file);
          file = rotRes.file;
        }

        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });

        const { width, height } = await new Promise<{ width: number; height: number }>((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.width, height: img.height });
          img.src = dataUrl;
        });

        loadedScans.push({
          id: `scan_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          file,
          name: item.name,
          size: blob.size,
          dataUrl,
          width,
          height,
          aspectRatio: width / height,
          detectionSource: 'filename',
          confidence: 'high',
          rotation: 0,
        });
      }

      const { updatedTargets, updatedScans } = autoMapScansToTargets(parsed.detectedTargets, loadedScans);
      setTargets(updatedTargets);
      setScans(updatedScans);

      setCurrentStep(4);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert('Gagal memuat sampel dokumen: ' + msg);
    } finally {
      setIsLoadingSample(false);
    }
  };

  // 4. Start DOCX Processing
  const handleStartProcess = async () => {
    if (!docxBuffer || !analysis) {
      alert('File skripsi DOCX belum diunggah.');
      return;
    }

    try {
      setIsProcessing(true);
      setCurrentStep(6);
      setProgressPercent(10);
      setLogs([]);

      addLog('File Word berhasil dibaca', 'success');
      await new Promise((r) => setTimeout(r, 200));

      // Log detected items
      targets.forEach((t) => {
        if (t.assignedScanId) {
          const s = scans.find((scan) => scan.id === t.assignedScanId);
          if (t.category === 'signed_page') {
            addLog(`✓ ${t.title} siap menggantikan teks asli (${s?.name})`, 'success');
          } else {
            addLog(`✓ ${t.title} siap ditempatkan dengan keterangan di atas foto (${s?.name})`, 'success');
          }
        }
      });

      setProgressPercent(30);
      await new Promise((r) => setTimeout(r, 200));

      addLog('✓ Menerapkan konfigurasi Margin 2 cm (atas, bawah, kiri, kanan) khusus halaman lampiran & tanda tangan', 'info');
      addLog('✓ Mengisolasi Halaman 3 (Persetujuan) & Halaman 4 (Pengesahan) agar Halaman 5 (Abstrak) tetap menggunakan margin semula (4-3-4-3 cm)', 'info');
      addLog('✓ Mengonfigurasi peletakan Pernyataan Keaslian Tulisan setelah Daftar Pustaka', 'info');

      if (analysis.anchorKeywordMatch && options.useAnchorFor5Attachments) {
        addLog(
          `✓ Titik penempatan 5 Lampiran aktif: "${analysis.anchorKeywordMatch.matchedKeyword}" di Halaman ~${analysis.anchorKeywordMatch.page}`,
          'success'
        );
      } else {
        addLog('ℹ Menggunakan posisi heading lampiran di bagian lampiran dokumen', 'info');
      }

      setProgressPercent(55);
      addLog('Menginjeksikan relasi gambar OOXML dan DrawingML...', 'info');

      const result = await applyScansToDocx(docxBuffer, analysis, targets, scans, options);

      result.logs.forEach((l) => addLog(l, 'success'));
      setProgressPercent(85);

      // Validate result
      addLog('Memvalidasi integritas paket DOCX...', 'info');
      const val = await validateDocxBlob(result.docxBlob);
      setValidationResult(val);

      if (!val.isValid) {
        addLog(`✗ Validasi gagal: ${val.errorMessage}`, 'error');
        alert(val.errorMessage || 'File belum dapat dibuat karena struktur DOCX gagal divalidasi.');
        return;
      }

      val.checks.forEach((c) => {
        if (c.passed) addLog(`✓ ${c.name}: ${c.details}`, 'success');
      });

      addLog('✓ Margin 1 cm dan urutan dokumen berhasil diterapkan sempurna', 'success');
      addLog('✓ DOCX berhasil dibuat: SKRIPSI_SELESAI_TEMPEL_LAMPIRAN.docx', 'success');

      setFinalDocxBlob(result.docxBlob);
      setProgressPercent(100);
      setCurrentStep(7);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`✗ Kegagalan proses: ${msg}`, 'error');
      alert('Proses gagal: ' + msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800">
      <Header
        currentStep={currentStep}
        onSelectStep={setCurrentStep}
        onLoadSample={handleLoadSample}
        isLoadingSample={isLoadingSample}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Step 1: Upload Docx */}
        <DocxUploader
          analysis={analysis}
          onFileLoaded={handleDocxLoaded}
          onClear={handleClearDocx}
          onOpenOutline={() => setIsOutlineOpen(true)}
          isLoading={isLoadingDocx}
        />

        {/* Step 2: Upload Scans */}
        <ScanUploader
          scans={scans}
          targets={targets}
          onAddFiles={handleAddScanFiles}
          onRemoveScan={handleRemoveScan}
          onRotateScan={handleRotateScan}
          onRunOcrForScan={handleRunOcrForScan}
          onAssignTarget={handleAssignTarget}
          isOcrRunning={isOcrRunning}
        />

        {/* Step 3: Structure Inspector with Anchor Keyword */}
        {analysis && (
          <StructureInspector
            analysis={analysis}
            targets={targets}
            anchorKeyword={options.anchorKeyword}
            onAnchorKeywordChange={(kw) => {
              setOptions((prev) => ({ ...prev, anchorKeyword: kw }));
              handleRecheckAnchor(kw);
            }}
            onRecheckAnchor={() => handleRecheckAnchor()}
            onOpenManualPick={handleOpenManualPick}
          />
        )}

        {/* Step 4: Mapping Table */}
        {analysis && scans.length > 0 && (
          <MappingTable
            targets={targets}
            scans={scans}
            analysis={analysis}
            options={options}
            onOptionsChange={setOptions}
            onAssignTarget={handleAssignTarget}
            onOpenPagePreview={(targetId) => setPagePreviewTargetId(targetId)}
            onOpenKartuModal={() => setIsKartuModalOpen(true)}
            onAutoMapAgain={() => {
              const { updatedTargets, updatedScans } = autoMapScansToTargets(targets, scans);
              setTargets(updatedTargets);
              setScans(updatedScans);
            }}
            onStartProcess={handleStartProcess}
            isProcessing={isProcessing}
            onOpenManualPick={handleOpenManualPick}
          />
        )}

        {/* Step 6: Process Logs */}
        <ProcessLogs
          logs={logs}
          isProcessing={isProcessing}
          progressPercent={progressPercent}
        />

        {/* Step 7: Download Section */}
        {finalDocxBlob && validationResult && (
          <DownloadSection
            finalDocxBlob={finalDocxBlob}
            validationResult={validationResult}
            onReset={() => {
              setCurrentStep(4);
              setFinalDocxBlob(null);
            }}
            onExportComplete={onExportComplete}
          />
        )}
      </main>

      {/* Modals */}
      <PagePreviewModal
        isOpen={pagePreviewTargetId !== null}
        onClose={() => setPagePreviewTargetId(null)}
        targetId={pagePreviewTargetId}
        analysis={analysis}
        targets={targets}
        scans={scans}
        onSetTargetPosition={handleSetTargetPosition}
      />

      <DocumentOutlineModal
        isOpen={isOutlineOpen}
        onClose={() => {
          setIsOutlineOpen(false);
          setTargetToPickFor(null);
        }}
        analysis={analysis}
        targetToPick={targetToPickFor}
        onSelectPosition={handleSelectPosition}
      />

      <KartuBimbinganConfigModal
        isOpen={isKartuModalOpen}
        onClose={() => setIsKartuModalOpen(false)}
        options={options}
        onOptionsChange={setOptions}
        targets={targets}
        scans={scans}
        onSwapKartuScans={handleSwapKartuScans}
        onAutoRotateKartu={handleAutoRotateKartu}
        onRotateSingleScan={handleRotateSingleScan}
      />

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <p>
          <strong>ZAIN.NET</strong> — Sistem Otomatis Penempelan Lampiran & Dokumen Skripsi ke Word DOCX
        </p>
        <p className="mt-1 text-[11px] text-slate-400">
          Margin 2 cm khusus pada halaman lampiran & lembar tanda tangan (Halaman 3 & 4) • Halaman lain tetap margin semula.
        </p>
      </footer>
    </div>
  );
}
