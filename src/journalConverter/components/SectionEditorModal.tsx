import React, { useEffect, useState } from 'react';
import { X, Check, Sparkles, Loader2 } from 'lucide-react';

interface SectionEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  sectionTitle: string;
  sectionKey: string;
  initialContent: string;
  contextTitle: string;
  onSave: (sectionKey: string, newContent: string) => void;
}

export const SectionEditorModal: React.FC<SectionEditorModalProps> = ({
  isOpen, onClose, sectionTitle, sectionKey, initialContent, contextTitle, onSave,
}) => {
  const [content, setContent] = useState(initialContent);
  const [isPolishing, setIsPolishing] = useState(false);
  const [polishInstruction, setPolishInstruction] = useState('');
  const [showPolishPrompt, setShowPolishPrompt] = useState(false);

  useEffect(() => { setContent(initialContent); }, [initialContent, isOpen]);
  if (!isOpen) return null;

  const handlePolishWithAi = async () => {
    setIsPolishing(true);
    try {
      const res = await fetch('/api/journal7/regenerate-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionName: sectionTitle,
          currentText: content,
          instructions: polishInstruction || 'Perbaiki tata bahasa, tingkatkan kejelasan akademis dan kerapian paragraf sesuai pedoman jurnal ilmiah PPKI 2020.',
          contextTitle,
          selectedModel: 'gemini-3.1-flash-lite',
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Gagal memproses perapian AI.');
      }

      const data = await res.json();
      if (data.newText) {
        setContent(data.newText);
        setShowPolishPrompt(false);
        setPolishInstruction('');
      }
    } catch (err: any) {
      alert(err.message || 'Gagal memproses AI polish.');
    } finally {
      setIsPolishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <header className="px-6 py-4 border-b flex items-center justify-between bg-slate-50">
          <div>
            <div className="text-xs text-blue-700 font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Editor Artikel Jurnal • Gemini 3.1 Flash Lite</span>
            </div>
            <h3 className="text-lg font-bold text-slate-900">{sectionTitle}</h3>
          </div>
          <button onClick={onClose} title="Tutup" className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </header>

        <main className="p-6 overflow-y-auto flex-1 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-blue-50/70 border border-blue-200/80 rounded-xl p-3.5 text-xs text-blue-900">
            <div>
              <p className="font-semibold">Edit atau sempurnakan bagian ini secara langsung.</p>
              <p className="text-[11px] text-blue-700 mt-0.5">Penanda footnote seperti [^1], [^2] akan otomatis disinkronkan saat diekspor ke Word (.docx).</p>
            </div>
            <button
              onClick={() => setShowPolishPrompt(!showPolishPrompt)}
              disabled={isPolishing}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5 shrink-0 transition-colors shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{showPolishPrompt ? 'Tutup AI Polish' : 'Rapikan via Gemini 3.1'}</span>
            </button>
          </div>

          {showPolishPrompt && (
            <div className="p-3.5 bg-slate-900 rounded-xl text-white text-xs space-y-2 border border-slate-700 animate-fade-in">
              <label className="block font-semibold text-blue-300">Instruksi AI Polish (Gemini 3.1 Flash Lite):</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={polishInstruction}
                  onChange={(e) => setPolishInstruction(e.target.value)}
                  placeholder="Misal: Perbaiki tanda baca, perjelas paragraf metode, buat bahasa lebih baku..."
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-400"
                />
                <button
                  onClick={handlePolishWithAi}
                  disabled={isPolishing}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isPolishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>{isPolishing ? 'Memproses...' : 'Jalankan'}</span>
                </button>
              </div>
            </div>
          )}

          <textarea
            className="w-full border border-slate-300 rounded-xl p-4 font-tnr text-sm leading-relaxed min-h-[340px] focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-900 bg-white"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={15}
          />
          <p className="text-xs text-slate-500 text-right">{content.length.toLocaleString('id-ID')} karakter • {content.trim().split(/\s+/).filter(Boolean).length.toLocaleString('id-ID')} kata</p>
        </main>

        <footer className="px-6 py-4 border-t flex items-center justify-between bg-slate-50">
          <button onClick={onClose} className="text-sm text-slate-600 font-medium hover:text-slate-800">
            Batal
          </button>
          <button
            onClick={() => { onSave(sectionKey, content); onClose(); }}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center gap-2 shadow-sm transition-all"
          >
            <Check className="w-4 h-4" /> Simpan Perubahan
          </button>
        </footer>
      </div>
    </div>
  );
};
