import React, { useState } from 'react';
import { Header } from './components/Header';
import { SkripsiUploader } from './components/SkripsiUploader';
import { JournalPreview } from './components/JournalPreview';
import { SectionEditorModal } from './components/SectionEditorModal';
import { FootnoteManager } from './components/FootnoteManager';
import { SkripsiInput, JournalArticle, FootnoteItem } from './types/journal';
import { buildJournalBundle, triggerBundleDownload } from './utils/bundleExport';
import { auditGeneratedArticle } from './utils/qualityAudit';
import { assertArticleFromSource } from './utils/extractiveArticle';
import { fitExtractiveArticleToPages } from './utils/pageFitter';
import { FileText, Sparkles, AlertCircle, BookOpen, Upload, CheckCircle2 } from 'lucide-react';

interface JournalConverterAppProps {
  /** Called once the completed journal is available, no extra Finish click needed. */
  onArticleComplete?: (fileName: string) => void;
}

export default function App({ onArticleComplete }: JournalConverterAppProps) {
  const [activeTab, setActiveTab] = useState<'upload' | 'preview' | 'footnotes'>('upload');
  const [article, setArticle] = useState<JournalArticle | null>(null);
  const [originalSource, setOriginalSource] = useState<{ rawText: string; footnotes: Record<string, string> } | null>(null);
  const [exportBundle, setExportBundle] = useState<{ blob: Blob; filename: string } | null>(null);
  const [qualityWarnings, setQualityWarnings] = useState<string[]>([]);
  const [pageReport, setPageReport] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloadingDocx, setIsDownloadingDocx] = useState(false);
  const [hasCompletedSession, setHasCompletedSession] = useState(false);
  const [templateProfile, setTemplateProfile] = useState<any | null>(null);
  const isApplyingTemplate = false;
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Section Editor Modal state
  const [editorModal, setEditorModal] = useState<{
    isOpen: boolean;
    sectionKey: string;
    sectionTitle: string;
    content: string;
  }>({
    isOpen: false,
    sectionKey: '',
    sectionTitle: '',
    content: '',
  });

  // Generation Progress status state
  const [generationStatus, setGenerationStatus] = useState<{
    stage: number;
    message: string;
    percent: number;
  }>({ stage: 0, message: '', percent: 0 });

  // Process article using Gemini 3.1 Flash Lite
  const handleGenerateJournal = async (input: SkripsiInput) => {
    if (hasCompletedSession) {
      setErrorMsg('Sesi artikel ini sudah selesai. Kembali ke ZAIN.NET untuk memulai sesi baru.');
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    setGenerationStatus({ stage: 1, message: 'Menghubungkan ke Gemini 3.1 Flash Lite & menganalisis skripsi...', percent: 15 });

    const selectedModel = input.selectedModel || 'gemini-3.1-flash-lite';
    const targetLengthPages = input.targetLengthPages || 16;

    try {
      let fullArticle: JournalArticle | null = null;
      let warnings: string[] = [];

      // 1. Try Gemini 3.1 Flash Lite multi-stage synthesis
      try {
        // Stage 1: Metadata, Abstract, Pendahuluan, Metode
        setGenerationStatus({
          stage: 1,
          message: 'Tahap 1/3: Menyusun Judul, Abstrak Bilingual, Pendahuluan & Metode... (Gemini 3.1 Flash Lite)',
          percent: 35,
        });

        const stage1Res = await fetch('/api/journal7/generate-journal/stage1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rawText: input.rawText,
            metadata: input.metadata,
            targetLengthPages,
            selectedModel,
          }),
        });

        if (!stage1Res.ok) {
          const errData = await stage1Res.json().catch(() => ({}));
          throw new Error(errData.error || `Tahap 1 gagal (HTTP ${stage1Res.status})`);
        }
        const stage1Data = await stage1Res.json();

        // Stage 2: Hasil & Pembahasan
        setGenerationStatus({
          stage: 2,
          message: 'Tahap 2/3: Menyusun Hasil Penelitian & Pembahasan Mendalam... (Gemini 3.1 Flash Lite)',
          percent: 68,
        });

        const stage2Res = await fetch('/api/journal7/generate-journal/stage2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rawText: input.rawText,
            stage1Data,
            targetLengthPages,
            selectedModel,
          }),
        });

        if (!stage2Res.ok) {
          const errData = await stage2Res.json().catch(() => ({}));
          throw new Error(errData.error || `Tahap 2 gagal (HTTP ${stage2Res.status})`);
        }
        const stage2Data = await stage2Res.json();

        // Stage 3: Kesimpulan, Footnotes, Daftar Rujukan
        setGenerationStatus({
          stage: 3,
          message: 'Tahap 3/3: Menyusun Kesimpulan, Footnote & Daftar Rujukan... (Gemini 3.1 Flash Lite)',
          percent: 88,
        });

        const stage3Res = await fetch('/api/journal7/generate-journal/stage3', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rawText: input.rawText,
            stage1Data,
            stage2Data,
            footnoteStyle: input.footnoteStyle,
            selectedModel,
            targetLengthPages,
          }),
        });

        if (!stage3Res.ok) {
          const errData = await stage3Res.json().catch(() => ({}));
          throw new Error(errData.error || `Tahap 3 gagal (HTTP ${stage3Res.status})`);
        }
        const stage3Data = await stage3Res.json();

        const mergedFootnotes = [
          ...(stage1Data.footnotes || []),
          ...(stage2Data.footnotes || []),
          ...(stage3Data.footnotes || []),
        ];

        fullArticle = {
          id: `art_${Date.now()}`,
          createdAt: new Date().toISOString(),
          metadata: {
            ...input.metadata,
            ...(stage1Data.metadata || {}),
            judul: input.metadata.judul?.trim() || stage1Data.metadata?.judul || 'ARTIKEL ILMIAH',
          },
          abstract: stage1Data.abstract,
          pendahuluan: stage1Data.pendahuluan,
          metode: stage1Data.metode,
          hasil: stage2Data.hasil,
          pembahasan: stage2Data.pembahasan,
          kesimpulan: stage3Data.kesimpulan,
          daftarPustaka: stage3Data.daftarPustaka || [],
          footnotes: stage3Data.footnotes?.length ? stage3Data.footnotes : mergedFootnotes,
        };
      } catch (aiErr: any) {
        console.warn('Multi-stage AI generation failed, trying combined endpoint fallback:', aiErr);

        // Fallback A: Combined single endpoint
        try {
          setGenerationStatus({
            stage: 2,
            message: 'Memproses naskah artikel via generator terpadu Gemini 3.1 Flash Lite...',
            percent: 75,
          });

          const directRes = await fetch('/api/journal7/generate-journal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rawText: input.rawText,
              metadata: input.metadata,
              footnoteStyle: input.footnoteStyle,
              targetLengthPages,
              selectedModel,
            }),
          });

          if (directRes.ok) {
            fullArticle = await directRes.json();
          } else {
            throw new Error('Fallback generator terpadu gagal.');
          }
        } catch (directErr) {
          console.warn('Direct fallback failed, using local document extractor:', directErr);
          // Fallback B: Local structured thesis fitting
          const fitted = await fitExtractiveArticleToPages(input, (message, percent) => {
            setGenerationStatus({ stage: 2, message, percent });
          });
          fullArticle = fitted.article;
          warnings = fitted.warnings;
        }
      }

      if (!fullArticle) {
        throw new Error('Gagal menghasilkan artikel jurnal. Silakan periksa file skripsi dan coba kembali.');
      }

      setGenerationStatus({ stage: 3, message: 'Menyiapkan berkas Word (.docx) & Cover CD...', percent: 95 });
      const packageResult = await buildJournalBundle(fullArticle);

      setOriginalSource({ rawText: input.rawText, footnotes: input.sourceFootnotes || {} });
      setQualityWarnings([...warnings, ...auditGeneratedArticle(fullArticle, input.rawText)]);
      setPageReport(`Artikel Jurnal Ilmiah berhasil disusun dengan Gemini 3.1 Flash Lite. Standar naskah: ${targetLengthPages} halaman Word.`);
      setArticle(fullArticle);
      setExportBundle(packageResult);
      setHasCompletedSession(true);
      setActiveTab('preview');
      onArticleComplete?.(packageResult.filename);
    } catch (err: any) {
      console.error('Journal generation error:', err);
      setErrorMsg(err?.message || 'Gagal memproses artikel ilmiah.');
    } finally {
      setIsLoading(false);
      setGenerationStatus({ stage: 0, message: '', percent: 0 });
    }
  };

  const handleUploadTemplate = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.docx')) { alert('Template harus berupa file .docx'); return; }
    const fd = new FormData(); fd.append('template', file);
    try {
      const res = await fetch('/api/journal7/template/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Template gagal dibaca.');
      setTemplateProfile(data.profile);
    } catch (e: any) { alert(e.message || 'Template gagal diproses.'); }
  };

  const handleApplyTemplate = async () => {
    alert('Ekspor menggunakan template jurnal eksternal sementara dinonaktifkan karena jalur lamanya dapat menghilangkan footnote asli. Gunakan tombol Download Artikel + Cover CD di atas.');
  };

  // Handle Word Export
  const handleDownloadDocx = async () => {
    if (!article) return;
    setIsDownloadingDocx(true);
    try {
      const prepared = exportBundle || await buildJournalBundle(article);
      setExportBundle(prepared);
      triggerBundleDownload(prepared.blob, prepared.filename);
    } catch (err: any) {
      console.error('Bundle Export Error:', err);
      alert('Gagal mengunduh paket Artikel + Cover CD: ' + (err?.message || 'error'));
    } finally {
      setIsDownloadingDocx(false);
    }
  };

  // Open Editor Modal for a specific section
  const handleOpenSectionEditor = (sectionKey: string, sectionTitle: string, currentContent: string) => {
    setEditorModal({
      isOpen: true,
      sectionKey,
      sectionTitle,
      content: currentContent,
    });
  };

  // Save edited section
  const handleSaveSection = (sectionKey: string, newContent: string) => {
    if (!article) return;
    setExportBundle(null);
    if (sectionKey === 'abstract' || sectionKey === 'abstrakIndo' || sectionKey === 'abstrakInggris' || sectionKey === 'abstrakEnglish') {
      setArticle({
        ...article,
        abstract: {
          ...article.abstract,
          ...(sectionKey === 'abstrakInggris' || sectionKey === 'abstrakEnglish'
            ? { abstrakEnglish: newContent }
            : { abstrakIndo: newContent }),
        },
      });
    } else {
      setArticle({
        ...article,
        [sectionKey]: newContent,
      });
    }
  };

  // Footnote update
  const handleUpdateFootnotes = (updatedFootnotes: FootnoteItem[]) => {
    if (!article) return;
    setExportBundle(null);
    setArticle({
      ...article,
      footnotes: updatedFootnotes,
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900 antialiased selection:bg-blue-200">
      
      {/* Global Application Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        hasArticle={!!article}
        onDownloadDocx={handleDownloadDocx}
        isDownloading={isDownloadingDocx}
      />

      {/* Main Workspace Body */}
      <main className="flex-1 pb-16">
        
        {pageReport && (
        <div className="max-w-5xl mx-auto mt-5 px-4">
          <div className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900">
            {pageReport}
          </div>
        </div>
      )}

      {/* Nonblocking review checklist: flags possible discrepancies, never claims full verification. */}
        {article && qualityWarnings.length > 0 && (
          <div className="max-w-5xl mx-auto mt-5 px-4">
            <div className="bg-amber-50 border border-amber-300 text-amber-950 rounded-xl p-4">
              <div className="font-bold text-sm mb-2">Pemeriksaan awal artikel — periksa sebelum dicetak</div>
              <ul className="list-disc pl-5 text-xs space-y-1">
                {qualityWarnings.map((warning, i) => <li key={i}>{warning}</li>)}
              </ul>
              <p className="text-xs mt-2">Pemeriksaan ini hanya mendeteksi sebagian risiko. Isi dipilih dari naskah asli tanpa parafrasa AI, tetapi pembagian bagian dan hasil OCR tetap perlu diperiksa manual.</p>
            </div>
          </div>
        )}

        {/* Error Notification Bar */}
        {errorMsg && (
          <div className="max-w-5xl mx-auto mt-6 px-4">
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <p className="text-xs">Pastikan file skripsi memiliki teks yang dapat dibaca (PDF text / DOCX) dan kunci Gemini API aktif di server.</p>
              <button onClick={() => setErrorMsg(null)} className="text-xs text-right font-bold underline">Tutup</button>
            </div>
          </div>
        )}

        {/* Tab 1: Upload / Input Skripsi */}
        {activeTab === 'upload' && (
          <SkripsiUploader
            onSubmit={handleGenerateJournal}
            isLoading={isLoading}
            generationStatus={generationStatus}
          />
        )}

        {/* Tab 2: Journal Article Preview & Editor */}
        {activeTab === 'preview' && article && (
          <JournalPreview
            article={article}
            onUpdateArticle={setArticle}
            onDownloadDocx={handleDownloadDocx}
          templateProfile={templateProfile}
          onUploadTemplate={handleUploadTemplate}
          onApplyTemplate={handleApplyTemplate}
          isApplyingTemplate={isApplyingTemplate}
            isDownloading={isDownloadingDocx}
            onEditSection={handleOpenSectionEditor}
          />
        )}

        {/* Tab 3: Footnote Manager */}
        {activeTab === 'footnotes' && article && (
          <FootnoteManager
            footnotes={article.footnotes || []}
            onUpdateFootnotes={handleUpdateFootnotes}
          />
        )}

      </main>

      {/* Section Editor Modal */}
      {article && (
        <SectionEditorModal
          isOpen={editorModal.isOpen}
          onClose={() => setEditorModal({ ...editorModal, isOpen: false })}
          sectionTitle={editorModal.sectionTitle}
          sectionKey={editorModal.sectionKey}
          initialContent={editorModal.content}
          contextTitle={article.metadata.judul}
          onSave={handleSaveSection}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        <p>
          ZAIN.NET Generator Artikel Jurnal Ilmiah (IAIN Madura) + Cover CD • Didukung oleh Google Gemini 3.1 Flash Lite
        </p>
      </footer>

    </div>
  );
}
