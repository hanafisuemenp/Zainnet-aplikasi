import { parseInlineFormatting } from '../utils/inlineFormatting';
import React, { useState } from 'react';
import { Plus, Trash2, Edit2, Check, BookOpen, Layers, HelpCircle, FileText } from 'lucide-react';
import { FootnoteItem } from '../types/journal';

interface FootnoteManagerProps {
  footnotes: FootnoteItem[];
  onUpdateFootnotes: (updatedFootnotes: FootnoteItem[]) => void;
}

export const FootnoteManager: React.FC<FootnoteManagerProps> = ({ footnotes, onUpdateFootnotes }) => {
  const [newText, setNewText] = useState('');
  const [newSectionId, setNewSectionId] = useState('pendahuluan');
  const [newAnchorWord, setNewAnchorWord] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const handleAddFootnote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return;

    const newFn: FootnoteItem = {
      id: 'fn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      number: footnotes.length + 1,
      text: newText.trim(),
      sectionId: newSectionId,
      anchorWord: newAnchorWord.trim() || undefined,
    };

    onUpdateFootnotes([...footnotes, newFn]);
    setNewText('');
    setNewAnchorWord('');
  };

  const handleDeleteFootnote = (id: string) => {
    const filtered = footnotes.filter((fn) => fn.id !== id);
    // Renumber
    const renumbered = filtered.map((fn, idx) => ({ ...fn, number: idx + 1 }));
    onUpdateFootnotes(renumbered);
  };

  const handleStartEdit = (fn: FootnoteItem) => {
    setEditingId(fn.id);
    setEditText(fn.text);
  };

  const handleSaveEdit = (id: string) => {
    const updated = footnotes.map((fn) => (fn.id === id ? { ...fn, text: editText } : fn));
    onUpdateFootnotes(updated);
    setEditingId(null);
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80">
        <div className="flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold border border-blue-100 flex-shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Kelola Catatan Kaki (Footnotes) Artikel</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Catatan kaki akan otomatis diletakkan pada bagian bawah halaman (bottom of page) saat diekspor ke Microsoft Word (.docx).
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Form Add New Footnote */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 h-fit space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2 border-b border-slate-100 pb-3">
            <Plus className="w-4 h-4 text-blue-600" />
            <span>Tambah Catatan Kaki Baru</span>
          </h3>

          <form onSubmit={handleAddFootnote} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Isi Catatan Kaki (Footnote Text)
              </label>
              <textarea
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="Contoh: Swastha, B. (2020). Manajemen Pemasaran Modern. Yogyakarta: Liberty, hlm. 45."
                rows={3}
                className="w-full text-xs p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50/50 text-slate-900 transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Lokasi Bagian Artikel
              </label>
              <select
                value={newSectionId}
                onChange={(e) => setNewSectionId(e.target.value)}
                className="w-full text-xs p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white text-slate-900 font-medium transition-all shadow-sm"
              >
                <option value="pendahuluan">A. Pendahuluan</option>
                <option value="metode">B. Metode Penelitian</option>
                <option value="hasil">C. Hasil Penelitian</option>
                <option value="pembahasan">D. Pembahasan</option>
                <option value="kesimpulan">E. Kesimpulan</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Kata Kunci Acuan (Anchor Word - Opsional)
              </label>
              <input
                type="text"
                value={newAnchorWord}
                onChange={(e) => setNewAnchorWord(e.target.value)}
                placeholder="Kata dalam paragraf yang diberi nomor footnote (misal: 'Slovin')"
                className="w-full text-xs p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white text-slate-900 transition-all shadow-sm"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold py-3 rounded-xl shadow-md transition-all duration-200 flex items-center justify-center space-x-1.5 transform hover:-translate-y-0.5"
            >
              <Plus className="w-4 h-4" />
              <span>Tambahkan Footnote</span>
            </button>
          </form>
        </div>

        {/* List of Existing Footnotes */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80">
          <h3 className="text-sm font-bold text-slate-900 mb-4 border-b border-slate-100 pb-3 flex items-center justify-between">
            <span>Daftar Catatan Kaki Terdaftar ({footnotes.length})</span>
            <span className="text-xs font-semibold text-slate-500">Format Word Footnote</span>
          </h3>

          {footnotes.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
              <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-xs text-slate-500 font-medium">Belum ada catatan kaki yang dibuat.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {footnotes.map((fn, idx) => (
                <div
                  key={`fn-mgr-${fn.id || 'item'}-${idx}`}
                  className="p-4 rounded-xl border border-slate-200/70 bg-slate-50/60 hover:bg-blue-50/30 transition-all flex items-start justify-between gap-4"
                >
                  <div className="flex items-start space-x-3 flex-1">
                    <span className="w-6 h-6 rounded-lg bg-blue-700 text-white font-bold text-xs flex items-center justify-center flex-shrink-0 shadow-sm">
                      {fn.number}
                    </span>

                    <div className="flex-1">
                      {editingId === fn.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            rows={2}
                            className="w-full text-xs p-2.5 border border-blue-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 bg-white"
                          />
                          <button
                            onClick={() => handleSaveEdit(fn.id)}
                            className="bg-emerald-600 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg shadow-sm"
                          >
                            Simpan
                          </button>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-slate-800 font-tnr leading-relaxed">{parseInlineFormatting(fn.text).map((part, idx) => <span key={idx} className={`${part.italic ? 'italic' : ''} ${part.bold ? 'font-bold' : ''}`}>{part.text}</span>)}</p>
                          <div className="flex items-center space-x-2 mt-2 text-[11px] text-slate-500">
                            <span className="bg-slate-200/70 px-2.5 py-0.5 rounded-md text-slate-700 capitalize font-medium">
                              Bagian: {fn.sectionId}
                            </span>
                            {fn.anchorWord && (
                              <span className="text-blue-700 font-medium">Acuan: "{fn.anchorWord}"</span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleStartEdit(fn)}
                      className="p-1.5 text-slate-400 hover:text-blue-700 hover:bg-slate-200/60 rounded-lg transition-colors"
                      title="Edit Footnote"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteFootnote(fn.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Hapus Footnote"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
