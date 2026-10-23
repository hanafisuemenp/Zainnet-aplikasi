import React, { useState } from 'react';
import { Download, Edit3, Copy, Check, Upload, CheckCircle2 } from 'lucide-react';
import { JournalArticle } from '../types/journal';
import { cleanSectionContent, normalizePpkIBibliographyEntry } from '../utils/cleanSectionContent';
import { parseInlineFormatting } from '../utils/inlineFormatting';

interface JournalPreviewProps {
  article: JournalArticle;
  onUpdateArticle: (updatedArticle: JournalArticle) => void;
  onDownloadDocx: () => void;
  isDownloading?: boolean;
  onEditSection: (sectionKey: string, sectionTitle: string, currentContent: string) => void;
  templateProfile?: any | null;
  onUploadTemplate?: (file: File) => void;
  onApplyTemplate?: () => void;
  isApplyingTemplate?: boolean;
}

const FOREIGN_TERMS = new Set([
  'MUDHARABAH',
  'MUSYARAKAH',
  'MURABAHAH',
  'IJARAH',
  'WADIAH',
  'ISTISHNA',
  'SALAM',
  'QARDH',
  'SUKUK',
  'TAKAFUL',
  'MAQASHID',
  'SYARIAH',
  'SHARIAH',
  'FIQH',
  'MUAMALAH',
  'NISBAH',
  'ZAKAT',
  'INFAQ',
  'SHADAQAH',
  'WAKAF',
  'ONLINE',
  'WEBSITE',
  'E-COMMERCE',
  'ECOMMERCE',
  'FINTECH',
  'DIGITAL MARKETING',
  'BRAND AWARENESS',
  'RETURN ON ASSET',
  'RETURN ON EQUITY',
  'EARNING PER SHARE',
]);

