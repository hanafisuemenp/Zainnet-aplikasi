import React from 'react';

interface FooterProps {
  onOpenPrivacy?: () => void;
  onOpenTerms?: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  onOpenPrivacy,
  onOpenTerms
}) => {
  return (
    <footer className="border-t border-gray-800/80 bg-[#070b14] py-6 text-center text-xs text-gray-500 mt-auto">
      <div className="max-w-6xl mx-auto px-4 space-y-2">
        <p className="text-gray-400">© 2026 ZAIN.NET — Skripsi, Artikel & Makalah</p>
        <p className="text-[11px] text-gray-600">Platform otomatisasi penulisan skripsi, artikel ilmiah, dan tugas akhir mahasiswa • CS WA: 0852-3117-6597</p>
      </div>
    </footer>
  );
};

