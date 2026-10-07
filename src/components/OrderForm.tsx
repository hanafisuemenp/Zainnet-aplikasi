import React, { useState, useMemo, ChangeEvent, useEffect } from 'react';
import {
  BookOpen,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  UploadCloud,
  FileText,
  Trash2,
  Sparkles,
  Layers,
  ArrowRight,
  ShieldCheck,
  Calculator,
  Phone,
  User,
  CreditCard,
  CheckSquare,
  Square,
  Lock,
  Wallet,
  Send
} from 'lucide-react';
import {
  UIN_MADURA_FACULTIES,
  DURATION_OPTIONS,
  EXTRA_SERVICES,
  getCoverColorInfo,
  ADMIN_WHATSAPP
} from '../data/uinMaduraData';
import { DurationKey, OrderRecord, UploadedFileInfo, TransactionStatus, ExtraServiceOption, CoverType } from '../types';
import {
  formatIDR,
  formatDateToCustom,
  formatDisplayDate,
  computePickupDate,
  generateOrderCode,
  calculateOrderPricing
} from '../utils/pricing';

interface OrderFormProps {
  onOrderCreated: (order: OrderRecord) => void;
}

export const OrderForm: React.FC<OrderFormProps> = ({ onOrderCreated }) => {
  // Form state
  const [studentName, setStudentName] = useState('');
  const [fakultasId, setFakultasId] = useState(UIN_MADURA_FACULTIES[0].id);
  const [prodi, setProdi] = useState(UIN_MADURA_FACULTIES[0].prodis[0]);
  const [whatsapp, setWhatsapp] = useState('');
  const [coverType, setCoverType] = useState<CoverType>('hard_cover');
  const [coverCount, setCoverCount] = useState<number>(3);
  const [durationKey, setDurationKey] = useState<DurationKey>('3_day');
  
  // Selected extra services
  const [selectedServices, setSelectedServices] = useState<string[]>(['cd', 'skek', 'pisah_perpus']);
  
  const [transactionStatus, setTransactionStatus] = useState<TransactionStatus>('Bayar Sekarang');
  const [customDpAmount, setCustomDpAmount] = useState<number>(0);

  // Auto-sync customDpAmount when status changes to DP
  // useEffect moved after calculation


  // Tanggal Masuk otomatis
  const [orderDate] = useState<string>(() => formatDateToCustom(new Date()));

  // File Upload state
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileInfo[]>([]);
  const [pageCount, setPageCount] = useState<number>(0);
  const [uploadProgressMessage, setUploadProgressMessage] = useState<string | null>(null);

  // Validation errors
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Active selected faculty object
  const currentFaculty = useMemo(() => {
    return UIN_MADURA_FACULTIES.find((f) => f.id === fakultasId) || UIN_MADURA_FACULTIES[0];
  }, [fakultasId]);

  // Color computation:
  // Fatar: Hijau | Febi: Kuning | USULUDDIN: Biru | Fasya: HKI -> Merah, SYARIAH/HTN -> Marron
  const coverColorInfo = useMemo(() => {
    return getCoverColorInfo(fakultasId, prodi);
  }, [fakultasId, prodi]);

  const handleFacultyChange = (newFacId: string) => {
    setFakultasId(newFacId);
    const faculty = UIN_MADURA_FACULTIES.find((f) => f.id === newFacId);
    if (faculty && faculty.prodis.length > 0) {
      setProdi(faculty.prodis[0]);
    }
  };

  // Check if current prodi matches special services
  const isPiaudProdi = useMemo(() => {
    const p = prodi.toLowerCase();
    return p.includes('piaud') || p.includes('anak usia dini');
  }, [prodi]);

  const isIpaProdi = useMemo(() => {
    const p = prodi.toLowerCase();
    return p.includes('ipa') || p.includes('tipa') || p.includes('pengetahuan alam');
  }, [prodi]);

  // Dynamic filter or sort of services:
  // General services always shown;
  // Special prodi services (DUMMY BOOK for PIAUD, Cetak A5 for IPA) shown with distinctive highlight
  const visibleServices = useMemo(() => {
    return EXTRA_SERVICES.map((s) => {
      let isRecommendedForProdi = false;
      let isRestricted = false;

      if (s.id === 'dummy_book') {
        isRecommendedForProdi = isPiaudProdi;
      }
      if (s.id === 'cetak_a5_ipa') {
        isRecommendedForProdi = isIpaProdi;
      }

      return {
        ...s,
        isRecommendedForProdi,
        isRestricted,
      };
    });
  }, [isPiaudProdi, isIpaProdi]);

  // Determine if file upload is required dynamically:
  // artikel (pembuatan artikel), dummy_book, cetak_a5_ipa, pisah_perpus
  const isFileUploadRequired = useMemo(() => {
    return (
      selectedServices.includes('artikel') ||
      selectedServices.includes('dummy_book') ||
      selectedServices.includes('pisah_perpus') ||
      selectedServices.includes('cetak_a5_ipa')
    );
  }, [selectedServices]);

  const fileRequiredServices = useMemo(() => {
    const list: string[] = [];
    if (selectedServices.includes('artikel')) list.push('Artikel / Pembuatan Artikel');
    if (selectedServices.includes('dummy_book')) list.push('Dummy Book');
    if (selectedServices.includes('cetak_a5_ipa')) list.push('Cetak Skripsi A5 Bolak-Balik');
    if (selectedServices.includes('pisah_perpus')) list.push('Pisah-pisah File untuk Perpus');
    return list;
  }, [selectedServices]);

  // Duration option
  const selectedDuration = useMemo(() => {
    return DURATION_OPTIONS.find((d) => d.key === durationKey) || DURATION_OPTIONS[2];
  }, [durationKey]);

  // Tanggal Pengambilan: "Tanggal Masuk + Opsi Durasi Pengerjaan"
  const pickupDate = useMemo(() => {
    try {
      const [datePart, timePart] = orderDate.split(' ');
      const [y, m, d] = datePart.split('-');
      const [hh, mm] = (timePart || '12:00').split(':');
      const baseDate = new Date(
        parseInt(y),
        parseInt(m) - 1,
        parseInt(d),
        parseInt(hh),
        parseInt(mm)
      );
      return computePickupDate(baseDate, selectedDuration.days);
    } catch {
      return computePickupDate(new Date(), selectedDuration.days);
    }
  }, [orderDate, selectedDuration.days]);

  // Live Calculator Total Harga (Memperhitungkan harga sampul khusus Fakultas Syariah)
  const calculation = useMemo(() => {
    const curFac = UIN_MADURA_FACULTIES.find((f) => f.id === fakultasId);
    return calculateOrderPricing(
      coverCount,
      durationKey,
      selectedServices,
      pageCount,
      coverType,
      curFac ? curFac.name : fakultasId
    );
  }, [coverCount, durationKey, selectedServices, pageCount, coverType, fakultasId]);

  // Auto-sync customDpAmount when status changes to DP
  useEffect(() => {
    if (transactionStatus === 'DP' && customDpAmount === 0) {
      setCustomDpAmount(calculation.standardDp);
    }
  }, [transactionStatus, calculation.standardDp]);

  const toggleService = (serviceId: string) => {
    setSelectedServices((prev) => {
      if (prev.includes(serviceId)) {
        return prev.filter((id) => id !== serviceId);
      } else {
        return [...prev, serviceId];
      }
    });
  };

  // "Bisa pilih semua" feature
  const handleSelectAllServices = () => {
    const idsToSelect: string[] = ['artikel', 'cd', 'skek', 'pisah_perpus'];
    if (isPiaudProdi) idsToSelect.push('dummy_book');
    if (isIpaProdi) idsToSelect.push('cetak_a5_ipa');
    setSelectedServices(idsToSelect);
  };

  const handleClearAllServices = () => {
    setSelectedServices([]);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadProgressMessage('Memproses berkas naskah skripsi...');
    const newFiles: UploadedFileInfo[] = [];

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      const category = selectedServices.includes('pisah_perpus')
        ? 'Perpustakaan & Repositori'
        : selectedServices.includes('cetak_a5_ipa')
        ? 'Cetak A5 IPA'
        : 'Artikel';

      reader.onload = (uploadEvent) => {
        newFiles.push({
          name: file.name,
          size: file.size,
          type: file.type || 'application/pdf',
          uploadedAt: formatDateToCustom(new Date()),
          serviceCategory: category,
          dataUrl: typeof uploadEvent.target?.result === 'string' ? uploadEvent.target.result : undefined,
        });

        if (newFiles.length === files.length) {
          setUploadedFiles((prev) => [...prev, ...newFiles]);
          setUploadProgressMessage(null);
        }
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: { [key: string]: string } = {};

    if (!studentName.trim()) {
      newErrors.studentName = 'Nama Mahasiswa wajib diisi.';
    }
    if (!whatsapp.trim()) {
      newErrors.whatsapp = 'Nomor WhatsApp wajib diisi untuk penerimaan nota.';
    } else if (!/^[0-9+ -]{8,16}$/.test(whatsapp.trim())) {
      newErrors.whatsapp = 'Nomor WhatsApp tidak valid (contoh: 81234567890).';
    }

    if (!coverCount || coverCount < 1) {
      newErrors.coverCount = 'Jumlah sampul minimal 1 eksemplar.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      window.scrollTo({ top: 100, behavior: 'smooth' });
      return;
    }

    setErrors({});

    const orderId = generateOrderCode();
    const isDp = transactionStatus === 'DP';
    const isBayarNanti = transactionStatus === 'Bayar Nanti';
    const dpAmount = isDp ? customDpAmount : transactionStatus === 'LUNAS' ? calculation.totalCost : 0;
    const remainingAmount = isDp
      ? calculation.totalCost - dpAmount
      : (isBayarNanti || transactionStatus === 'Bayar Sekarang')
      ? calculation.totalCost
      : 0;

    const orderRecord: OrderRecord = {
      orderId,
      studentName: studentName.trim(),
      fakultas: currentFaculty.name,
      prodi: prodi,
      coverColor: coverColorInfo.name,
      whatsapp: whatsapp.trim(),
      coverType: coverType,
      coverCount: calculation.count,
      durationKey: durationKey,
      durationLabel: coverType === 'soft_cover' ? `Soft Cover (${selectedDuration.label})` : selectedDuration.label,
      durationDays: selectedDuration.days,
      pricePerCover: calculation.pricePerCover,
      coversSubtotal: calculation.coversSubtotal,
      selectedServices: selectedServices,
      servicesBreakdown: calculation.servicesBreakdown,
      servicesSubtotal: calculation.servicesSubtotal,
      totalCost: calculation.totalCost,
      orderDate: orderDate,
      pickupDate: pickupDate,
      uploadedFiles: uploadedFiles,
      status: 'Menunggu',
      transactionStatus: transactionStatus,
      dpAmount: dpAmount,
      remainingAmount: remainingAmount,
      adminConfirmed: false,
      createdAt: Date.now(),
    };

    onOrderCreated(orderRecord);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Intro Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Sistem Resmi Percetakan Skripsi UIN Madura
            </div>
            <h2 className="text-2xl font-black text-slate-900 mt-1">
              Formulir Pemesanan Hard Cover Skripsi
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Nota otomatis dibuat dalam bentuk format siap cetak / JPG dan diteruskan langsung ke WhatsApp Admin (<strong>{ADMIN_WHATSAPP}</strong>).
            </p>
          </div>

          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200/80 px-4 py-2.5 rounded-xl shrink-0">
            <div className="w-10 h-10 rounded-lg bg-emerald-700 text-white flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] text-emerald-800 font-medium">Tanggal Masuk (Live):</div>
              <div className="text-sm font-bold text-emerald-950 font-mono">
                {orderDate} WIB
              </div>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* LEFT COLUMN: FORM INPUTS (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* SECTION 1: DATA MAHASISWA & FAKULTAS (NIM DIHAPUS) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-2.5 pb-4 mb-5 border-b border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                1
              </div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <User className="w-5 h-5 text-emerald-600" />
                Data Pemesan & Akademik UIN Madura
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Nama Mahasiswa */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Nama Mahasiswa <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={studentName}
                  onChange={(e) => {
                    setStudentName(e.target.value);
                    if (errors.studentName) setErrors({ ...errors, studentName: '' });
                  }}
                  placeholder="Contoh: Achmad Farhan"
                  className={`w-full px-4 py-2.5 rounded-xl border ${
                    errors.studentName ? 'border-rose-400 bg-rose-50/30' : 'border-slate-300'
                  } focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 font-medium text-sm`}
                />
                {errors.studentName && (
                  <p className="mt-1 text-xs text-rose-600 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> {errors.studentName}
                  </p>
                )}
              </div>

              {/* No WhatsApp */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  No. WhatsApp <span className="text-rose-500">*</span>
                </label>
                <div className="relative flex">
                  <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-slate-300 bg-slate-100 text-slate-600 text-sm font-medium">
                    <Phone className="w-3.5 h-3.5 mr-1" />
                    +62
                  </span>
                  <input
                    type="tel"
                    required
                    value={whatsapp}
                    onChange={(e) => {
                      let val = e.target.value;
                      if (val.startsWith('0')) val = val.substring(1);
                      if (val.startsWith('62')) val = val.substring(2);
                      setWhatsapp(val);
                      if (errors.whatsapp) setErrors({ ...errors, whatsapp: '' });
                    }}
                    placeholder="81234567890"
                    className={`w-full px-4 py-2.5 rounded-r-xl border ${
                      errors.whatsapp ? 'border-rose-400 bg-rose-50/30' : 'border-slate-300'
                    } focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 font-medium text-sm`}
                  />
                </div>
                {errors.whatsapp && (
                  <p className="mt-1 text-xs text-rose-600 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> {errors.whatsapp}
                  </p>
                )}
              </div>

              {/* Fakultas Dropdown */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Fakultas (UIN Madura) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={fakultasId}
                  onChange={(e) => handleFacultyChange(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900 text-sm font-semibold"
                >
                  {UIN_MADURA_FACULTIES.map((fac) => (
                    <option key={fac.id} value={fac.id}>
                      {fac.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Prodi Dropdown */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Program Studi (Prodi) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={prodi}
                  onChange={(e) => setProdi(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900 text-sm font-medium"
                >
                  {currentFaculty.prodis.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* DYNAMIC COVER COLOR BANNER */}
            <div className={`mt-5 p-3.5 rounded-xl border flex items-center justify-between gap-3 ${coverColorInfo.lightBg}`}>
              <div className="flex items-center gap-2.5">
                <span
                  className="w-5 h-5 rounded-full border border-black/20 shadow-sm shrink-0"
                  style={{ backgroundColor: coverColorInfo.hex }}
                ></span>
                <div>
                  <div className="text-xs font-bold">
                    Standar Warna Sampul Fakultas: <span className="underline font-black">{coverColorInfo.name}</span>
                  </div>
                  <div className="text-[11px] opacity-80">
                    FATAR (Hijau) &bull; FEBI (Kuning) &bull; USULUDDIN (Biru) &bull; FASYA HKI (Merah) &bull; FASYA HES/HTN (Marron)
                  </div>
                </div>
              </div>
              <span className={`text-[11px] px-2.5 py-1 rounded-full font-bold shadow-xs shrink-0 ${coverColorInfo.badgeBg}`}>
                Sampul {coverColorInfo.name}
              </span>
            </div>

            {/* KHUSUS PRODI PIAUD / IPA NOTIFICATION */}
            {isPiaudProdi && (
              <div className="mt-3 p-3 rounded-xl bg-purple-50 border border-purple-200 text-xs text-purple-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                <span>
                  <strong>Terdeteksi Mahasiswa PIAUD:</strong> Layanan tambahan <strong>DUMMY BOOK</strong> otomatis tersedia di bagian layanan tambahan di bawah!
                </span>
              </div>
            )}
            {isIpaProdi && (
              <div className="mt-3 p-3 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-600 shrink-0" />
                <span>
                  <strong>Terdeteksi Mahasiswa Tadris IPA:</strong> Layanan khusus <strong>Cetak skripsi A5 bolak balik</strong> otomatis tersedia untuk prodi Anda!
                </span>
              </div>
            )}
          </div>

          {/* SECTION 2: JENIS JILID, JUMLAH SAMPUL & DURASI PENGERJAAN */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-2.5 pb-4 mb-5 border-b border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                2
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-emerald-600" />
                  Jenis Jilid, Jumlah Eksemplar & Durasi Pengerjaan
                </h3>
                <p className="text-xs text-slate-500">
                  Pilih model jilid (Hard Cover atau Soft Cover) dan tentukan waktu pengerjaan.
                </p>
              </div>
            </div>

            {/* Pilihan Jenis Jilid */}
            <div className="mb-6">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                Pilih Jenis Jilid <span className="text-rose-500">*</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div
                  onClick={() => setCoverType('hard_cover')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition flex items-center justify-between ${
                    coverType === 'hard_cover'
                      ? 'border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-500'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🎓</span>
                    <div>
                      <div className="font-extrabold text-slate-900 text-base">
                        Hard Cover
                      </div>
                      <div className="font-bold text-emerald-800 text-xs font-mono mt-0.5">
                        Rp 30.000 - Rp 50.000 / buku
                      </div>
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="coverType"
                    checked={coverType === 'hard_cover'}
                    onChange={() => setCoverType('hard_cover')}
                    className="w-5 h-5 text-emerald-600"
                  />
                </div>

                <div
                  onClick={() => setCoverType('soft_cover')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition flex items-center justify-between ${
                    coverType === 'soft_cover'
                      ? 'border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-500'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📘</span>
                    <div>
                      <div className="font-extrabold text-slate-900 text-base">
                        Soft Cover
                      </div>
                      <div className="font-bold text-emerald-800 text-xs font-mono mt-0.5">
                        Rp 15.000 / buku
                      </div>
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="coverType"
                    checked={coverType === 'soft_cover'}
                    onChange={() => setCoverType('soft_cover')}
                    className="w-5 h-5 text-emerald-600"
                  />
                </div>
              </div>
            </div>

            {/* Stepper Jumlah Sampul */}
            <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <label className="block text-sm font-bold text-slate-900">
                  Jumlah {coverType === 'soft_cover' ? 'Soft Cover' : 'Hard Cover'} yang dipesan <span className="text-rose-500">*</span>
                </label>
                <p className="text-xs text-slate-500 mt-0.5">
                  Minimal 1 eksemplar. Standar mahasiswa: 3 - 4 eksemplar.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCoverCount((prev) => Math.max(1, prev - 1))}
                  className="w-10 h-10 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-black text-lg flex items-center justify-center shadow-xs transition"
                >
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  value={coverCount}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 1;
                    setCoverCount(Math.max(1, val));
                  }}
                  className="w-16 h-10 text-center rounded-xl border border-slate-300 font-bold text-slate-900 text-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setCoverCount((prev) => prev + 1)}
                  className="w-10 h-10 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-black text-lg flex items-center justify-center shadow-xs transition"
                >
                  +
                </button>
                <span className="text-xs font-semibold text-slate-600 ml-1">Eksemplar</span>
              </div>
            </div>

            {/* Opsi Durasi Pengerjaan */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                Opsi Durasi Pengerjaan <span className="text-rose-500">*</span>
              </label>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {DURATION_OPTIONS.map((opt) => {
                  const isSelected = durationKey === opt.key;
                  const isSyariah = fakultasId === 'fasya';
                  const effectiveCoverPrice = isSyariah && opt.key === '3_day' && coverType !== 'soft_cover' ? 32000 : opt.pricePerCover;
                  let tempDate = '';
                  try {
                    const [dp] = orderDate.split(' ');
                    const [y, m, d] = dp.split('-');
                    const b = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
                    b.setDate(b.getDate() + opt.days);
                    tempDate = `${b.getDate()}/${b.getMonth() + 1}`;
                  } catch {
                    tempDate = `+${opt.days} Hari`;
                  }

                  return (
                    <label
                      key={opt.key}
                      onClick={() => setDurationKey(opt.key)}
                      className={`relative flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50/50 shadow-sm ring-1 ring-emerald-500'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {opt.tag}
                        </span>
                        <input
                          type="radio"
                          name="durationKey"
                          checked={isSelected}
                          onChange={() => setDurationKey(opt.key)}
                          className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                        />
                      </div>

                      <div className="font-bold text-slate-900 text-base mb-1">
                        {opt.label}
                      </div>

                      <div className="text-emerald-700 font-extrabold text-lg mb-1">
                        {formatIDR(effectiveCoverPrice)}
                        <span className="text-xs font-normal text-slate-500"> / sampul</span>
                      </div>

                      {isSyariah && opt.key === '3_day' && coverType !== 'soft_cover' && (
                        <div className="mb-2">
                          <span className="inline-block text-[10px] font-bold text-amber-800 bg-amber-100/90 border border-amber-300 px-2 py-0.5 rounded-md">
                            ⭐ Khusus Fakultas Syariah: Rp 32.000 / jilid
                          </span>
                        </div>
                      )}

                      <p className="text-xs text-slate-500 mb-3 flex-1 leading-relaxed">
                        {isSyariah && opt.key === '3_day' && coverType !== 'soft_cover'
                          ? 'Paket standar 3 hari khusus Fakultas Syariah (+2rb sampul marron khusus). Harga resmi: Rp 32.000 / sampul.'
                          : opt.description}
                      </p>

                      <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs">
                        <span className="text-slate-500">Siap Ambil:</span>
                        <span className="font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                          {tempDate} WIB
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* SECTION 3: LAYANAN TAMBAHAN (TERMASUK DUMMY BOOK PIAUD & A5 IPA) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 relative overflow-hidden">
            {/* Promo banner header */}
            <div className="bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 -mx-6 -mt-6 px-6 py-3 text-emerald-950 font-bold text-xs flex flex-wrap items-center justify-between gap-2 shadow-xs mb-5">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-950" />
                <span>PROMO PAKET WISUDA LENGKAP: Solusi tuntas bebas ribet antre perpustakaan & yudisium!</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllServices}
                  className="bg-emerald-950 hover:bg-black text-amber-300 px-3 py-1 rounded-lg text-xs font-black transition flex items-center gap-1 cursor-pointer"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Pilih Semua Layanan</span>
                </button>
                {selectedServices.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllServices}
                    className="bg-white/80 hover:bg-white text-slate-800 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                  3
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-emerald-600" />
                    Opsi Layanan Tambahan (Bisa Pilih Semua)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Termasuk layanan umum & layanan khusus per prodi (PIAUD & IPA).
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                {selectedServices.length} Dipilih
              </span>
            </div>

            {/* Checkbox cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {visibleServices.map((serv) => {
                const isChecked = selectedServices.includes(serv.id);
                const isHighlightedProdi =
                  (serv.id === 'dummy_book' && isPiaudProdi) ||
                  (serv.id === 'cetak_a5_ipa' && isIpaProdi);

                return (
                  <label
                    key={serv.id}
                    onClick={() => toggleService(serv.id)}
                    className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all relative ${
                      isChecked
                        ? 'border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-400'
                        : isHighlightedProdi
                        ? 'border-amber-400 bg-amber-50/40 ring-1 ring-amber-300'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleService(serv.id)}
                      className="mt-1 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                    />

                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                          {serv.label}
                          {isHighlightedProdi && (
                            <span className="text-[10px] font-black bg-amber-400 text-emerald-950 px-1.5 py-0.2 rounded">
                              PRODI ANDA
                            </span>
                          )}
                        </span>
                        <span className="text-xs font-extrabold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full shrink-0">
                          {formatIDR(serv.price)}
                        </span>
                      </div>

                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        {serv.promoTag && (
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-100/90 px-2 py-0.2 rounded-md">
                            {serv.promoTag}
                          </span>
                        )}
                        {serv.specialProdiNote && (
                          <span className="text-[10px] font-bold text-purple-800 bg-purple-100 px-2 py-0.2 rounded-md">
                            {serv.specialProdiNote}
                          </span>
                        )}
                        {serv.requiresFile && (
                          <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100/70 px-1.5 py-0.2 rounded-md flex items-center gap-1">
                            <UploadCloud className="w-3 h-3" /> Memerlukan File
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                        {serv.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* SECTION 4: DYNAMIC FILE UPLOAD */}
          {isFileUploadRequired ? (
            <div className="bg-gradient-to-br from-amber-50/50 to-emerald-50/60 rounded-2xl border-2 border-emerald-400 shadow-sm p-6 transition-all duration-300 animate-fadeIn">
              <div className="flex items-start justify-between gap-3 pb-4 mb-4 border-b border-emerald-200/80">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow">
                    📁
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      Upload File Naskah Skripsi
                      <span className="text-xs font-bold bg-emerald-700 text-white px-2 py-0.5 rounded-full">
                        Otomatis Muncul
                      </span>
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Bagian ini aktif karena Anda mencentang:{' '}
                      <strong className="text-emerald-950">{fileRequiredServices.join(' & ')}</strong>
                    </p>
                  </div>
                </div>
              </div>

              {/* Page Count input if special service selected */}
              {isFileUploadRequired && (
                <div className="mt-4 p-4 bg-emerald-50/50 rounded-xl border border-emerald-200">
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Masukkan Jumlah Halaman Skripsi (untuk kalkulasi harga layanan khusus) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="80"
                    max="180"
                    value={pageCount}
                    onChange={(e) => setPageCount(parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-emerald-500"
                    placeholder="Contoh: 120"
                  />
                </div>
              )}

              {/* Upload Dropzone */}
              <div className="relative border-2 border-dashed border-emerald-400 rounded-2xl p-6 text-center bg-white hover:bg-emerald-50/20 transition cursor-pointer group">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.zip,.rar"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center group-hover:scale-110 transition">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <div className="text-sm font-bold text-slate-800">
                    Klik untuk memilih berkas naskah skripsi atau seret ke sini
                  </div>
                  <p className="text-xs text-slate-500 max-w-md">
                    Format: <strong>PDF, DOCX, Word, ZIP</strong>. Digunakan untuk format cetak artikel & pemisahan per bab repositori perpustakaan UIN Madura.
                  </p>
                </div>
              </div>

              {uploadProgressMessage && (
                <div className="mt-3 text-xs text-emerald-800 font-medium flex items-center gap-2 bg-emerald-100/70 p-2.5 rounded-lg">
                  <div className="w-3.5 h-3.5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                  {uploadProgressMessage}
                </div>
              )}

              {/* Uploaded Files List */}
              {uploadedFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Berkas Naskah Terunggah ({uploadedFiles.length}):
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {uploadedFiles.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200 shadow-2xs text-xs"
                      >
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                          <div className="truncate">
                            <div className="font-bold text-slate-800 truncate" title={file.name}>
                              {file.name}
                            </div>
                            <div className="text-slate-400 text-[11px]">
                              {(file.size / (1024 * 1024)).toFixed(2)} MB • {file.serviceCategory}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeFile(idx)}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded transition"
                          title="Hapus berkas"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-emerald-50/70 border border-emerald-300 rounded-2xl p-4 text-xs text-emerald-950 flex items-start gap-3 shadow-xs">
              <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">
                ✓
              </div>
              <div className="space-y-1">
                <div className="font-bold text-slate-900 text-sm">
                  Bagian Upload File Dilewati (Khusus Jilid Saja)
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Mahasiswa yang <strong>hanya memesan jilid Hard Cover / Soft Cover</strong> tidak perlu mengunggah file. Cukup bawa naskah skripsi fisik Anda ke loket ZAIN.NET saat konfirmasi.
                </p>
                <div className="text-[11px] text-emerald-800 font-semibold bg-emerald-100/70 px-2.5 py-1 rounded-md inline-block">
                  📁 Formulir upload file hanya muncul jika Anda memilih: <strong>Artikel, Dummy Book, Cetak A5, atau Pisah-pisah File</strong>.
                </div>
              </div>
            </div>
          )}

          {/* SECTION 5: STATUS TRANSAKSI & PEMBAYARAN */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-2.5 pb-4 mb-5 border-b border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                4
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-emerald-600" />
                  Status Transaksi & Pembayaran
                </h3>
                <p className="text-xs text-slate-500">
                  Pilih status transaksi. Pembayaran DP atau Lunas wajib diverifikasi oleh Admin Loket ({ADMIN_WHATSAPP}).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-4">
              {/* Option 1: Bayar Sekarang */}
              <label
                onClick={() => setTransactionStatus('Bayar Sekarang')}
                className={`p-4 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                  transactionStatus === 'Bayar Sekarang'
                    ? 'border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-500'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                      Transfer / QRIS
                    </span>
                    <input
                      type="radio"
                      name="transStatus"
                      checked={transactionStatus === 'Bayar Sekarang'}
                      onChange={() => setTransactionStatus('Bayar Sekarang')}
                      className="w-4 h-4 text-emerald-600"
                    />
                  </div>
                  <div className="font-extrabold text-slate-900 text-sm mb-1">
                    Bayar Sekarang
                  </div>
                  <p className="text-xs text-slate-500">
                    Instruksi pembayaran lewat Transfer Bank / QRIS loket saat pesanan dibuat.
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200 text-xs font-semibold text-emerald-800 font-mono">
                  {formatIDR(calculation.totalCost)}
                </div>
              </label>

              {/* Option 2: DP */}
              <label
                onClick={() => setTransactionStatus('DP')}
                className={`p-4 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                  transactionStatus === 'DP'
                    ? 'border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-500'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                      Uang Muka
                    </span>
                    <input
                      type="radio"
                      name="transStatus"
                      checked={transactionStatus === 'DP'}
                      onChange={() => setTransactionStatus('DP')}
                      className="w-4 h-4 text-emerald-600"
                    />
                  </div>
                  <div className="font-extrabold text-slate-900 text-sm mb-1">
                    DP (Uang Muka)
                  </div>
                  <p className="text-xs text-slate-500 mb-1">
                    Bayar uang muka terlebih dahulu, sisa dilunasi saat naskah diambil.
                  </p>
                  <input
                    type="number"
                    value={customDpAmount}
                    onChange={(e) => setCustomDpAmount(Number(e.target.value))}
                    className="w-full px-2 py-1 mt-1 rounded border border-slate-300 text-xs font-mono font-bold"
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Nominal DP"
                  />
                </div>
                <div className="mt-2 pt-2 border-t border-slate-200 text-[11px] font-semibold text-amber-900 font-mono">
                  Sisa: {formatIDR(Math.max(0, calculation.totalCost - (customDpAmount || 0)))}
                </div>
              </label>

              {/* Option 3: LUNAS */}
              <label
                onClick={() => setTransactionStatus('LUNAS')}
                className={`p-4 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                  transactionStatus === 'LUNAS'
                    ? 'border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-500'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                      Bayar Penuh
                    </span>
                    <input
                      type="radio"
                      name="transStatus"
                      checked={transactionStatus === 'LUNAS'}
                      onChange={() => setTransactionStatus('LUNAS')}
                      className="w-4 h-4 text-emerald-600"
                    />
                  </div>
                  <div className="font-extrabold text-slate-900 text-sm mb-1">
                    LUNAS
                  </div>
                  <p className="text-xs text-slate-500">
                    Pembayaran penuh di awal untuk kemudahan proses langsung ambil tanpa antre bayar.
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200 text-xs font-semibold text-emerald-800 font-mono">
                  Lunas: {formatIDR(calculation.totalCost)}
                </div>
              </label>

              {/* Option 4: Bayar Nanti di Loket */}
              <label
                onClick={() => setTransactionStatus('Bayar Nanti')}
                className={`p-4 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                  transactionStatus === 'Bayar Nanti'
                    ? 'border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-500'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-indigo-800 bg-indigo-100 px-2 py-0.5 rounded">
                      Bayar di Loket
                    </span>
                    <input
                      type="radio"
                      name="transStatus"
                      checked={transactionStatus === 'Bayar Nanti'}
                      onChange={() => setTransactionStatus('Bayar Nanti')}
                      className="w-4 h-4 text-emerald-600"
                    />
                  </div>
                  <div className="font-extrabold text-slate-900 text-sm mb-1">
                    Bayar Nanti
                  </div>
                  <p className="text-xs text-slate-500">
                    Dapatkan bukti nota pemesanan sekarang, dan lakukan pembayaran saat mengambil hasil jilid.
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200 text-xs font-semibold text-indigo-800 font-mono">
                  Bayar Saat Ambil
                </div>
              </label>
            </div>

            <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-300 text-xs text-amber-950 flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">Info Bukti Pembayaran & Pengambilan:</strong>
                <p className="mt-0.5 text-amber-900">
                  Setelah mengirim pesanan, Anda akan mendapatkan <strong>Struk Pembayaran / Bukti Transaksi Resmi</strong> yang dapat <strong>diunduh (download)</strong> sebagai bukti sah saat mengambil naskah di loket percetakan.
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: LIVE CALCULATOR & SUMMARY CARD */}
        <div className="lg:col-span-4">
          <div className="sticky top-24 space-y-5">
            
            {/* CALCULATOR CARD */}
            <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-emerald-950 text-white rounded-2xl shadow-xl p-6 border border-emerald-700/40 relative overflow-hidden">
              <div className="flex items-center justify-between pb-4 border-b border-emerald-800/80 mb-4">
                <div className="flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-amber-400" />
                  <span className="font-extrabold text-base tracking-wide text-white">
                    Live Kalkulator Biaya
                  </span>
                </div>
                <span className="text-[11px] font-semibold bg-amber-400 text-emerald-950 px-2 py-0.5 rounded-full">
                  Real-time
                </span>
              </div>

              {/* Rincian Jilid */}
              <div className="space-y-3 text-sm">
                <div className="flex items-start justify-between gap-2 text-slate-300">
                  <div>
                    <div className="font-bold text-white">
                      {coverType === 'soft_cover' ? 'Soft Cover' : 'Hard Cover'} ({calculation.count} buku)
                    </div>
                    <div className="text-xs text-emerald-300">
                      {coverType === 'soft_cover' ? 'Soft Cover' : `${selectedDuration.label} • Sampul ${coverColorInfo.name}`}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {formatIDR(calculation.pricePerCover)} x {calculation.count}
                    </div>
                  </div>
                  <div className="font-bold text-white font-mono">
                    {formatIDR(calculation.coversSubtotal)}
                  </div>
                </div>

                {/* Rincian Layanan Tambahan */}
                <div className="pt-3 border-t border-emerald-800/60">
                  <div className="text-xs font-semibold text-emerald-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                    <span>Layanan Tambahan:</span>
                    <span>{calculation.servicesBreakdown.length} item</span>
                  </div>

                  {calculation.servicesBreakdown.length > 0 ? (
                    <div className="space-y-2">
                      {calculation.servicesBreakdown.map((s) => (
                        <div key={s.id} className="flex items-center justify-between text-xs text-slate-300">
                          <span className="truncate pr-2">• {s.label}</span>
                          <span className="font-mono text-emerald-200 shrink-0 font-medium">
                            {formatIDR(s.price)}
                          </span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between text-xs pt-1 text-slate-400">
                        <span>Subtotal Layanan:</span>
                        <span className="font-mono font-semibold text-slate-200">
                          {formatIDR(calculation.servicesSubtotal)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 italic">
                      Tidak ada layanan tambahan dipilih
                    </div>
                  )}
                </div>

                {/* Status Transaksi Summary */}
                <div className="pt-3 border-t border-emerald-800/60 text-xs text-slate-300">
                  <div className="flex items-center justify-between">
                    <span>Status Transaksi:</span>
                    <span className="font-bold text-amber-300">{transactionStatus}</span>
                  </div>
                  {transactionStatus === 'DP' && (
                    <div className="flex items-center justify-between mt-1 text-amber-200">
                      <span>Uang Muka (DP):</span>
                      <span className="font-bold font-mono">{formatIDR(customDpAmount || calculation.standardDp)}</span>
                    </div>
                  )}
                  {transactionStatus === 'Bayar Nanti' && (
                    <div className="flex items-center justify-between mt-1 text-indigo-300">
                      <span>Bayar di Loket:</span>
                      <span className="font-bold font-mono">{formatIDR(calculation.totalCost)}</span>
                    </div>
                  )}
                </div>

                {/* TOTAL HARGA */}
                <div className="pt-4 border-t-2 border-emerald-600/80 mt-4">
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-sm font-bold text-slate-200">TOTAL HARGA:</span>
                    <span className="text-2xl font-black text-amber-400 font-mono tracking-tight">
                      {formatIDR(calculation.totalCost)}
                    </span>
                  </div>
                  <div className="text-[11px] text-emerald-300/80 italic text-right">
                    Total = (Harga Jilid x Eksemplar) + Layanan
                  </div>
                </div>
              </div>

              {/* HIGHLIGHT JADWAL PENGAMBILAN */}
              <div className="mt-5 p-4 rounded-xl bg-emerald-800/60 border border-emerald-600/60 shadow-inner">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300 uppercase tracking-wider mb-1">
                  <Calendar className="w-3.5 h-3.5" />
                  JADWAL & JAM PENGAMBILAN (PASTI):
                </div>
                <div className="text-sm font-extrabold text-white leading-snug">
                  {formatDisplayDate(pickupDate)}
                </div>
                <div className="text-[11px] text-emerald-200/90 mt-1">
                  Dihitung otomatis: Tanggal Masuk + {selectedDuration.days} hari (Pukul 08:00 WIB).
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full mt-5 py-3.5 px-4 bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-600 text-emerald-950 font-black text-sm rounded-xl shadow-lg hover:shadow-xl transition-all flex flex-col items-center justify-center gap-0.5 group cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <span>BUAT PESANAN & CETAK STRUK</span>
                  <Send className="w-4 h-4 group-hover:translate-x-1 transition" />
                </div>
                <span className="text-[10px] font-semibold text-emerald-900 opacity-90">
                  Struk bukti transaksi langsung dapat diunduh (download)
                </span>
              </button>

              <div className="mt-2 text-center text-[11px] text-emerald-300/80">
                Tujuan WA Admin: <strong className="text-amber-300">{ADMIN_WHATSAPP}</strong>
              </div>
            </div>

            {/* QUICK COLOR GUIDE CARD */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm text-xs space-y-2.5">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-emerald-600" />
                Standar Warna Sampul Resmi UIN Madura:
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-950 border border-emerald-200 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-600 shrink-0"></span>
                  <span><strong>FATAR:</strong> Hijau</span>
                </div>
                <div className="p-2 rounded-lg bg-yellow-50 text-yellow-950 border border-yellow-200 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-yellow-400 shrink-0"></span>
                  <span><strong>FEBI:</strong> Kuning</span>
                </div>
                <div className="p-2 rounded-lg bg-blue-50 text-blue-950 border border-blue-200 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-600 shrink-0"></span>
                  <span><strong>USULUDDIN:</strong> Biru</span>
                </div>
                <div className="p-2 rounded-lg bg-red-50 text-red-950 border border-red-200 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-600 shrink-0"></span>
                  <span><strong>FASYA HKI:</strong> Merah</span>
                </div>
                <div className="p-2 rounded-lg bg-rose-50 text-rose-950 border border-rose-200 flex items-center gap-2 col-span-2">
                  <span className="w-3 h-3 rounded-full bg-rose-900 shrink-0"></span>
                  <span><strong>FASYA (HES, HTN, Syariah):</strong> Marron</span>
                </div>
              </div>
            </div>

          </div>
        </div>

      </form>
    </div>
  );
};
