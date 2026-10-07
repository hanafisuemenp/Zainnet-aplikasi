import React from 'react';
import { 
  Star, 
  CheckCircle, 
  Shield, 
  Zap, 
  Clock, 
  Eye,
  Sparkles,
  Award
} from 'lucide-react';

interface HeroSectionProps {
  onExploreModules: () => void;
  totalToolsCount?: number;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onExploreModules,
  totalToolsCount = 12
}) => {
  return (
    <section className="bg-card rounded-2xl p-6 sm:p-8 lg:p-10 relative overflow-hidden flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12 shadow-xl border border-gray-800/80">
      
      {/* Background ambient lighting */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-72 h-72 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Left Content */}
      <div className="space-y-5 max-w-xl z-10 flex-1">
        
        {/* Golden Star Pill */}
        <div className="inline-flex items-center space-x-1.5 bg-[#090e1a] border border-amber-500/30 text-amber-400 text-[11px] px-3.5 py-1.5 rounded-full font-semibold shadow-inner">
          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
          <span className="tracking-wide">PLATFORM MODUL AKADEMIK TERLENGKAP</span>
        </div>

        {/* Title */}
        <div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-blue-500 mb-2">
            ZAIN.NET
          </h1>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-100 leading-snug">
            Pusat Modul Akademik<br />
            <span className="text-gray-200">Skripsi, Artikel, Makalah & Proposal</span>
          </h2>
        </div>

        {/* Subtitle description */}
        <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
          Solusi cerdas untuk mahasiswa & akademisi.<br />
          Cepat, mudah, otomatis & aman.
        </p>

        {/* 4 Feature Items */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-[11px] text-gray-300">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-blue-400 shrink-0" />
            <div>
              <p className="font-semibold text-gray-200">Sekali Bayar</p>
              <p className="text-[9px] text-gray-500">Pay Per Use</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Shield className="w-4 h-4 text-blue-400 shrink-0" />
            <div>
              <p className="font-semibold text-gray-200">Format Otomatis</p>
              <p className="text-[9px] text-gray-500">Otomatis & Rapi</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 text-blue-400 shrink-0" />
            <div>
              <p className="font-semibold text-gray-200">Proses Cepat</p>
              <p className="text-[9px] text-gray-500">& Akurat</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-blue-400 shrink-0" />
            <div>
              <p className="font-semibold text-gray-200">Akses 24 Jam</p>
              <p className="text-[9px] text-gray-500">Realtime</p>
            </div>
          </div>
        </div>

        {/* Action Button & User Avatars */}
        <div className="flex flex-wrap items-center gap-4 pt-3">
          <button 
            onClick={onExploreModules}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs sm:text-sm px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center space-x-2 cursor-pointer transition-all active:scale-95"
          >
            <Eye className="w-4 h-4" />
            <span>Lihat Semua Modul ({totalToolsCount})</span>
          </button>

          <div className="flex items-center space-x-2.5 bg-[#090e1a] border border-gray-800 px-3.5 py-2 rounded-xl shadow-inner">
            <div className="flex -space-x-2 overflow-hidden">
              <div className="w-6 h-6 rounded-full bg-indigo-600 border border-gray-800 flex items-center justify-center text-[10px] font-bold text-white">
                A
              </div>
              <div className="w-6 h-6 rounded-full bg-purple-600 border border-gray-800 flex items-center justify-center text-[10px] font-bold text-white">
                R
              </div>
              <div className="w-6 h-6 rounded-full bg-emerald-600 border border-gray-800 flex items-center justify-center text-[10px] font-bold text-white">
                D
              </div>
            </div>
            <div className="text-[10px]">
              <p className="font-bold text-gray-200">18.000+ Pengguna</p>
              <p className="text-gray-500">Terbukti Terbaik</p>
            </div>
          </div>
        </div>

      </div>

      {/* Right: Enlarged Circular Image Graphic with Concentric Rings & Badges */}
      <div className="relative flex flex-col items-center justify-center shrink-0 my-2 lg:my-0">
        
        {/* Outer Pulsing Aura Ring */}
        <div className="absolute w-72 h-72 sm:w-80 sm:h-80 rounded-full bg-indigo-500/10 blur-xl pointer-events-none animate-pulse" />
        
        {/* Concentric Outer Ring 1 */}
        <div className="absolute w-[270px] h-[270px] sm:w-[310px] sm:h-[310px] rounded-full border border-dashed border-indigo-500/25 pointer-events-none animate-[spin_60s_linear_infinite]" />

        {/* Concentric Outer Ring 2 (Glow accent) */}
        <div className="absolute w-[250px] h-[250px] sm:w-[285px] sm:h-[285px] rounded-full border border-indigo-400/20 pointer-events-none" />

        {/* Main Large Circular Image Container */}
        <div className="w-56 h-56 sm:w-64 sm:h-64 rounded-full p-2 bg-gradient-to-tr from-blue-600/40 via-indigo-500/30 to-purple-600/40 border-2 border-indigo-500/40 shadow-2xl shadow-indigo-950/60 relative group z-10 flex items-center justify-center">
          
          {/* Inner Circular Frame */}
          <div className="w-full h-full rounded-full overflow-hidden relative border-2 border-gray-800 bg-[#070b14]">
            <img 
              src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRN7TO_q6OALPNArkplUsKWKfsUeusnwIDGbp4iwQmjBclOqsPJS_s1otNH&s=10" 
              alt="Thesis & Skripsi Otomatis"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-center group-hover:scale-110 transition-transform duration-500"
            />
            {/* Subtle Gradient Shadow */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
          </div>

          {/* Floating Top-Right Mini Badge */}
          <div className="absolute -top-1.5 -right-1.5 bg-gradient-to-tr from-amber-500 to-amber-600 text-slate-950 p-2 rounded-full shadow-lg shadow-amber-500/30 border-2 border-[#0d1322] z-20 flex items-center justify-center">
            <Award className="w-4 h-4 text-slate-950" />
          </div>

          {/* Floating Bottom-Left Mini Badge */}
          <div className="absolute -bottom-1.5 -left-1.5 bg-gradient-to-tr from-indigo-600 to-blue-600 text-white p-2 rounded-full shadow-lg shadow-indigo-600/30 border-2 border-[#0d1322] z-20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
        </div>

        {/* Floating Bottom Caption Pill */}
        <div className="mt-4 bg-[#0b101d] border border-indigo-500/30 px-4 py-2 rounded-xl shadow-xl flex items-center space-x-2.5 z-20">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span className="text-xs font-bold text-gray-200">Thesis & Skripsi Otomatis</span>
          <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 font-semibold">
            100% Siap
          </span>
        </div>

      </div>

    </section>
  );
};