export const JournalPreview: React.FC<JournalPreviewProps> = ({
  article,
  onDownloadDocx,
  isDownloading = false,
  onEditSection,
  templateProfile,
  onUploadTemplate,
  onApplyTemplate,
  isApplyingTemplate = false,
}) => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const { metadata, abstract, pendahuluan, metode, hasil, pembahasan, kesimpulan, daftarPustaka, footnotes } = article;

  const countWords = (str: string = '') => (str && str.trim() ? str.trim().split(/\s+/).length : 0);
  const totalWords =
    countWords(abstract?.abstrakIndo) +
    countWords(pendahuluan) +
    countWords(metode) +
    countWords(hasil) +
    countWords(pembahasan) +
    countWords(kesimpulan) +
    (Array.isArray(daftarPustaka) ? daftarPustaka.length * 18 : countWords(daftarPustaka));
  // Word formatting: ~260 words per page with TNR 12pt, 1.5 line spacing, 4-3-3-3 cm margins
  const estimatedPages = Math.max(1, Math.round(totalWords / 265));

  const handleCopyText = (text: string, sectionKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionKey);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  // Helper to format title with proper italics for foreign/transliterated terms
  const renderFormattedTitle = (title: string) => {
    if (!title) return 'ARTIKEL ILMIAH';
    const normalized = title.replace(/<\/?(i|em)>/gi, '*');

    if (/\*{1,3}[^*\s]/.test(normalized)) {
      return parseInlineFormatting(normalized).map((part, i) => (
        <span key={i} className={`${part.italic ? 'italic' : ''} ${part.bold ? 'font-bold' : ''}`}>
          {part.text}
        </span>
      ));
    }

    const words = normalized.split(/\s+/);
    return words.map((word, i) => {
      const cleanWord = word.replace(/[^a-zA-Z-]/g, '').toUpperCase();
      const isForeign = FOREIGN_TERMS.has(cleanWord);
      return (
        <span key={i}>
          {isForeign ? <em className="italic font-bold">{word}</em> : word}
          {i < words.length - 1 ? ' ' : ''}
        </span>
      );
    });
  };

  // Preview uses exactly the same inline formatting parser as the DOCX export.
  const renderInline = (text: string) => parseInlineFormatting(text).map((part, index) => (
    <span key={index} className={`${part.italic ? 'italic' : ''} ${part.bold ? 'font-bold' : ''}`}>
      {part.text}
    </span>
  ));

  // Helper to render footnote superscripts and highlight footnote references
  const renderParagraphWithFootnotes = (textBlock: string, sectionId: string) => {
    if (!textBlock) return null;

    const cleaned = article.extractive ? textBlock : cleanSectionContent(textBlock, sectionId);
    const paragraphs = cleaned.split(/\n+/).map((p) => p.trim()).filter(Boolean);

    // Filter section footnotes
    const sectionFootnotes = footnotes?.filter((fn) => !fn.sectionId || fn.sectionId === sectionId) || [];

    return paragraphs.map((para, idx) => {
      // Check for inline footnote markers e.g. [^1], [^2], [1], [2]
      const markerRegex = /(\[\^?\d+\])/g;

      if (markerRegex.test(para)) {
        const parts = para.split(markerRegex);
        return (
          <p key={idx} className="mb-4 text-justify leading-[1.8] indent-8 text-[15px] font-tnr text-slate-900">
            {parts.map((part, pIdx) => {
              const match = part.match(/^\[\^?(\d+)\]$/);
              if (match) {
                const fnNum = parseInt(match[1], 10);
                const matchedFn = footnotes?.find((f) => f.number === fnNum);
                return (
                  <sup
                    key={pIdx}
                    className="ml-0.5 font-bold text-blue-700 bg-blue-100 px-1 py-0.2 rounded text-[11px] cursor-pointer hover:bg-blue-200 transition-all border border-blue-300"
                    title={matchedFn ? `Catatan Kaki ${fnNum}: ${matchedFn.text}` : `Catatan Kaki ${fnNum}`}
                  >
                    [{fnNum}]
                  </sup>
                );
              }
              return <span key={pIdx}>{renderInline(part)}</span>;
            })}
          </p>
        );
      }

      // No inline marker: check anchor words or attach proportional footnote at sentence end
      let attachedInPara: number | null = null;
      sectionFootnotes.forEach((fn) => {
        if (attachedInPara === null && fn.anchorWord && para.toLowerCase().includes(fn.anchorWord.toLowerCase())) {
          attachedInPara = fn.number;
        }
      });

      const matchedFn = attachedInPara ? footnotes?.find((f) => f.number === attachedInPara) : null;

      return (
        <p key={idx} className="mb-4 text-justify leading-[1.8] indent-8 text-[15px] font-tnr text-slate-900">
          {renderInline(para)}
          {attachedInPara && (
            <sup
              className="ml-1 font-bold text-blue-700 bg-blue-100 px-1 py-0.2 rounded text-[11px] cursor-pointer hover:bg-blue-200 transition-all border border-blue-300"
              title={matchedFn ? `Catatan Kaki ${attachedInPara}: ${matchedFn.text}` : `Catatan Kaki ${attachedInPara}`}
            >
              [{attachedInPara}]
            </sup>
          )}
        </p>
      );
    });
  };

  // Bibliography uses the same italic/bold rendering as body text.
  const renderBibliographyItem = (itemText: string) =>
    renderInline(article.extractive ? itemText : normalizePpkIBibliographyEntry(itemText));

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      
      {/* Top Controls Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4 sticky top-20 z-30">
        <div className="flex items-center space-x-3 flex-wrap gap-y-1">
          <span className="inline-flex items-center space-x-1.5 bg-emerald-50 text-emerald-800 text-xs px-3 py-1 rounded-full font-bold border border-emerald-200/60">
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            <span>{templateProfile ? `Template aktif: ${templateProfile.fileName}` : 'Belum ada template jurnal'}</span>
          </span>
          <span className="inline-flex items-center space-x-1 bg-blue-50 text-blue-800 text-xs px-3 py-1 rounded-full font-bold border border-blue-200/60">
            <span>Estimasi Word: {estimatedPages} Halaman ({totalWords.toLocaleString('id-ID')} Kata)</span>
          </span>
          <span className="text-xs text-slate-500 font-medium hidden lg:inline">
            Format template hanya aktif setelah template DOCX diunggah
          </span>
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
          <div className="flex flex-wrap gap-2 justify-end">
            <label className="cursor-pointer w-full sm:w-auto bg-white hover:bg-slate-50 text-slate-700 font-bold px-4 py-2.5 rounded-xl border border-slate-300 flex items-center justify-center gap-2 text-xs sm:text-sm">
              <Upload className="w-4 h-4" />
              <span>{templateProfile ? 'Ganti Template DOCX' : 'Upload Template DOCX'}</span>
              <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={e => e.target.files?.[0] && onUploadTemplate?.(e.target.files[0])} />
            </label>
            {templateProfile && (
              <button onClick={onApplyTemplate} disabled={isApplyingTemplate} className="w-full sm:w-auto bg-blue-700 hover:bg-blue-800 disabled:bg-slate-400 text-white font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs sm:text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span>{isApplyingTemplate ? 'Menerapkan Template...' : 'Terapkan Template'}</span>
              </button>
            )}
            <button onClick={onDownloadDocx} disabled={isDownloading} className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs sm:text-sm">
              <Download className="w-4 h-4" />
              <span>{isDownloading ? 'Membuat File Word...' : 'Download Dasar (.docx)'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ACADEMIC JOURNAL PAPER SIMULATOR CONTAINER */}
      <div className="bg-slate-200/50 p-4 sm:p-8 rounded-2xl border border-slate-200/60 shadow-inner">
        <div className="bg-white max-w-[850px] mx-auto shadow-md rounded-xl p-8 sm:p-14 border border-slate-200/80 font-tnr text-slate-900 min-h-[1100px] relative">
          
          {/* Header Paper Simulation Note */}
          <div className="text-center text-[11px] text-slate-400 border-b border-slate-100 pb-3 mb-8 font-sans">
            {templateProfile ? `Pratinjau konten • Template akan mempertahankan layout DOCX yang diunggah` : 'Pratinjau konten • Upload template jurnal DOCX untuk menerapkan format jurnal asli'}
          </div>

          {/* 1. JUDUL & METADATA PENULIS (PPKI: Judul 100% Persis, Cetak Miring Istilah Asing) */}
          <div className="text-center space-y-4 mb-8">
            <h1 className="text-xl sm:text-2xl font-bold uppercase tracking-wide leading-tight text-slate-900 font-tnr">
              {renderFormattedTitle(metadata.judul)}
            </h1>

            <div className="pt-2 text-sm font-tnr space-y-1">
              <p className="font-bold text-slate-900">{metadata.nama}</p>
              <p className="italic text-slate-700">
                {metadata.prodi}
                {metadata.instansi ? `, ${metadata.instansi}` : ''}
              </p>
              {metadata.email && metadata.email.trim() && metadata.email !== '-' && (
                <p className="italic text-slate-600 text-xs">Email: {metadata.email}</p>
              )}
            </div>
          </div>

          {/* 2. ABSTRAK & ABSTRACT */}
          <div className="bg-slate-50 p-6 rounded-lg border border-slate-200 mb-8 space-y-4 font-tnr">
            
            {/* Abstrak Indonesia */}
            <div>
              <h3 className="text-center font-bold text-sm uppercase mb-2 text-slate-900">ABSTRAK</h3>
              <p className="text-xs text-justify leading-relaxed text-slate-800">
                {renderInline(abstract.abstrakIndo)}
              </p>
              <p className="text-xs mt-2 text-slate-900">
                <span className="font-bold italic">Kata Kunci: </span>
                <span className="italic">
                  {Array.isArray(abstract.keywordsIndo)
                    ? abstract.keywordsIndo.join(', ')
                    : abstract.keywordsIndo}
                </span>
              </p>
            </div>

            <hr className="border-slate-300 my-3" />

            {/* Abstract English */}
            <div>
              <h3 className="text-center font-bold text-sm uppercase mb-2 text-slate-900">ABSTRACT</h3>
              <p className="text-xs text-justify italic leading-relaxed text-slate-800">
                {renderInline(abstract.abstrakEnglish)}
              </p>
              <p className="text-xs mt-2 text-slate-900">
                <span className="font-bold italic">Keywords: </span>
                <span className="italic">
                  {Array.isArray(abstract.keywordsEnglish)
                    ? abstract.keywordsEnglish.join(', ')
                    : abstract.keywordsEnglish}
                </span>
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2 font-sans">
              <button
                id="edit-abstrak-indo-btn"
                onClick={() =>
                  onEditSection(
                    'abstrakIndo',
                    'Abstrak (Bahasa Indonesia)',
                    abstract.abstrakIndo
                  )
                }
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center space-x-1"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Abstrak (ID)</span>
              </button>
              <button
                id="edit-abstrak-inggris-btn"
                onClick={() =>
                  onEditSection(
                    'abstrakInggris',
                    'Abstract (English)',
                    abstract.abstrakEnglish
                  )
                }
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center space-x-1"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Abstract (EN)</span>
              </button>
            </div>
          </div>

          {/* 3. SECTION BLOCKS (Sistematika Tanpa Abjad/Angka sesuai Pedoman PPKI BAB I hlm. 4 & BAB III hlm. 61) */}
          {renderSectionBlock(
            'PENDAHULUAN',
            pendahuluan,
            'pendahuluan',
            () => onEditSection('pendahuluan', 'PENDAHULUAN', pendahuluan),
            () => handleCopyText(pendahuluan, 'pendahuluan'),
            copiedSection === 'pendahuluan'
          )}

          {renderSectionBlock(
            'METODE PENELITIAN',
            metode,
            'metode',
            () => onEditSection('metode', 'METODE PENELITIAN', metode),
            () => handleCopyText(metode, 'metode'),
            copiedSection === 'metode'
          )}

          {renderSectionBlock(
            'HASIL PENELITIAN',
            hasil,
            'hasil',
            () => onEditSection('hasil', 'HASIL PENELITIAN', hasil),
            () => handleCopyText(hasil, 'hasil'),
            copiedSection === 'hasil'
          )}

          {renderSectionBlock(
            'PEMBAHASAN',
            pembahasan,
            'pembahasan',
            () => onEditSection('pembahasan', 'PEMBAHASAN', pembahasan),
            () => handleCopyText(pembahasan, 'pembahasan'),
            copiedSection === 'pembahasan'
          )}

          {renderSectionBlock(
            'KESIMPULAN DAN SARAN',
            kesimpulan,
            'kesimpulan',
            () => onEditSection('kesimpulan', 'KESIMPULAN DAN SARAN', kesimpulan),
            () => handleCopyText(kesimpulan, 'kesimpulan'),
            copiedSection === 'kesimpulan'
          )}

          {/* 4. DAFTAR RUJUKAN (PPKI Bab IV: Hanging Indent, Penulis >=3 dkk., Judul Miring) */}
          <div className="mb-8 font-tnr border-t border-slate-200 pt-6">
            <div className="flex items-center justify-between mb-3 font-sans">
              <h3 className="font-bold text-base uppercase text-slate-900 font-tnr">
                DAFTAR RUJUKAN
              </h3>
              <button
                onClick={() =>
                  onEditSection(
                    'daftarPustaka',
                    'DAFTAR RUJUKAN',
                    Array.isArray(daftarPustaka) ? daftarPustaka.join('\n') : daftarPustaka
                  )
                }
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center space-x-1"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Daftar Rujukan</span>
              </button>
            </div>

            <div className="space-y-3 text-sm text-justify pl-8 -indent-8 font-tnr leading-relaxed">
              {Array.isArray(daftarPustaka) ? (
                daftarPustaka.map((item, idx) => (
                  <p key={idx} className="text-slate-900">
                    {renderBibliographyItem(item)}
                  </p>
                ))
              ) : (
                <p className="text-slate-900">{renderBibliographyItem(daftarPustaka || '')}</p>
              )}
            </div>
          </div>

          {/* 5. CATATAN KAKI (FOOTNOTES DISPLAY) */}
          <div className="mt-14 pt-4 font-tnr text-left border-t border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 font-sans">
                Daftar Rujukan Catatan Kaki (Footnotes PPKI 2020)
              </h4>
              <span className="text-[11px] text-blue-700 font-medium font-sans">
                {footnotes?.length || 0} Catatan Kaki Aktif
              </span>
            </div>

            {footnotes && footnotes.length > 0 ? (
              <div className="space-y-1.5 text-xs text-slate-700 font-tnr">
                {footnotes.map((fn, idx) => (
                  <div key={`fn-${fn.id || 'item'}-${idx}`} className="flex items-start space-x-2">
                    <span className="font-bold text-slate-900 min-w-[24px]">
                      {fn.number || idx + 1}.
                    </span>
                    <span className="text-justify leading-relaxed flex-1">
                      {renderInline(fn.text)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 italic text-[11px] font-tnr">
                Belum ada catatan kaki khusus.
              </p>
            )}

            <p className="mt-3 text-[10px] text-slate-400 font-sans italic border-t border-slate-100 pt-2">
              * Pada dokumen Microsoft Word (.docx) hasil unduhan, catatan kaki ini otomatis diposisikan secara presisi di sudut kiri bawah pada setiap halaman (bottom-left page footnote) sesuai Bab IV PPKI.
            </p>
          </div>

        </div>
      </div>

    </div>
  );

  function renderSectionBlock(
    title: string,
    content: string,
    sectionKey: string,
    onEdit: () => void,
    onCopy: () => void,
    isCopied: boolean
  ) {
    const cleanedContent = article.extractive ? content : cleanSectionContent(content, title);

    return (
      <div className="mb-8 font-tnr group relative">
        <div className="flex items-center justify-between mb-2 font-sans">
          <h3 className="font-bold text-base uppercase text-slate-900 font-tnr tracking-tight">
            {title}
          </h3>

          <div className="flex items-center space-x-2 opacity-80 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onCopy}
              className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded"
              title="Salin Teks Bagian Ini"
            >
              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={onEdit}
              className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center space-x-1 bg-blue-50 px-2 py-1 rounded border border-blue-200"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Seleksi Paragraf Asli</span>
            </button>
          </div>
        </div>

        <div className="text-slate-900 leading-[1.8] text-[15px] font-tnr">
          {renderParagraphWithFootnotes(cleanedContent, sectionKey)}
        </div>
      </div>
    );
  }
};
