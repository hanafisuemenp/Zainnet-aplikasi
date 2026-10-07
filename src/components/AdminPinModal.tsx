import React, { useState } from 'react';
import { Lock, ShieldCheck, X, KeyRound, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { playSuccessChime } from '../utils/audioAlert';
import { RolesConfig, AppUser } from '../types';

interface AdminPinModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  rolesConfig?: RolesConfig;
  onSuccessLogin?: (userOrEmail: string | AppUser, displayName?: string) => Promise<void> | void;
}

export const ADMIN_DEFAULT_PIN = '1234';

export const AdminPinModal: React.FC<AdminPinModalProps> = ({ 
  isOpen = true, 
  onClose, 
  onSuccess,
  rolesConfig,
  onSuccessLogin
}) => {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const configuredPin = rolesConfig?.adminPinCode?.trim();
    if (
      (configuredPin && pin.trim() === configuredPin) ||
      pin.trim() === ADMIN_DEFAULT_PIN || 
      pin.trim() === 'admin123'
    ) {
      setError(null);
      playSuccessChime();
      if (onSuccessLogin) {
        const adminEmail = rolesConfig?.adminEmails?.[0] || 'admin@zain.net';
        await onSuccessLogin(adminEmail, 'Administrator ZAIN.NET');
      }
      if (onSuccess) onSuccess();
      onClose();
    } else {
      setError('PIN Admin salah. Silakan coba lagi (PIN Standar: 1234).');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow">
              <ShieldCheck className="w-6 h-6 text-emerald-950" />
            </div>
            <div>
              <h3 className="font-black text-base">Akses Khusus Admin Percetakan</h3>
              <p className="text-xs text-emerald-200/90">Monitoring Nota & Unduh Berkas Mahasiswa</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900">
            <div className="font-bold flex items-center gap-1.5 mb-1 text-amber-950">
              <Lock className="w-4 h-4 text-amber-600" />
              Area Khusus Pengelola & Kasir ZAIN.NET
            </div>
            File skripsi mahasiswa dan penghapusan nota hanya dapat diakses melalui panel ini.
            <div className="mt-1 font-semibold text-emerald-800">
              🔑 PIN Admin Standar: <span className="font-mono bg-white px-2 py-0.5 rounded border border-amber-300 font-bold">{ADMIN_DEFAULT_PIN}</span> (atau <span className="font-mono">admin123</span>)
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Masukkan PIN Keamanan Admin
            </label>
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                autoFocus
                maxLength={10}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Masukkan PIN (1234)"
                className="w-full pl-10 pr-12 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-center text-lg tracking-widest font-black text-slate-900 bg-white"
              />
              <KeyRound className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                aria-label={showPin ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {error && (
              <p className="mt-2 text-xs text-rose-600 font-bold flex items-center gap-1">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </p>
            )}
          </div>

          {/* Quick PIN Pad Buttons */}
          <div className="grid grid-cols-4 gap-2 pt-1">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  if (k === 'C') {
                    setPin('');
                  } else if (k === '⌫') {
                    setPin((prev) => prev.slice(0, -1));
                  } else {
                    setPin((prev) => prev + k);
                  }
                  if (error) setError(null);
                }}
                className={`py-2 rounded-lg font-mono font-bold text-sm transition border ${
                  k === 'C'
                    ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                    : k === '⌫'
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-900 border-slate-200'
                }`}
              >
                {k}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2.5 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 transition"
            >
              Batal
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black shadow-md transition"
            >
              Buka Panel Admin
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
