import React, { useEffect, useState } from 'react';
import { 
  auth, 
  googleProvider 
} from '../firebase';
import { 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult, 
  GoogleAuthProvider 
} from 'firebase/auth';
import { ShieldCheck, LogIn, AlertCircle, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';

export const AuthBridgeView: React.FC = () => {
  const [status, setStatus] = useState<'initiating' | 'waiting' | 'success' | 'error'>('initiating');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const searchParams = new URLSearchParams(window.location.search);
  const targetOrigin = searchParams.get('origin') || '*';
  const redirectTarget = searchParams.get('redirect');

  const sendSuccess = (idToken: string, accessToken?: string) => {
    setStatus('success');

    // 1. If opened via popup (window.opener exists)
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({
        type: 'FIREBASE_AUTH_BRIDGE_SUCCESS',
        idToken,
        accessToken,
      }, '*');

      setTimeout(() => {
        try {
          window.close();
        } catch (e) {
          console.log('Could not close window automatically', e);
        }
      }, 1000);
      return;
    }

    // 2. If redirected from mobile browser
    if (redirectTarget) {
      try {
        const dest = new URL(redirectTarget);
        dest.searchParams.set('auth_id_token', idToken);
        if (accessToken) dest.searchParams.set('auth_access_token', accessToken);
        window.location.href = dest.toString();
        return;
      } catch (e) {
        console.error('Invalid redirect url', e);
      }
    }

    // Default fallback to custom domain
    window.location.href = `https://karyazainnet.net?auth_id_token=${encodeURIComponent(idToken)}${accessToken ? `&auth_access_token=${encodeURIComponent(accessToken)}` : ''}`;
  };

  const handleSignIn = async () => {
    try {
      setStatus('initiating');
      setErrorMessage(null);
      
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const idToken = credential?.idToken;
      const accessToken = credential?.accessToken;

      if (!idToken) {
        throw new Error('Tidak menerima token otorisasi dari Google. Silakan coba lagi.');
      }

      sendSuccess(idToken, accessToken);
    } catch (err: any) {
      console.error('Bridge auth error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setStatus('waiting');
        setErrorMessage('Jendela login ditutup sebelum selesai.');
      } else if (err.code === 'auth/popup-blocked') {
        setStatus('waiting');
        setErrorMessage('Silakan tekan tombol di bawah untuk memilih akun Google Anda.');
      } else {
        setStatus('error');
        setErrorMessage(err.message || 'Gagal menghubungkan akun Google.');
      }
    }
  };

  useEffect(() => {
    // Check if returning from redirect
    getRedirectResult(auth)
      .then((result) => {
        if (result) {
          const credential = GoogleAuthProvider.credentialFromResult(result);
          const idToken = credential?.idToken;
          const accessToken = credential?.accessToken;
          if (idToken) {
            sendSuccess(idToken, accessToken);
            return;
          }
        }
        // If popup blocker is likely on mobile, show prompt, else auto-trigger
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile) {
          setStatus('waiting');
        } else {
          handleSignIn();
        }
      })
      .catch((err) => {
        console.error('Redirect result error:', err);
        setStatus('waiting');
      });
  }, []);

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 p-8 rounded-2xl shadow-2xl text-center backdrop-blur-xl">
        {/* Brand Icon */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-500/20 border border-white/10">
          <span className="text-2xl font-black text-white">Z</span>
        </div>

        <h1 className="text-xl font-bold tracking-tight text-white mb-2">
          Jembatan Otorisasi Akun Google
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          Menghubungkan akun Google Anda dengan aman ke domain <span className="text-indigo-400 font-semibold">karyazainnet.net</span>
        </p>

        {status === 'initiating' && (
          <div className="py-6 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            <p className="text-xs text-slate-400">Sedang membuka otentikasi Google...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="py-6 flex flex-col items-center justify-center space-y-3 text-emerald-400 animate-in zoom-in-95">
            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            <p className="text-sm font-semibold text-emerald-300">Login Google Berhasil!</p>
            <p className="text-xs text-slate-400">Mengalihkan kembali ke website utama...</p>
          </div>
        )}

        {(status === 'waiting' || status === 'error') && (
          <div className="space-y-4">
            {errorMessage && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-left flex items-start gap-2.5 text-xs text-red-300">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              onClick={handleSignIn}
              className="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold flex items-center justify-center gap-3 transition-all shadow-md active:scale-95"
            >
              <LogIn className="w-5 h-5 text-indigo-600" />
              <span>Klik untuk Masuk Akun Google</span>
            </button>

            {redirectTarget && (
              <a
                href={redirectTarget}
                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <span>Batalkan dan kembali</span>
                <ArrowRight className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        <div className="mt-8 pt-4 border-t border-slate-800/80 flex items-center justify-center gap-2 text-[11px] text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>Keamanan Otentikasi Terverifikasi ZAIN.NET</span>
        </div>
      </div>
    </div>
  );
};
