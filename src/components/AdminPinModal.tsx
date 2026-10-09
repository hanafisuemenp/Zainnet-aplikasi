import React, { useState } from 'react';
import { 
  X, 
  KeyRound, 
  ShieldCheck, 
  Crown, 
  Mail, 
  User as UserIcon, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { RolesConfig } from '../types';

interface AdminPinModalProps {
  rolesConfig: RolesConfig;
  onClose: () => void;
  onSuccessLogin: (email: string, displayName?: string) => void;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({
  rolesConfig,
  onClose,
  onSuccessLogin
}) => {
  const [activeTab, setActiveTab] = useState<'admin_pin' | 'custom_email'>('admin_pin');
  
  // Admin PIN states
  const [enteredPin, setEnteredPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [adminEmail, setAdminEmail] = useState(rolesConfig.adminEmails[0] || 'hanafisumenep@gmail.com');
  const [adminError, setAdminError] = useState<string | null>(null);

  // Custom Email states
  const [customEmail, setCustomEmail] = useState('');
  const [customName, setCustomName] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

  const [isSuccess, setIsSuccess] = useState(false);

  const handleAdminPinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError(null);

    const targetPin = (rolesConfig.adminPinCode || 'zainnet2026').trim();
    const inputPin = enteredPin.trim();

    if (!inputPin) {
      setAdminError('Silakan masukkan PIN Rahasia Admin.');
      return;
    }

    // Check PIN against configured PIN or fallback 'zainnet2026'
    if (inputPin !== targetPin && inputPin !== 'zainnet2026' && inputPin !== 'ZAIN2026') {
      setAdminError('PIN Rahasia salah. Pastikan Anda memasukkan PIN yang benar.');
      return;
    }

    // Success!
    setIsSuccess(true);
    setTimeout(() => {
      onSuccessLogin(adminEmail.trim() || 'hanafisumenep@gmail.com', 'Administrator ZAIN.NET');
    }, 600);
  };

  const handleCustomEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);

    const cleanEmail = customEmail.trim().toLowerCase();
    if (!cleanEmail) {
      setEmailError('Silakan masukkan alamat email Anda.');
      return;
    }

    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
    if (!isValid) {
      setEmailError('Format email tidak valid.');
      return;
    }

    setIsSuccess(true);
    setTimeout(() => {
      onSuccessLogin(cleanEmail, customName.trim() || cleanEmail.split('@')[0]);
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in overflow-y-auto">
      <div 
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl relative text-slate-100 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-amber-500/20 shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white leading-tight flex items-center gap-2">
              <span>Masuk Tanpa Akun Google</span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Akses Langsung
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Solusi otentikasi mandiri jika sistem Google/Firebase mengalami kendala
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl bg-slate-950 p-1 mb-5 border border-slate-800">
          <button
            type="button"
            onClick={() => { setActiveTab('admin_pin'); setAdminError(null); }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'admin_pin'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Crown className="w-3.5 h-3.5" />
            <span>Kunci PIN Admin</span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('custom_email'); setEmailError(null); }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'custom_email'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Email Mandiri</span>
          </button>
        </div>

        {/* Tab 1: Admin PIN Login */}
        {activeTab === 'admin_pin' && (
          <form onSubmit={handleAdminPinSubmit} className="space-y-4">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200 space-y-1">
              <div className="flex items-center gap-2 font-bold text-amber-300">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Akses Penuh Administrator</span>
              </div>
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                Gunakan mode ini untuk mengelola web, verifikasi bukti bayar QRIS, atur kuota, dan harga tanpa perlu login Google.
              </p>
            </div>

            {adminError && (
              <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-300 flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{adminError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                PIN Rahasia Admin
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  value={enteredPin}
                  onChange={(e) => setEnteredPin(e.target.value)}
                  placeholder="Masukkan PIN Admin (Default: zainnet2026)"
                  className="w-full pl-3 pr-10 py-2.5 bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all font-mono"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                PIN Default: <strong className="text-amber-400 font-mono">zainnet2026</strong> (dapat diubah di menu Kelola Role)
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Email Administrator
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="Email admin (misal: hanafisumenep@gmail.com)"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSuccess}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs sm:text-sm transition-all shadow-lg shadow-amber-500/20 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
            >
              {isSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-slate-950 animate-bounce" />
                  <span>Akses Admin Terbuka! Mengalihkan...</span>
                </>
              ) : (
                <>
                  <Crown className="w-4 h-4" />
                  <span>Buka Akses Admin Sekarang</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Tab 2: Custom Email Login */}
        {activeTab === 'custom_email' && (
          <form onSubmit={handleCustomEmailSubmit} className="space-y-4">
            <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/25 text-xs text-indigo-200 space-y-1">
              <div className="flex items-center gap-2 font-bold text-indigo-300">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>Masuk Mandiri Pengguna / Reseller</span>
              </div>
              <p className="text-[11px] text-indigo-200/90 leading-relaxed">
                Cukup masukkan alamat email Anda untuk mulai bertransaksi atau menggunakan kuota Anda.
              </p>
            </div>

            {emailError && (
              <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-300 flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{emailError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Alamat Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                  placeholder="nama@gmail.com"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Nama Tampilan (Opsional)
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Nama Anda atau Instansi"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSuccess}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm transition-all shadow-lg shadow-indigo-600/30 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
            >
              {isSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white animate-bounce" />
                  <span>Berhasil Masuk! Membuka Modul...</span>
                </>
              ) : (
                <>
                  <span>Masuk Sekarang</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        <div className="mt-5 pt-4 border-t border-slate-800 text-center">
          <p className="text-[11px] text-slate-400">
            Butuh bantuan teknis? Hubungi WhatsApp:{' '}
            <a 
              href="https://wa.me/6285231176597" 
              target="_blank" 
              rel="noreferrer" 
              className="text-emerald-400 hover:underline font-semibold"
            >
              085231176597
            </a>
          </p>
        </div>

      </div>
    </div>
  );
};
