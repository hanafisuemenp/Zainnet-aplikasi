import React, { useState } from 'react';
import {
  Database,
  Code2,
  Copy,
  Check,
  Download,
  Server,
  Cloud,
  Layers,
  ShieldCheck,
  FileJson
} from 'lucide-react';
import { OrderRecord } from '../types';
import { getFirestoreSchemaSnippet } from '../utils/pricing';

interface DatabaseSchemaModalProps {
  currentOrder?: OrderRecord | null;
  onClose?: () => void;
}

export const DatabaseSchemaModal: React.FC<DatabaseSchemaModalProps> = ({
  currentOrder,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'schema' | 'liveOrder' | 'r2Storage' | 'rules'>('schema');
  const [copied, setCopied] = useState(false);

  const genericSchema = getFirestoreSchemaSnippet();

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadJson = (data: object, filename: string) => {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const firestoreRulesSample = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Koleksi pesanan jilid hard cover skripsi UIN Madura
    match /orders/{orderId} {
      // Mahasiswa dapat membaca nota pesanan
      allow read: if true;
      
      // Validasi pembuatan formulir pesanan oleh mahasiswa
      allow create: if request.resource.data.studentName is string
                    && request.resource.data.coverCount >= 1
                    && request.resource.data.whatsapp is string
                    && request.resource.data.totalCost is number
                    // Mahasiswa tidak dapat mengonfirmasi sendiri transaksi LUNAS/DP
                    && request.resource.data.adminConfirmed == false;
                    
      // Hanya operator / admin loket percetakan yang berhak mengonfirmasi status pembayaran DP/LUNAS
      allow update: if request.auth != null && request.auth.token.role == 'admin_loket';
      allow delete: if request.auth != null && request.auth.token.role == 'superadmin';
    }
  }
}`;

  const r2StorageArchitecture = `{
  "storageProvider": "Cloudflare R2 / Google Cloud Storage / AWS S3",
  "bucketName": "uinmadura-skripsi-repository",
  "directoryHierarchy": {
    "root": "skripsi-naskah/",
    "structure": "skripsi-naskah/{TAHUN}/{FAKULTAS_CODE}/{ORDER_ID}/",
    "examples": [
      {
        "purpose": "Pisah file untuk Perpus UIN Madura",
        "files": [
          "Cover_Depan_HasanBasri.pdf",
          "Bab_1_Pendahuluan.pdf",
          "Bab_2_Kajian_Teori.pdf",
          "Bab_3_Metode_Penelitian.pdf",
          "Bab_4_Hasil_Dan_Pembahasan.pdf",
          "Bab_5_Penutup_Kesimpulan.pdf",
          "Daftar_Pustaka.pdf"
        ]
      },
      {
        "purpose": "Artikel Skripsi",
        "files": [
          "Naskah_Artikel_Jurnal_UIN_Madura.docx"
        ]
      },
      {
        "purpose": "Buku SKEK",
        "note": "Dicatat sebagai layanan fisik kelulusan bebas perpus"
      }
    ]
  },
  "metadataHeaders": {
    "x-amz-meta-order-id": "NOT-20261003-782",
    "x-amz-meta-warna-sampul": "Hijau",
    "x-amz-meta-status-transaksi": "LUNAS",
    "x-amz-meta-admin-confirmed": "true"
  }
}`;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header Info */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">
              <Database className="w-4 h-4 text-emerald-600" />
              STRUKTUR DATABASE NOSQL & ARSITEKTUR R2
            </div>
            <h2 className="text-2xl font-black text-slate-900">
              Dokumentasi Skema JSON & Verifikasi Admin
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
              Struktur data pesanan mencakup data mahasiswa, warna sampul fakultas UIN Madura, live kalkulasi biaya, dan status konfirmasi admin.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDownloadJson(genericSchema, 'skema-database-jilid-skripsi.json')}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 transition shadow"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh Schema .JSON</span>
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-100 overflow-x-auto">
          <button
            onClick={() => setActiveTab('schema')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'schema'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Skema NoSQL / Firestore JSON</span>
          </button>

          <button
            onClick={() => setActiveTab('liveOrder')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'liveOrder'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <FileJson className="w-3.5 h-3.5" />
            <span>JSON Pesanan Aktif {currentOrder ? `(${currentOrder.orderId})` : ''}</span>
          </button>

          <button
            onClick={() => setActiveTab('r2Storage')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'r2Storage'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>Struktur Cloudflare R2 / Object Storage</span>
          </button>

          <button
            onClick={() => setActiveTab('rules')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'rules'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Rules Konfirmasi Admin</span>
          </button>
        </div>
      </div>

      {/* Code Display Card */}
      <div className="bg-slate-900 rounded-2xl shadow-xl overflow-hidden border border-slate-800 text-slate-100">
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-rose-500/80"></span>
            <span className="w-3 h-3 rounded-full bg-amber-500/80"></span>
            <span className="w-3 h-3 rounded-full bg-emerald-500/80"></span>
            <span className="ml-2 font-mono text-xs text-slate-400">
              {activeTab === 'schema' && 'firestore-orders-schema.json'}
              {activeTab === 'liveOrder' && 'current-order-payload.json'}
              {activeTab === 'r2Storage' && 'cloudflare-r2-architecture.json'}
              {activeTab === 'rules' && 'firestore.rules'}
            </span>
          </div>

          <button
            onClick={() => {
              let content = '';
              if (activeTab === 'schema') content = JSON.stringify(genericSchema, null, 2);
              if (activeTab === 'liveOrder') content = JSON.stringify(currentOrder || genericSchema, null, 2);
              if (activeTab === 'r2Storage') content = r2StorageArchitecture;
              if (activeTab === 'rules') content = firestoreRulesSample;
              handleCopy(content);
            }}
            className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Tersalin!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Salin Kode</span>
              </>
            )}
          </button>
        </div>

        <div className="p-5 font-mono text-xs overflow-x-auto max-h-[600px] leading-relaxed text-emerald-300">
          <pre>
            {activeTab === 'schema' && JSON.stringify(genericSchema, null, 2)}
            {activeTab === 'liveOrder' && JSON.stringify(currentOrder || genericSchema, null, 2)}
            {activeTab === 'r2Storage' && r2StorageArchitecture}
            {activeTab === 'rules' && firestoreRulesSample}
          </pre>
        </div>
      </div>
    </div>
  );
};
