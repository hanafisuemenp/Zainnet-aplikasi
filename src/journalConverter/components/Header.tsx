import React from 'react';
import { FileText, Sparkles, Download, BookOpen, Layers } from 'lucide-react';

interface HeaderProps {
  activeTab: 'upload' | 'preview' | 'footnotes';
  setActiveTab: (tab: 'upload' | 'preview' | 'footnotes') => void;
  hasArticle: boolean;
  onDownloadDocx: () => void;
  isDownloading?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  hasArticle,
  onDownloadDocx,
  isDownloading = false,
}) => {
  return (
    <header className="bg-slate-900/95 backdrop-blur-md text-white border-b border-slate-800 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col lg:flex-row items-center justify-between gap-4">
        
        {/* Logo & Brand Info */}
        <div className="flex items-center space-x-3 w-full lg:w-auto justify-between lg:justify-start">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">
                  BUAT ARTIKEL <span className="text-blue-400">JURNAL ILMIAH</span>
                </h1>
                <span className="inline-flex items-center text-[11px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-medium">
                  Pedoman IAIN Madura
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block mt-0.5">
                Konversi skripsi ke artikel jurnal dengan template DOCX pilihan Anda
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs & Actions */}
        <div className="flex items-center justify-center lg:justify-end space-x-1.5 sm:space-x-2 w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0">
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-200 flex items-center space-x-2 whitespace-nowrap ${
              activeTab === 'upload'
                ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-500'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <BookOpen className="w-4 h-4 text-blue-300" />
            <span>1. Unggah Skripsi</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            disabled={!hasArticle}
            className={`px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-200 flex items-center space-x-2 whitespace-nowrap ${
              !hasArticle
                ? 'text-slate-600 cursor-not-allowed opacity-60'
                : activeTab === 'preview'
                ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-500'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <Sparkles className="w-4 h-4 text-blue-300" />
            <span>2. Preview & Editor</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('footnotes')}
            disabled={!hasArticle}
            className={`px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-200 flex items-center space-x-2 whitespace-nowrap ${
              !hasArticle
                ? 'text-slate-600 cursor-not-allowed opacity-60'
                : activeTab === 'footnotes'
                ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-500'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <Layers className="w-4 h-4 text-blue-300" />
            <span>3. Catatan Kaki</span>
          </button>

          {/* Download DOCX Button */}
          {hasArticle && (
            <button
              type="button"
              onClick={onDownloadDocx}
              disabled={isDownloading}
              className="ml-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold px-4 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 flex items-center space-x-2 border border-emerald-500/30 whitespace-nowrap transform hover:-translate-y-0.5"
              title="Unduh 1 ZIP berisi Artikel DOCX + Cover CD DOCX"
            >
              <Download className="w-4 h-4" />
              <span>{isDownloading ? 'Memproses...' : 'Download Artikel + Cover CD (.zip)'}</span>
            </button>
          )}

        </div>

      </div>
    </header>
  );
};
