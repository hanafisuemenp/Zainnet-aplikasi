import React, { useState } from 'react';
import { Upload, FileText, CheckCircle2, Sparkles, User, Mail, GraduationCap, Building2, AlertCircle, ArrowRight, BookCheck, HelpCircle } from 'lucide-react';
import { extractDocxSource } from '../utils/extractDocxSource';
import { SkripsiInput, JournalMetadata } from '../types/journal';
import { SAMPLE_SKRIPSI } from '../data/sampleSkripsi';

interface SkripsiUploaderProps {
  onSubmit: (input: SkripsiInput) => void;
  isLoading: boolean;
  generationStatus?: {
    stage: number;
    message: string;
    percent: number;
  };
}

// Helper function to extract author metadata (nama, prodi, instansi, email) automatically from extracted text
const extractMetadataFromSkripsiText = (text: string, fileName?: string) => {
  if (!text) return {};
  const firstChunk = text.slice(0, 4000); // Title/cover page is in the first 4000 characters

  let detectedNama = '';
  let detectedNim = '';
  let detectedProdi = '';
  let detectedInstansi = '';
  let detectedEmail = '';

  // 1. Extract Author Name
  // Pattern A: "Disusun Oleh:", "Oleh:", "Penulis:", "Oleh :"
  const olehMatch = firstChunk.match(/(?:disusun\s+oleh|oleh|penulis)\s*[:\n]\s*([A-Za-z\s'\.\,]{3,60})/i);
  if (olehMatch && olehMatch[1]) {
    const rawName = olehMatch[1].split('\n')[0].trim();
    if (isValidAuthorName(rawName)) {
      detectedNama = cleanAndFormatAuthorName(rawName);
    }
  }

  // Pattern B: "NAMA :" or "Nama Lengkap :"
  if (!detectedNama) {
    const namaMatch = firstChunk.match(/(?:nama\s+lengkap|nama)\s*[:\n]\s*([A-Za-z\s'\.\,]{3,60})/i);
    if (namaMatch && namaMatch[1]) {
      const rawName = namaMatch[1].split('\n')[0].trim();
      if (isValidAuthorName(rawName)) {
        detectedNama = cleanAndFormatAuthorName(rawName);
      }
    }
  }

  // Pattern C: Name line right before NIM/NPM/NIP
  if (!detectedNama) {
    const nimMatch = firstChunk.match(/([A-Z\s'\.\,]{3,60})\s*\n\s*(?:NIM|NPM|NIP|NRM)\s*[:\.]/i);
    if (nimMatch && nimMatch[1]) {
      const rawName = nimMatch[1].trim();
      if (isValidAuthorName(rawName)) {
        detectedNama = cleanAndFormatAuthorName(rawName);
      }
    }
  }

  // 1b. Extract NIM / NPM / NRM / NIP
  const nimOnlyMatch = firstChunk.match(/(?:NIM|NPM|NIP|NRM)\s*[:\.]?\s*([0-9A-Z\/\.\-]{6,30})/i);
  if (nimOnlyMatch && nimOnlyMatch[1]) {
    detectedNim = nimOnlyMatch[1].trim();
  }

  // 2. Extract Program Studi
  const prodiMatch = firstChunk.match(/(?:program\s+studi|prodi|jurusan)\s*[:\n\s]*([A-Za-z\s]{4,60})/i);
  if (prodiMatch && prodiMatch[1]) {
    const candidate = prodiMatch[1].split('\n')[0].trim();
    if (candidate && candidate.length > 3 && !/^(universitas|fakultas|skripsi|lembar|tahun)/i.test(candidate)) {
      const formatted = candidate.toLowerCase().replace(/\b[a-z]/g, (l) => l.toUpperCase());
      detectedProdi = formatted.toLowerCase().startsWith('program studi') ? formatted : 'Program Studi ' + formatted;
    }
  }

  // 3. Extract Instansi / Universitas
  const univMatch = firstChunk.match(/(universitas|institut|sekolah\ttinggi|politeknik|akademi)\s+[A-Za-z\s]{3,60}/i);
  if (univMatch && univMatch[0]) {
    const candidate = univMatch[0].split('\n')[0].trim();
    detectedInstansi = candidate.toLowerCase().replace(/\b[a-z]/g, (l) => l.toUpperCase());
  }

  // 4. Extract Email if present in file
  const emailMatch = firstChunk.match(/([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch && emailMatch[1]) {
    detectedEmail = emailMatch[0].trim();
  }

  return {
    nama: detectedNama,
    nim: detectedNim,
    prodi: detectedProdi,
    instansi: detectedInstansi,
    email: detectedEmail,
  };
};

function isValidAuthorName(str: string): boolean {
  if (!str) return false;
  const lower = str.toLowerCase().trim();
  const invalidKeywords = [
    'skripsi', 'program', 'studi', 'jurusan', 'universitas', 'fakultas',
    'halaman', 'bab', 'daftar', 'lembar', 'pengesahan', 'nim', 'npm',
    'kata', 'pengantar', 'diajukan', 'untuk', 'memenuhi', 'syarat', 'gelar'
  ];
  if (invalidKeywords.some(kw => lower === kw || lower.startsWith(kw) || lower.includes('universitas') || lower.includes('fakultas'))) {
    return false;
  }
  return str.length >= 3 && str.length <= 60;
}

function cleanAndFormatAuthorName(str: string): string {
  let cleaned = str
    .replace(/(?:NIM|NPM|NIP|NRM).*$/i, '')
    .replace(/^[:\-\s]+/, '')
    .trim();

  // If uppercase (e.g. AHMAD FAUZI SIREGAR), capitalize title case
  if (cleaned === cleaned.toUpperCase()) {
    cleaned = cleaned.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  }
  return cleaned;
}

export const SkripsiUploader: React.FC<SkripsiUploaderProps> = ({
  onSubmit,
  isLoading,
  generationStatus,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isAutoExtractedName, setIsAutoExtractedName] = useState(false);

  const [rawText, setRawText] = useState<string>('');
  const [sourceFootnotes, setSourceFootnotes] = useState<Record<string, string>>({});
  const [metadata, setMetadata] = useState<JournalMetadata>({
    judul: '',
    judulEnglish: '',
    nama: '',
    nim: '',
    bulanTahun: new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
    prodi: '',
    email: '',
    instansi: '',
  });

  const [footnoteStyle, setFootnoteStyle] = useState<'custom_footnote' | 'chicago' | 'apa'>('custom_footnote');
  const [targetLengthPages, setTargetLengthPages] = useState<number>(16);

  // File Upload to server or client extraction
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setUploadingFile(true);
    setUploadError(null);
    setSourceFootnotes({});

    try {
      let extractedText = '';

      // Preserve real DOCX Word footnotes and their locations. No LLM citation reconstruction.
      if (file.name.toLowerCase().endsWith('.docx')) {
        const extracted = await extractDocxSource(file);
        extractedText = extracted.rawText;
        setSourceFootnotes(extracted.sourceFootnotes);
      } else if (file.name.toLowerCase().endsWith('.txt')) {
        extractedText = await file.text();
      }

      // 2. If client-side didn't extract text (e.g. PDF or fallback), upload to server endpoint
      if (!extractedText || extractedText.trim().length === 0) {
        let uploadSuccess = false;
        let lastUploadError: any = null;

        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch('/api/journal7/upload-skripsi', {
              method: 'POST',
              body: formData,
            });

            const contentType = res.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
              const rawResponse = await res.text();
              console.warn(`Server non-JSON response on upload (attempt ${attempt}):`, rawResponse.slice(0, 200));
              if (rawResponse.includes('Starting Server') && attempt < 3) {
                await new Promise((r) => setTimeout(r, 2000));
                continue;
              }
              throw new Error('Gagal membaca file. Server sedang bersiap, silakan coba lagi dalam beberapa detik.');
            }

            const data = await res.json();
            if (!res.ok) {
              throw new Error(data.error || 'Gagal mengunggah file skripsi.');
            }

            extractedText = data.extractedText;
            uploadSuccess = true;
            break;
          } catch (err: any) {
            lastUploadError = err;
            if (attempt < 3) {
              await new Promise((r) => setTimeout(r, 2000));
              continue;
            }
          }
        }

        if (!uploadSuccess && !extractedText) {
          throw lastUploadError || new Error('Gagal mengunggah file skripsi.');
        }
      }

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('Teks skripsi tidak dapat diekstrak dari file ini. Pastikan file tidak kosong atau terenkripsi.');
      }

      setRawText(extractedText);

      // Auto extract author name, prodi, instansi, email & title from text
      const extracted = extractMetadataFromSkripsiText(extractedText, file.name);
      // Do not pretend a filename is the scholarly title; user confirms the title from thesis cover.

      if (extracted.nama) {
        setIsAutoExtractedName(true);
      }

      setMetadata((prev) => ({
        ...prev,
        nama: extracted.nama || prev.nama,
        nim: extracted.nim || prev.nim,
        prodi: extracted.prodi || prev.prodi,
        instansi: extracted.instansi || prev.instansi,
        email: extracted.email || prev.email,
        judul: prev.judul,
      }));
    } catch (err: any) {
      setUploadError(err.message || 'Terjadi kesalahan saat memproses file skripsi.');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleLoadSample = () => {
    setSelectedFile(null);
    setRawText(SAMPLE_SKRIPSI.rawText);
    setMetadata({
      ...SAMPLE_SKRIPSI.metadata,
      bulanTahun: SAMPLE_SKRIPSI.metadata.bulanTahun || new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
    });
    setFootnoteStyle(SAMPLE_SKRIPSI.footnoteStyle || 'custom_footnote');
    setTargetLengthPages(SAMPLE_SKRIPSI.targetLengthPages || 16);
    setUploadError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!rawText || rawText.trim().length < 50) {
      setUploadError('Teks skripsi terlalu pendek atau belum diisi. Harap unggah file skripsi atau masukkan teks skripsi.');
      return;
    }

    if (!metadata.nama || metadata.nama.trim().length === 0) {
      setUploadError('Harap isi Nama Lengkap Penulis.');
      return;
    }
    if (!metadata.judul?.trim() || !metadata.nim?.trim() || !metadata.prodi?.trim()) {
      setUploadError('Lengkapi Judul Skripsi asli, NIM, dan Prodi untuk Artikel + Cover CD.');
      return;
    }

    // Preserve exactly the email typed/extracted; never invent a @gmail.com address.
    const formattedEmail = metadata.email?.trim() || '';

    onSubmit({
      rawText,
      sourceFootnotes,
      fileName: selectedFile?.name,
      fileSize: selectedFile?.size,
      metadata: {
        ...metadata,
        email: formattedEmail,
      },
      targetLengthPages,
      footnoteStyle,
    });
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
      
      {/* Hero Welcome Banner */}
      <div className="bg-slate-900 rounded-2xl p-6 sm:p-8 text-white shadow-md border border-slate-800">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center space-x-2 bg-blue-500/20 border border-blue-400/20 text-blue-300 text-xs px-3 py-1 rounded-full font-medium">
              <Sparkles className="w-3.5 h-3.5 text-blue-300" />
              <span>Sistem Konversi Skripsi ke Artikel Jurnal Terakreditasi • Gemini 3.1 Flash Lite</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
              Ubah Skripsi Menjadi Artikel Ilmiah + Cover CD Otomatis
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Memproses naskah skripsi (.docx / .pdf) menjadi naskah artikel ilmiah berstandar Pedoman Penulisan Karya Ilmiah (PPKI) dengan kecerdasan <b>Google Gemini 3.1 Flash Lite</b>, lengkap dengan rujukan catatan kaki (footnote) dan Cover CD Word (.docx) siap cetak.
            </p>
          </div>
          <div className="hidden lg:flex flex-col items-end text-right">
            <span className="text-[11px] uppercase tracking-wider text-blue-300 font-bold bg-blue-900/60 border border-blue-400/40 px-3 py-1 rounded-lg">
              Model Aktif: Gemini 3.1 Flash Lite
            </span>
            <span className="text-xs text-slate-400 mt-1.5">Standar Format PPKI 2020</span>
          </div>
        </div>
      </div>

      {/* Main Upload / Form Card */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden divide-y divide-slate-100">
        
        {/* Step 1: Source File / Text Selection */}
        <div className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center space-x-3">
              <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 font-bold text-sm flex items-center justify-center border border-blue-100">1</span>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Unggah File Skripsi Asli</h3>
                <p className="text-xs text-slate-500">Pilih dokumen skripsi berformat PDF, Word (.docx), atau teks</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLoadSample}
              className="text-xs px-3.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold border border-blue-200 transition-colors flex items-center space-x-1.5 shadow-sm"
            >
              <BookCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>Muat Contoh Skripsi</span>
            </button>
          </div>

          {uploadError && (
            <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200/80 text-rose-800 rounded-xl text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
              <span>{uploadError}</span>
            </div>
          )}

          {(
            <div className="border-2 border-dashed border-slate-200 hover:border-blue-500 rounded-2xl p-8 sm:p-10 text-center bg-slate-50/50 hover:bg-blue-50/30 transition-all duration-200 cursor-pointer relative group">
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="flex flex-col items-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 group-hover:scale-105 transition-transform">
                  <Upload className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-base font-bold text-slate-800">
                    Klik atau seret file Skripsi ke sini
                  </p>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    Mendukung PDF berbasis teks dan DOCX asli (termasuk catatan kaki Word). File scan tanpa OCR dapat gagal terbaca.
                  </p>
                </div>

                {uploadingFile && (
                  <div className="text-xs text-blue-700 font-semibold animate-pulse flex items-center space-x-2 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200">
                    <Sparkles className="w-4 h-4 animate-spin text-blue-600" />
                    <span>Membaca dan mengekstrak isi file skripsi...</span>
                  </div>
                )}

                {selectedFile && !uploadingFile && (
                  <div className="mt-2 inline-flex items-center space-x-2 bg-emerald-50 border border-emerald-200/80 text-emerald-800 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>File Terunggah: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Author Metadata */}
        <div className="p-6 sm:p-8 bg-slate-50/40">
          <div className="flex items-center space-x-3 mb-6">
            <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 font-bold text-sm flex items-center justify-center border border-blue-100">2</span>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Metadata & Informasi Penulis Jurnal</h3>
              <p className="text-xs text-slate-500">Akan dicantumkan pada bagian paling atas artikel ilmiah sesuai standar jurnal</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            
            {/* Judul Artikel */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Judul Skripsi / Usulan Judul Artikel
              </label>
              <input
                type="text"
                value={metadata.judul}
                onChange={(e) => setMetadata({ ...metadata, judul: e.target.value })}
                placeholder="Salin judul sesuai halaman cover skripsi asli (jangan nama berkas)..."
                className="w-full text-sm px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-900 bg-white transition-all shadow-sm"
                required
              />
            </div>

            {/* Nama Penulis */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <User className="w-3.5 h-3.5 text-blue-600" />
                  <span>Nama Lengkap Penulis</span>
                </div>
                {isAutoExtractedName && (
                  <span className="text-[10px] bg-emerald-50 text-emerald-800 font-semibold px-2.5 py-0.5 rounded-full flex items-center space-x-1 border border-emerald-200/80">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>Otomatis dari File</span>
                  </span>
                )}
              </label>
              <input
                type="text"
                value={metadata.nama}
                onChange={(e) => {
                  setMetadata({ ...metadata, nama: e.target.value });
                  setIsAutoExtractedName(false);
                }}
                placeholder="Terisi otomatis dari file skripsi... (Contoh: Ahmad Fauzi Siregar)"
                className="w-full text-sm px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-900 bg-white transition-all shadow-sm"
                required
              />
            </div>

            {/* NIM / NPM */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                <div className="flex items-center space-x-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  <span>NIM / NPM</span>
                </div>
              </label>
              <input
                type="text"
                value={metadata.nim || ''}
                onChange={(e) => setMetadata({ ...metadata, nim: e.target.value })}
                placeholder="Terisi otomatis dari file skripsi... (Contoh: 22382071037)"
                className="w-full text-sm px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-900 bg-white transition-all shadow-sm"
              />
            </div>

            {/* Bulan dan Tahun Cover CD */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Bulan dan Tahun Cover CD</label>
              <input
                type="text"
                value={metadata.bulanTahun || ''}
                onChange={(e) => setMetadata({ ...metadata, bulanTahun: e.target.value })}
                placeholder="Contoh: SEPTEMBER 2026"
                className="w-full text-sm px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-900 bg-white transition-all shadow-sm"
              />
            </div>

            {/* Email (Opsional) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <Mail className="w-3.5 h-3.5 text-blue-600" />
                  <span>Alamat Email</span>
                  <span className="text-slate-400 font-normal text-[11px]">(Opsional)</span>
                </div>
              </label>
              <input
                type="email"
                value={metadata.email}
                onChange={(e) => setMetadata({ ...metadata, email: e.target.value })}
                placeholder="Contoh: ahmad.fauzi@gmail.com (Boleh dikosongkan)"
                className="w-full text-sm px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-900 bg-white transition-all shadow-sm"
              />
            </div>

            {/* Program Studi */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center space-x-1.5">
                <GraduationCap className="w-3.5 h-3.5 text-blue-600" />
                <span>Program Studi (Prodi)</span>
              </label>
              <input
                type="text"
                value={metadata.prodi}
                onChange={(e) => setMetadata({ ...metadata, prodi: e.target.value })}
                placeholder="Contoh: Program Studi Manajemen Bisnis Digital"
                className="w-full text-sm px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-900 bg-white transition-all shadow-sm"
                required
              />
            </div>

            {/* Instansi / Perguruan Tinggi */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center space-x-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-600" />
                <span>Nama Instansi / Universitas</span>
              </label>
              <input
                type="text"
                value={metadata.instansi}
                onChange={(e) => setMetadata({ ...metadata, instansi: e.target.value })}
                placeholder="Contoh: Universitas Negeri Indonesia"
                className="w-full text-sm px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-900 bg-white transition-all shadow-sm"
              />
            </div>

          </div>
        </div>

        {/* Step 3: Journal Formatting Preferences */}
        <div className="p-6 sm:p-8 bg-white">
          <div className="flex items-center space-x-3 mb-6">
            <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 font-bold text-sm flex items-center justify-center border border-blue-100">3</span>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Aturan Seleksi Dokumen Asli</h3>
              <p className="text-xs text-slate-500">Isi, footnote, kutipan wawancara, referensi harus berasal dari skripsi. Jika bagian tidak ada, dibiarkan kosong.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-slate-50/60 p-5 rounded-2xl border border-slate-200/60">
            
            {/* Footnote Option */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                Sistem Rujukan & Catatan Kaki (Bab IV Rujukan)
              </label>
              <select
                value={footnoteStyle}
                onChange={(e: any) => setFootnoteStyle(e.target.value)}
                className="w-full text-sm px-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white text-slate-900 font-medium transition-all shadow-sm"
              >
                <option value="custom_footnote">Standar Pedoman: Catatan Kaki (Footnote di Bawah Halaman)</option>
                <option value="chicago">Gaya Chicago / Turabian Footnote Manual</option>
                <option value="apa">Gaya In-text Citation APA</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                Sesuai Bab IV Bagian B Pedoman KTI: Menggunakan teknik rujukan <b>Catatan Kaki (Footnote)</b> di bagian bawah halaman Word (.docx) dengan font 10pt.
              </p>
            </div>

            {/* Target Length */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                Target Panjang Naskah Artikel (Standar Halaman Word)
              </label>
              <select
                value={targetLengthPages}
                onChange={(e) => setTargetLengthPages(Number(e.target.value))}
                className="w-full text-sm px-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white text-slate-900 font-medium transition-all shadow-sm"
              >
                <option value={16}>Standar Jurnal: 15–17 Halaman (Pusat 16 Halaman)</option>
                <option value={20}>Format Menengah: 18–22 Halaman</option>
                <option value={25}>Format Komprehensif: 23–25 Halaman</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                Panjang artikel dihitung secara komprehensif mengikuti standar pengetikan TNR 12pt, spasi 1.5, dan margin 4-3-3-3 cm.
              </p>
            </div>

          </div>
        </div>

        {/* Step 4: Gemini 3.1 Flash Lite processing */}
        <div className="p-6 sm:p-8 bg-white">
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-blue-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-sm text-blue-900">Pemrosesan AI: Google Gemini 3.1 Flash Lite</h3>
              </div>
              <p className="text-xs mt-1.5 leading-relaxed text-blue-800/90">
                Skripsi diproses secara analitis untuk mengekstrak temuan empiris, data lapangan, kutipan narasumber, dan catatan kaki asli menjadi artikel jurnal ilmiah utuh siap publikasi dan Cover CD Word (.docx).
              </p>
            </div>
            <span className="shrink-0 text-[11px] font-mono font-bold bg-blue-600 text-white px-2.5 py-1 rounded-lg">
              gemini-3.1-flash-lite
            </span>
          </div>

          {/* Multi-stage Progress Bar Indicator (Active during generation) */}
          {isLoading && (
            <div className="mt-8 p-6 bg-slate-900 rounded-2xl text-white shadow-lg border border-slate-800 animate-fade-in">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-5 h-5 text-blue-400 animate-spin" />
                  <span className="font-bold text-sm tracking-wide">
                    Proses Gemini 3.1 Flash Lite (Tahap {generationStatus?.stage || 1}/3)
                  </span>
                </div>
                <span className="font-extrabold text-sm text-blue-300 font-mono">
                  {generationStatus?.percent || 25}%
                </span>
              </div>

              {/* Progress Bar Track */}
              <div className="w-full bg-slate-800 rounded-full h-3 mb-4 overflow-hidden p-0.5 border border-slate-700">
                <div
                  className="bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-500 h-full rounded-full transition-all duration-700 ease-out shadow-sm"
                  style={{ width: `${generationStatus?.percent || 25}%` }}
                />
              </div>

              {/* Status Message */}
              <p className="text-xs text-blue-100 font-medium mb-4 flex items-center space-x-2">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping mr-1" />
                <span>{generationStatus?.message || 'Sedang memproses artikel ilmiah dengan Gemini 3.1 Flash Lite...'}</span>
              </p>

              {/* Stages Checklist Pills */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-medium pt-3 border-t border-slate-800">
                <div
                  className={`px-3 py-2 rounded-xl flex items-center space-x-2 border transition-all ${
                    (generationStatus?.stage || 1) >= 1
                      ? 'bg-blue-500/20 text-blue-200 border-blue-400/40'
                      : 'bg-slate-800/50 text-slate-500 border-slate-800'
                  }`}
                >
                  <span className="font-bold">Tahap 1:</span>
                  <span>Pendahuluan & Metode</span>
                </div>

                <div
                  className={`px-3 py-2 rounded-xl flex items-center space-x-2 border transition-all ${
                    (generationStatus?.stage || 1) >= 2
                      ? 'bg-blue-500/20 text-blue-200 border-blue-400/40'
                      : 'bg-slate-800/50 text-slate-500 border-slate-800'
                  }`}
                >
                  <span className="font-bold">Tahap 2:</span>
                  <span>Hasil & Pembahasan</span>
                </div>

                <div
                  className={`px-3 py-2 rounded-xl flex items-center space-x-2 border transition-all ${
                    (generationStatus?.stage || 1) >= 3
                      ? 'bg-blue-500/20 text-blue-200 border-blue-400/40'
                      : 'bg-slate-800/50 text-slate-500 border-slate-800'
                  }`}
                >
                  <span className="font-bold">Tahap 3:</span>
                  <span>Kesimpulan & Footnote</span>
                </div>
              </div>
            </div>
          )}

          {/* Submit Action */}
          <div className="mt-8 flex justify-end">
            <button
              type="submit"
              disabled={isLoading || uploadingFile}
              className={`w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-sm text-white shadow-md transition-all duration-200 flex items-center justify-center space-x-2.5 ${
                isLoading || uploadingFile
                  ? 'bg-slate-400 cursor-not-allowed'
                  : 'bg-blue-700 hover:bg-blue-800 shadow-blue-700/25 hover:shadow-blue-800/30 transform hover:-translate-y-0.5'
              }`}
            >
              {isLoading ? (
                <>
                  <Sparkles className="w-5 h-5 animate-spin text-blue-200" />
                  <span>Sedang Memproses Artikel Ilmiah (Gemini 3.1 Flash Lite)...</span>
                </>
              ) : (
                <>
                  <span>Mulai Proses Artikel (Gemini 3.1 Flash Lite) + Cover CD</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>

        </div>

      </form>
    </div>
  );
};
