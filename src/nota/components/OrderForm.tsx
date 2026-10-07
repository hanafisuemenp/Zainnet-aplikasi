import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  BookOpen,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
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
  Send,
  UploadCloud,
  FileCheck,
  Copy,
  Check,
  Building,
  GraduationCap,
  Palette,
  ExternalLink,
  MessageCircle,
  QrCode,
  DollarSign,
  Package
} from 'lucide-react';
import {
  UIN_MADURA_FACULTIES,
  DURATION_OPTIONS,
  EXTRA_SERVICES,
  getCoverColorInfo,
  ADMIN_WHATSAPP,
  ADMIN_WHATSAPP_INTL,
  DEFAULT_UNIVERSITY,
  POPULAR_UNIVERSITIES,
  STANDARD_COVER_COLORS,
  PAYMENT_ACCOUNT_INFO,
  PERCETAKAN_ADDRESS,
} from '../data/uinMaduraData';
import {
  DurationKey,
  OrderRecord,
  TransactionStatus,
  ExtraServiceOption,
  CoverType,
  FileDeliveryMethod,
  PaymentChannel,
  UploadedFileInfo,
} from '../types';
import {
  formatIDR,
  formatDateToCustom,
  formatDisplayDate,
  computePickupDate,
  generateOrderCode,
  calculateOrderPricing,
} from '../utils/pricing';
import { saveFileToPermanentStorage } from '../utils/fileStorage';

interface OrderFormProps {
  onOrderCreated: (order: OrderRecord) => void;
}

export const OrderForm: React.FC<OrderFormProps> = ({ onOrderCreated }) => {
  // Form state - Pemesan
  const [studentName, setStudentName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');

  // 1. Kampus / Universitas (Default UIN Madura + opsi manual kampus luar)
  const [universityMode, setUniversityMode] = useState<'uin_madura' | 'other'>('uin_madura');
  const [selectedCampusPreset, setSelectedCampusPreset] = useState(POPULAR_UNIVERSITIES[1]);
  const [customUniversity, setCustomUniversity] = useState('');

  // Fakultas state (Preset UIN vs Manual)
  const [fakultasId, setFakultasId] = useState(UIN_MADURA_FACULTIES[0].id);
  const [facultyMode, setFacultyMode] = useState<'preset' | 'custom'>('preset');
  const [customFaculty, setCustomFaculty] = useState('');

  // Prodi state (Preset UIN vs Manual)
  const [prodi, setProdi] = useState(UIN_MADURA_FACULTIES[0].prodis[0]);
  const [prodiMode, setProdiMode] = useState<'preset' | 'custom'>('preset');
  const [customProdi, setCustomProdi] = useState('');

  // Warna Sampul state (Auto vs Manual/Custom)
  const [coverColorMode, setCoverColorMode] = useState<'auto' | 'custom'>('auto');
  const [customCoverColor, setCustomCoverColor] = useState('Hijau');
  const [customCoverHex, setCustomCoverHex] = useState('#16a34a');

  // Paket Lengkap Preset State
  const [isCompletePackage, setIsCompletePackage] = useState<boolean>(true);

  // Jilid & Durasi
  const [coverType, setCoverType] = useState<CoverType>('hard_cover');
  const [coverCount, setCoverCount] = useState<number>(3);
  const [durationKey, setDurationKey] = useState<DurationKey>('3_day');

  // Layanan Tambahan (Default otomatis terpilih 4 layanan Paket Lengkap)
  const [selectedServices, setSelectedServices] = useState<string[]>([
    'artikel',
    'cd',
    'skek',
    'pisah_perpus',
  ]);
  const [printCost, setPrintCost] = useState<number>(0);

  // 2. Metode Penyerahan Dokumen (Upload Server vs Kirim WA)
  const [fileDeliveryMethod, setFileDeliveryMethod] = useState<FileDeliveryMethod>('upload_server');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileInfo[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 3. Status Transaksi & Metode Pembayaran (Cash vs Transfer)
  const [transactionStatus, setTransactionStatus] = useState<TransactionStatus>('Bayar Sekarang');
  const [paymentChannel, setPaymentChannel] = useState<PaymentChannel>('Cash');
  const [customDpAmount, setCustomDpAmount] = useState<number>(0);
  const [copiedRekening, setCopiedRekening] = useState(false);

  // Waktu Live Order
  const [orderDate] = useState<string>(() => formatDateToCustom(new Date()));

  // Validation errors
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Active selected faculty object (for UIN Madura)
  const currentFaculty = useMemo(() => {
    return UIN_MADURA_FACULTIES.find((f) => f.id === fakultasId) || UIN_MADURA_FACULTIES[0];
  }, [fakultasId]);

  const handleFacultyChange = (newFacId: string) => {
    setFakultasId(newFacId);
    const faculty = UIN_MADURA_FACULTIES.find((f) => f.id === newFacId);
    if (faculty && faculty.prodis.length > 0) {
      setProdi(faculty.prodis[0]);
    }
  };

  // Resolving Active University
  const activeUniversity = useMemo(() => {
    if (universityMode === 'uin_madura') {
      return DEFAULT_UNIVERSITY;
    }
    if (selectedCampusPreset === 'Lainnya / Kampus Luar Madura') {
      return customUniversity.trim() || 'Kampus Luar Madura';
    }
    return customUniversity.trim() || selectedCampusPreset;
  }, [universityMode, selectedCampusPreset, customUniversity]);

  // Resolving Active Faculty
  const activeFaculty = useMemo(() => {
    if (universityMode === 'uin_madura' && facultyMode === 'preset') {
      return currentFaculty.name;
    }
    return customFaculty.trim() || (universityMode === 'uin_madura' ? 'Fakultas Umum' : 'Fakultas Kampus Luar');
  }, [universityMode, facultyMode, currentFaculty, customFaculty]);

  // Resolving Active Prodi
  const activeProdi = useMemo(() => {
    if (universityMode === 'uin_madura' && facultyMode === 'preset' && prodiMode === 'preset') {
      return prodi;
    }
    return customProdi.trim() || (universityMode === 'uin_madura' ? 'Program Studi' : 'Program Studi Kampus Luar');
  }, [universityMode, facultyMode, prodiMode, prodi, customProdi]);

  // Resolving Cover Color
  const effectiveCoverColor = useMemo(() => {
    if (universityMode === 'uin_madura' && coverColorMode === 'auto') {
      return getCoverColorInfo(fakultasId, prodi);
    }
    // Custom / Kampus Luar color
    const matched = STANDARD_COVER_COLORS.find(
      (c) => c.name.toLowerCase() === customCoverColor.toLowerCase()
    );
    return {
      name: customCoverColor,
      badgeBg: matched?.bgClass ? `${matched.bgClass} text-white` : 'bg-slate-800 text-white',
      cardBorder: 'border-slate-400',
      lightBg: matched?.badgeClass ? matched.badgeClass : 'bg-slate-50 text-slate-900 border-slate-300',
      hex: customCoverHex || matched?.hex || '#16a34a',
    };
  }, [universityMode, coverColorMode, fakultasId, prodi, customCoverColor, customCoverHex]);

  // Check if current prodi matches special services
  const isPiaudProdi = useMemo(() => {
    const p = activeProdi.toLowerCase();
    return p.includes('piaud') || p.includes('anak usia dini');
  }, [activeProdi]);

  const isIpaProdi = useMemo(() => {
    const p = activeProdi.toLowerCase();
    return p.includes('ipa') || p.includes('tipa') || p.includes('pengetahuan alam');
  }, [activeProdi]);

  // Dynamic services
  const visibleServices = useMemo(() => {
    return EXTRA_SERVICES.map((s) => {
      let isRecommendedForProdi = false;
      if (s.id === 'dummy_book') isRecommendedForProdi = isPiaudProdi;
      if (s.id === 'cetak_a5_ipa') isRecommendedForProdi = isIpaProdi;
      return {
        ...s,
        isRecommendedForProdi,
      };
    });
  }, [isPiaudProdi, isIpaProdi]);

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

  // Live Calculator Total Harga
  const calculation = useMemo(() => {
    const calc = calculateOrderPricing(coverCount, durationKey, selectedServices, 0, coverType, activeFaculty);
    return { ...calc, totalCost: calc.totalCost + (printCost || 0) };
  }, [coverCount, durationKey, selectedServices, coverType, printCost, activeFaculty]);

  // Check if current services require file upload
  const uploadServices = ['artikel', 'dummy_book', 'cetak_a5_ipa', 'pisah_perpus'];
  const needsUpload = selectedServices.some(s => uploadServices.includes(s));

  // Auto-sync customDpAmount when status changes to DP
  useEffect(() => {
    if (transactionStatus === 'DP' && customDpAmount === 0) {
      setCustomDpAmount(calculation.standardDp);
    }
  }, [transactionStatus, calculation.standardDp]);

  const handleApplyPaketLengkap = () => {
    setIsCompletePackage(true);
    setCoverType('hard_cover');
    setCoverCount((prev) => Math.max(3, prev));
    setSelectedServices((prev) => {
      const base = ['artikel', 'cd', 'skek', 'pisah_perpus'];
      const prodiSpecific = prev.filter(
        (id) => !base.includes(id) && (id === 'dummy_book' || id === 'cetak_a5_ipa')
      );
      return [...base, ...prodiSpecific];
    });
  };

  const toggleService = (serviceId: string) => {
    setSelectedServices((prev) => {
      let next: string[];
      if (prev.includes(serviceId)) {
        next = prev.filter((id) => id !== serviceId);
      } else {
        next = [...prev, serviceId];
      }
      const hasAllPackageServices = ['artikel', 'cd', 'skek', 'pisah_perpus'].every((id) => next.includes(id));
      setIsCompletePackage(hasAllPackageServices && coverType === 'hard_cover');
      return next;
    });
  };

  const handleSelectAllServices = () => {
    const idsToSelect: string[] = ['artikel', 'cd', 'skek', 'pisah_perpus'];
    if (isPiaudProdi) idsToSelect.push('dummy_book');
    if (isIpaProdi) idsToSelect.push('cetak_a5_ipa');
    setSelectedServices(idsToSelect);
    setIsCompletePackage(coverType === 'hard_cover');
  };

  const handleClearAllServices = () => {
    setSelectedServices([]);
    setIsCompletePackage(false);
  };

  // Upload handler ke server `/api/upload`
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setIsUploading(true);

    const file = files[0];
    if (file.size > 50 * 1024 * 1024) {
      setUploadError('Ukuran file maksimal 50 MB.');
      setIsUploading(false);
      return;
    }

    let localDataUrl = '';
    try {
      if (file.size < 10 * 1024 * 1024) {
        localDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string) || '');
          reader.onerror = () => resolve('');
          reader.readAsDataURL(file);
        });
      }
    } catch {
      // ignore
    }

    // Save to permanent browser IndexedDB storage (never wiped by 30-min timeouts)
    const fileStorageId = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    try {
      await saveFileToPermanentStorage(fileStorageId, file, {
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl: localDataUrl,
        uploadedAt: formatDateToCustom(new Date()),
      });
    } catch (storageErr) {
      console.warn('Permanent local storage note:', storageErr);
    }

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Gagal unggah ke server');
      }

      const data = await res.json();
      if (data.success && data.file) {
        setUploadedFiles((prev) => [
          ...prev,
          {
            name: data.file.name,
            filename: data.file.filename,
            size: data.file.size,
            type: data.file.type,
            uploadedAt: formatDateToCustom(new Date()),
            url: data.file.url,
            dataUrl: localDataUrl || undefined,
            serviceCategory: 'Naskah Skripsi Lengkap',
          },
        ]);
      }
    } catch {
      // Fallback local memory representation if server offline
      setUploadedFiles((prev) => [
        ...prev,
        {
          name: file.name,
          size: file.size,
          type: file.type,
          uploadedAt: formatDateToCustom(new Date()),
          dataUrl: localDataUrl || undefined,
          serviceCategory: 'Naskah Skripsi Lengkap',
        },
      ]);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCopyRekening = () => {
    navigator.clipboard.writeText(PAYMENT_ACCOUNT_INFO.bri.accountNumber);
    setCopiedRekening(true);
    setTimeout(() => setCopiedRekening(false), 2000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: { [key: string]: string } = {};

    if (!studentName.trim()) {
      newErrors.studentName = 'Nama Mahasiswa wajib diisi.';
    }
    if (!whatsapp.trim()) {
      newErrors.whatsapp = 'Nomor WhatsApp wajib diisi untuk konfirmasi nota.';
    } else if (!/^[0-9+ -]{8,16}$/.test(whatsapp.trim())) {
      newErrors.whatsapp = 'Nomor WhatsApp tidak valid (contoh: 81234567890).';
    }

    if (!coverCount || coverCount < 1) {
      newErrors.coverCount = 'Jumlah sampul minimal 1 eksemplar.';
    }

    if (universityMode === 'other' && selectedCampusPreset === 'Lainnya / Kampus Luar Madura' && !customUniversity.trim()) {
      newErrors.university = 'Tuliskan nama universitas / kampus Anda.';
    }

    if ((universityMode === 'other' || facultyMode === 'custom') && !customFaculty.trim()) {
      newErrors.faculty = 'Nama Fakultas wajib diisi.';
    }

    if ((universityMode === 'other' || prodiMode === 'custom') && !customProdi.trim()) {
      newErrors.prodi = 'Nama Program Studi wajib diisi.';
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
      university: activeUniversity,
      isCustomUniversity: universityMode === 'other',
      fakultas: activeFaculty,
      isCustomFaculty: universityMode === 'other' || facultyMode === 'custom',
      prodi: activeProdi,
      isCustomProdi: universityMode === 'other' || prodiMode === 'custom',
      coverColor: effectiveCoverColor.name,
      isCustomCoverColor: coverColorMode === 'custom' || universityMode === 'other',
      coverHex: effectiveCoverColor.hex,
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
      printCost: printCost || 0,
      totalCost: calculation.totalCost,
      isCompletePackage: isCompletePackage,
      extraCoversAdded: isCompletePackage ? Math.max(0, calculation.count - 3) : 0,
      fileDeliveryMethod: fileDeliveryMethod,
      uploadedFiles: fileDeliveryMethod === 'upload_server' ? uploadedFiles : [],
      orderDate: orderDate,
      pickupDate: pickupDate,
      status: 'Menunggu',
      transactionStatus: transactionStatus,
      paymentChannel: transactionStatus === 'Bayar Nanti' ? undefined : paymentChannel,
      dpAmount: dpAmount,
      remainingAmount: remainingAmount,
      adminConfirmed: false,
      createdAt: Date.now(),
    };

    onOrderCreated(orderRecord);
  };

  return (
    <div className="order-page max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Intro Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Sistem Resmi Percetakan Jilid Skripsi & Dokumen
            </div>
            <h2 className="text-2xl font-black text-slate-900 mt-1">
              Pemesanan Jilid Hard Cover & Cetak Nota
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Melayani mahasiswa <strong>UIN Madura</strong> dan <strong>Kampus Luar / Umum</strong>. Nota siap cetak dan terkirim ke WhatsApp Admin (<strong>{ADMIN_WHATSAPP}</strong>).
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
          
          {/* SECTION 1: DATA MAHASISWA & KAMPUS */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                  1
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <User className="w-5 h-5 text-emerald-600" />
                    Data Pemesan & Asal Kampus
                  </h3>
                  <p className="text-xs text-slate-500">Pilih kampus UIN Madura atau kampus luar lainnya.</p>
                </div>
              </div>
            </div>

            {/* TAB SELECTOR KAMPUS */}
            <div className="mb-5 p-1.5 bg-slate-100 rounded-xl flex items-center gap-1.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setUniversityMode('uin_madura');
                  setFacultyMode('preset');
                  setProdiMode('preset');
                  setCoverColorMode('auto');
                }}
                className={`flex-1 py-2.5 px-3 rounded-lg transition-all flex items-center justify-center gap-2 ${
                  universityMode === 'uin_madura'
                    ? 'bg-white text-emerald-800 shadow-sm font-extrabold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <GraduationCap className="w-4 h-4" />
                <span>UIN Madura (Pilihan Standar)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setUniversityMode('other');
                  setCoverColorMode('custom');
                }}
                className={`flex-1 py-2.5 px-3 rounded-lg transition-all flex items-center justify-center gap-2 ${
                  universityMode === 'other'
                    ? 'bg-white text-indigo-800 shadow-sm font-extrabold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Building className="w-4 h-4" />
                <span>Kampus Luar / Lainnya (Input Manual)</span>
              </button>
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
                  No. WhatsApp Mahasiswa <span className="text-rose-500">*</span>
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

              {/* KAMPUS LUAR SPECIFIC: PILIH UNIVERSITAS */}
              {universityMode === 'other' && (
                <div className="md:col-span-2 p-4 bg-indigo-50/60 rounded-xl border border-indigo-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
                      <Building className="w-4 h-4 text-indigo-600" />
                      Pilih Asal Kampus / Universitas Luar:
                    </label>
                  </div>
                  <select
                    value={selectedCampusPreset}
                    onChange={(e) => setSelectedCampusPreset(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-indigo-200 bg-white text-slate-900 text-sm font-semibold"
                  >
                    {POPULAR_UNIVERSITIES.slice(1).map((univ) => (
                      <option key={univ} value={univ}>{univ}</option>
                    ))}
                  </select>

                  {selectedCampusPreset === 'Lainnya / Kampus Luar Madura' && (
                    <div>
                      <input
                        type="text"
                        value={customUniversity}
                        onChange={(e) => setCustomUniversity(e.target.value)}
                        placeholder="Ketik Nama Universitas / Institut Anda (Contoh: Universitas Brawijaya)"
                        className="w-full px-4 py-2.5 rounded-xl border border-indigo-300 bg-white text-slate-900 text-sm font-medium focus:ring-2 focus:ring-indigo-500"
                      />
                      {errors.university && (
                        <p className="mt-1 text-xs text-rose-600 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" /> {errors.university}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* FAKULTAS SELECTION */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Fakultas <span className="text-rose-500">*</span>
                  </label>
                  {universityMode === 'uin_madura' && (
                    <button
                      type="button"
                      onClick={() => setFacultyMode(facultyMode === 'preset' ? 'custom' : 'preset')}
                      className="text-[11px] font-semibold text-emerald-700 hover:underline"
                    >
                      {facultyMode === 'preset' ? '+ Input Manual' : '← Pilih Fakultas UIN'}
                    </button>
                  )}
                </div>

                {universityMode === 'uin_madura' && facultyMode === 'preset' ? (
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
                ) : (
                  <div>
                    <input
                      type="text"
                      value={customFaculty}
                      onChange={(e) => {
                        setCustomFaculty(e.target.value);
                        if (errors.faculty) setErrors({ ...errors, faculty: '' });
                      }}
                      placeholder="Contoh: Fakultas Teknik / Fakultas Hukum"
                      className={`w-full px-4 py-2.5 rounded-xl border ${
                        errors.faculty ? 'border-rose-400 bg-rose-50/30' : 'border-slate-300'
                      } text-slate-900 text-sm font-semibold focus:ring-2 focus:ring-emerald-500`}
                    />
                    {errors.faculty && (
                      <p className="mt-1 text-xs text-rose-600 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> {errors.faculty}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* PRODI SELECTION */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Program Studi (Prodi) <span className="text-rose-500">*</span>
                  </label>
                  {universityMode === 'uin_madura' && facultyMode === 'preset' && (
                    <button
                      type="button"
                      onClick={() => setProdiMode(prodiMode === 'preset' ? 'custom' : 'preset')}
                      className="text-[11px] font-semibold text-emerald-700 hover:underline"
                    >
                      {prodiMode === 'preset' ? '+ Input Manual' : '← Pilih Prodi UIN'}
                    </button>
                  )}
                </div>

                {universityMode === 'uin_madura' && facultyMode === 'preset' && prodiMode === 'preset' ? (
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
                ) : (
                  <div>
                    <input
                      type="text"
                      value={customProdi}
                      onChange={(e) => {
                        setCustomProdi(e.target.value);
                        if (errors.prodi) setErrors({ ...errors, prodi: '' });
                      }}
                      placeholder="Contoh: Teknik Informatika / Manajemen"
                      className={`w-full px-4 py-2.5 rounded-xl border ${
                        errors.prodi ? 'border-rose-400 bg-rose-50/30' : 'border-slate-300'
                      } text-slate-900 text-sm font-medium focus:ring-2 focus:ring-emerald-500`}
                    />
                    {errors.prodi && (
                      <p className="mt-1 text-xs text-rose-600 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> {errors.prodi}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* COLOR SECTION */}
            <div className="mt-6 pt-4 border-t border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Warna Sampul Skripsi:
                  </span>
                </div>
                {universityMode === 'uin_madura' && (
                  <button
                    type="button"
                    onClick={() => setCoverColorMode(coverColorMode === 'auto' ? 'custom' : 'auto')}
                    className="text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    {coverColorMode === 'auto' ? '🎨 Ubah Warna Manual (Permintaan Khusus)' : '🔄 Kembali ke Standar UIN'}
                  </button>
                )}
              </div>

              {/* Custom / Manual Color Picker */}
              {(coverColorMode === 'custom' || universityMode === 'other') ? (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="text-xs text-slate-600 font-medium">
                    Pilih warna sampul standar atau masukkan nama warna khusus:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {STANDARD_COVER_COLORS.map((col) => (
                      <button
                        key={col.name}
                        type="button"
                        onClick={() => {
                          setCustomCoverColor(col.name);
                          setCustomCoverHex(col.hex);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 border transition ${
                          customCoverColor === col.name
                            ? 'border-slate-900 ring-2 ring-slate-800 text-slate-900 bg-white shadow-sm'
                            : 'border-slate-200 bg-white/80 text-slate-700 hover:bg-white'
                        }`}
                      >
                        <span className="w-3 h-3 rounded-full border border-black/20" style={{ backgroundColor: col.hex }} />
                        <span>{col.name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    <span className="text-xs text-slate-500">Ketik Warna Lain:</span>
                    <input
                      type="text"
                      value={customCoverColor}
                      onChange={(e) => setCustomCoverColor(e.target.value)}
                      placeholder="Misal: Hijau Tosca / Biru Langit"
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-900 bg-white"
                    />
                  </div>
                </div>
              ) : (
                /* Auto Banner UIN Madura */
                <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${effectiveCoverColor.lightBg}`}>
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-5 h-5 rounded-full border border-black/20 shadow-sm shrink-0"
                      style={{ backgroundColor: effectiveCoverColor.hex }}
                    />
                    <div>
                      <div className="text-xs font-bold">
                        Standar Warna Resmi UIN Madura: <span className="underline font-black">{effectiveCoverColor.name}</span>
                      </div>
                      <div className="text-[11px] opacity-80">
                        FATAR (Hijau) &bull; FEBI (Kuning) &bull; USULUDDIN (Biru) &bull; FASYA HKI (Merah) &bull; FASYA HES/HTN (Marron)
                      </div>
                    </div>
                  </div>
                  <span className={`text-[11px] px-2.5 py-1 rounded-full font-bold shadow-xs shrink-0 ${effectiveCoverColor.badgeBg}`}>
                    Sampul {effectiveCoverColor.name}
                  </span>
                </div>
              )}
            </div>

            {/* KHUSUS PRODI PIAUD / IPA NOTIFICATION */}
            {isPiaudProdi && (
              <div className="mt-3 p-3 rounded-xl bg-purple-50 border border-purple-200 text-xs text-purple-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                <span>
                  <strong>Terdeteksi Mahasiswa PIAUD:</strong> Layanan tambahan <strong>DUMMY BOOK</strong> otomatis tersedia di bagian layanan di bawah!
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

          {/* SECTION 2: METODE PENYERAHAN DOKUMEN / FILE (UPLOAD LANGSUNG VS WA) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-2.5 pb-4 mb-5 border-b border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                2
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <UploadCloud className="w-5 h-5 text-emerald-600" />
                    Metode Penyerahan Berkas Naskah Skripsi
                  </h3>
                  {!needsUpload && (
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                      ✅ Dilewati (Cuma Jilid Fisik)
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {needsUpload
                    ? 'Pilih apakah ingin mengunggah file sekarang ke sistem, atau kirim langsung lewat chat WhatsApp.'
                    : 'Pesanan hanya jilid naskah fisik, berkas cukup dibawa langsung ke loket ZAIN.NET saat pengambilan.'}
                </p>
              </div>
            </div>

            {/* JIKA TIDAK MEMERLUKAN UPLOAD FILE (HANYA JILID / CD / SKEK FISIK) */}
            {!needsUpload ? (
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-300 text-emerald-950 flex items-start gap-3.5 shadow-xs">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md mt-0.5">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-extrabold text-sm sm:text-base text-emerald-950">
                      Upload File Dilewati: Naskah Fisik Cukup Dibawa Langsung ke Loket ZAIN.NET
                    </h4>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 border border-emerald-400">
                      Bebas Unggah
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-emerald-800 leading-relaxed">
                    Anda hanya memesan jilid sampul (atau bersama CD / Buku SKEK fisik). Anda <strong>tidak perlu mengunggah file</strong> naskah ke sistem. Cukup bawa naskah skripsi fisik yang sudah dicetak langsung ke loket percetakan ZAIN.NET saat penyerahan berkas atau pengambilan jilid.
                  </p>
                  <div className="pt-1 text-[11px] font-semibold text-emerald-700 flex items-center gap-1.5">
                    <span>📍 Lokasi Loket: Utaranya Indomaret UIN Madura, barat jalan, samping BRI Link</span>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* TAB SELECTOR METODE BERKAS (Hanya tampil jika pilih layanan yang butuh file) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-5">
                  <label
                    onClick={() => setFileDeliveryMethod('upload_server')}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                      fileDeliveryMethod === 'upload_server'
                        ? 'border-emerald-600 bg-emerald-50/50 shadow-sm ring-1 ring-emerald-500'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <UploadCloud className={`w-5 h-5 ${fileDeliveryMethod === 'upload_server' ? 'text-emerald-700' : 'text-slate-500'}`} />
                        <span className="font-bold text-slate-900 text-sm">Unggah File Langsung</span>
                      </div>
                      <input
                        type="radio"
                        name="fileMethod"
                        checked={fileDeliveryMethod === 'upload_server'}
                        onChange={() => setFileDeliveryMethod('upload_server')}
                        className="w-4 h-4 text-emerald-600"
                      />
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Upload file PDF / DOCX naskah skripsi Anda ke server. Berkas otomatis tersimpan di nomor nota Anda.
                    </p>
                  </label>

                  <label
                    onClick={() => setFileDeliveryMethod('whatsapp_only')}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                      fileDeliveryMethod === 'whatsapp_only'
                        ? 'border-emerald-600 bg-emerald-50/50 shadow-sm ring-1 ring-emerald-500'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <MessageCircle className={`w-5 h-5 ${fileDeliveryMethod === 'whatsapp_only' ? 'text-emerald-700' : 'text-slate-500'}`} />
                        <span className="font-bold text-slate-900 text-sm">Kirim ke WhatsApp Saja</span>
                      </div>
                      <input
                        type="radio"
                        name="fileMethod"
                        checked={fileDeliveryMethod === 'whatsapp_only'}
                        onChange={() => setFileDeliveryMethod('whatsapp_only')}
                        className="w-4 h-4 text-emerald-600"
                      />
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Tidak perlu upload sekarang. File skripsi dapat dikirim langsung ke chat WhatsApp Admin bersama nota pesanan.
                    </p>
                  </label>
                </div>

                {/* KONTEN JIKA PILIH UPLOAD SERVER */}
                {fileDeliveryMethod === 'upload_server' && (
                  <div className="space-y-4">
                    <div className="border-2 border-dashed border-emerald-300 bg-emerald-50/30 rounded-2xl p-6 text-center hover:bg-emerald-50/50 transition">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.doc,.docx,.zip,.rar"
                        className="hidden"
                        id="file-upload"
                        onChange={(e) => handleFileUpload(e.target.files)}
                      />
                      <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                        <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2">
                          <UploadCloud className="w-6 h-6" />
                        </div>
                        <span className="font-bold text-sm text-slate-800">
                          Klik di sini untuk memilih file naskah skripsi
                        </span>
                        <span className="text-xs text-slate-500 mt-1">
                          Mendukung PDF, Word (.docx), atau ZIP (Maksimal 50 MB)
                        </span>
                      </label>
                      {isUploading && (
                        <div className="mt-3 flex items-center justify-center gap-2 text-xs font-bold text-emerald-700">
                          <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                          <span>Sedang mengunggah berkas ke server...</span>
                        </div>
                      )}
                      {uploadError && (
                        <div className="mt-3 text-xs text-rose-600 font-semibold flex items-center justify-center gap-1">
                          <AlertCircle className="w-4 h-4" />
                          <span>{uploadError}</span>
                        </div>
                      )}
                    </div>

                    {/* LIST FILE TERUNGGAH */}
                    {uploadedFiles.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                          File Siap Dilampirkan ({uploadedFiles.length}):
                        </div>
                        {uploadedFiles.map((file, idx) => (
                          <div
                            key={idx}
                            className="p-3 bg-white rounded-xl border border-emerald-200 flex items-center justify-between shadow-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <FileCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                              <div className="truncate">
                                <div className="text-xs font-bold text-slate-900 truncate">
                                  {file.name}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {(file.size / (1024 * 1024)).toFixed(2)} MB • {file.uploadedAt}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="hidden sm:inline-block text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300">
                                🔒 Akses Khusus Admin
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveFile(idx)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 transition"
                                title="Hapus berkas"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-center gap-2">
                          <Lock className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                          <span>
                            <strong>Keamanan Berkas:</strong> File skripsi yang diunggah hanya dapat diakses & diunduh oleh Admin Percetakan untuk proses pencetakan & penjilidan.
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* KONTEN JIKA PILIH KIRIM WA */}
                {fileDeliveryMethod === 'whatsapp_only' && (
                  <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-3 text-xs text-amber-950">
                    <MessageCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-bold">Kirim File via WhatsApp Aktif:</strong>
                      <p className="mt-0.5 text-amber-900 leading-relaxed">
                        Setelah nota selesai dibuat, tekan tombol <strong>"Kirim ke Admin"</strong> di struk untuk langsung membuka obrolan WhatsApp dan lampirkan naskah dokumen Anda ke Admin <strong>{ADMIN_WHATSAPP}</strong>.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* PROMINENT PAKET LENGKAP PRESET BANNER */}
          <div className="p-5 sm:p-6 rounded-2xl border-2 border-amber-400 bg-gradient-to-r from-amber-500/15 via-emerald-500/10 to-amber-500/10 shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-400 text-emerald-950 flex items-center justify-center font-black shadow-md">
                  <Package className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-amber-900 uppercase tracking-wider bg-amber-200/90 px-2 py-0.5 rounded-full border border-amber-300">
                      ⭐ Rekomendasi Wisuda & Perpus
                    </span>
                    {isCompletePackage && (
                      <span className="text-[10px] font-black text-emerald-900 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
                        ✓ Paket Lengkap Aktif
                      </span>
                    )}
                  </div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 mt-0.5">
                    Menu Paket Lengkap (3 Jilid Skripsi + Artikel + CD + SKEK + Pisah File Perpus)
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleApplyPaketLengkap}
                  className={`px-4 py-2.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-sm cursor-pointer ${
                    isCompletePackage
                      ? 'bg-emerald-700 text-white ring-2 ring-emerald-500'
                      : 'bg-amber-400 hover:bg-amber-500 text-emerald-950'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>{isCompletePackage ? '✓ Paket Lengkap Terpilih' : 'Pilih Paket Lengkap (1-Klik)'}</span>
                </button>

                {isCompletePackage && (
                  <button
                    type="button"
                    onClick={() => setIsCompletePackage(false)}
                    className="px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                  >
                    Kustom Sendiri
                  </button>
                )}
              </div>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed mb-3">
              Mahasiswa yang memilih <strong>Paket Lengkap</strong> langsung otomatis tercentang: <strong>3 Jilid Skripsi Hardcover</strong> (bisa menambah jumlah eksemplar, harga otomatis disesuaikan secara real-time) + <strong>Artikel Jurnal</strong> + <strong>CD Softcopy & Cover</strong> + <strong>Buku SKEK</strong> + <strong>Pisah-pisah File untuk Repositori Perpus</strong>!
            </p>

            {/* Checklist Itemized Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-2 border-t border-amber-300/60 text-xs">
              <div className="p-2.5 rounded-xl bg-white/95 border border-amber-200">
                <div className="font-bold text-slate-900 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>3 Jilid Skripsi Hardcover</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Bisa nambah ({coverCount} buku terpilih)
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white/95 border border-amber-200">
                <div className="font-bold text-slate-900 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Artikel Jurnal Ilmiah</span>
                </div>
                <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                  Rp 20.000 (Format & Cetak)
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white/95 border border-amber-200">
                <div className="font-bold text-slate-900 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>CD Softcopy + Kotak</span>
                </div>
                <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                  Rp 10.000 (Cover & Mika)
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white/95 border border-amber-200">
                <div className="font-bold text-slate-900 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Buku SKEK Wisuda</span>
                </div>
                <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                  Rp 5.000 (Administrasi)
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white/95 border border-amber-200">
                <div className="font-bold text-slate-900 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Pisah File Perpus</span>
                </div>
                <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                  Rp 10.000 (Split PDF Bab)
                </div>
              </div>
            </div>

            {/* Extra cover indicator when coverCount > 3 */}
            {isCompletePackage && coverCount > 3 && (
              <div className="mt-3 p-2.5 bg-emerald-100/90 rounded-xl border border-emerald-300 text-xs font-bold text-emerald-950 flex items-center justify-between">
                <span>
                  ⭐ Penambahan Jilid: 3 Jilid Standar Paket + <strong>{coverCount - 3} Jilid Tambahan</strong> (+{formatIDR((coverCount - 3) * calculation.pricePerCover)})
                </span>
                <span className="font-mono text-emerald-900">
                  Total {coverCount} Hardcover
                </span>
              </div>
            )}
          </div>

          {/* SECTION 3: JENIS JILID & DURASI */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-2.5 pb-4 mb-5 border-b border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                3
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

            {/* Pilihan Jenis Jilid & Biaya Cetak */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Jenis Jilid */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Pilihan Tipe Jilid <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCoverType('hard_cover')}
                    className={`p-3.5 rounded-xl border-2 text-left transition flex flex-col justify-between ${
                      coverType === 'hard_cover'
                        ? 'border-emerald-600 bg-emerald-50/50 shadow-sm ring-1 ring-emerald-500'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-extrabold text-sm text-slate-900">Hard Cover</span>
                        {coverType === 'hard_cover' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                      </div>
                      <p className="text-[11px] text-slate-500">Standar resmi skripsi bersampul tebal emas</p>
                    </div>
                    <div className="text-xs font-bold text-emerald-700 mt-2 font-mono">
                      {((activeFaculty || '').toLowerCase().includes('syariah') || (activeFaculty || '').toLowerCase().includes('fasya') || fakultasId === 'fasya')
                        ? 'Rp 32.000 - Rp 50.000'
                        : 'Rp 30.000 - Rp 50.000'}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCoverType('soft_cover')}
                    className={`p-3.5 rounded-xl border-2 text-left transition flex flex-col justify-between ${
                      coverType === 'soft_cover'
                        ? 'border-emerald-600 bg-emerald-50/50 shadow-sm ring-1 ring-emerald-500'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-extrabold text-sm text-slate-900">Soft Cover</span>
                        {coverType === 'soft_cover' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                      </div>
                      <p className="text-[11px] text-slate-500">Jilid naskah proposal / laporan ujian</p>
                    </div>
                    <div className="text-xs font-bold text-emerald-700 mt-2 font-mono">
                      Rp 15.000 / buku
                    </div>
                  </button>
                </div>
              </div>

              {/* Biaya Print Naskah */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-indigo-950 mb-2">
                  Biaya Tambahan Print/Cetak (Jika Ada)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={printCost || ''}
                    onChange={(e) => setPrintCost(Number(e.target.value))}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-indigo-100 bg-indigo-50/50 text-indigo-950 font-bold focus:ring-2 focus:ring-indigo-500"
                    placeholder="Contoh: 10000"
                  />
                  <Wallet className="w-5 h-5 text-indigo-400 absolute left-3 top-3.5" />
                </div>
                <p className="text-[11px] text-indigo-500 mt-2">
                  Masukkan biaya print jika memesan sekalian cetak isi naskah di ZAIN.NET.
                </p>
              </div>
            </div>

            {/* Stepper Jumlah Sampul */}
            <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <label className="block text-sm font-bold text-slate-900">
                  Jumlah {coverType === 'soft_cover' ? 'Soft Cover' : 'Hard Cover'} yang dipesan <span className="text-rose-500">*</span>
                </label>
                <p className="text-xs text-slate-500 mt-0.5">
                  Minimal 1 eksemplar. Standar kebutuhan wisuda: 3 - 4 eksemplar.
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
                Opsi Durasi Pengerjaan & Waktu Pengambilan <span className="text-rose-500">*</span>
              </label>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {DURATION_OPTIONS.map((opt) => {
                  const isSelected = durationKey === opt.key;
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

                      {(() => {
                        const isSyariah = (activeFaculty || '').toLowerCase().includes('syariah') || 
                                          (activeFaculty || '').toLowerCase().includes('fasya') || 
                                          fakultasId === 'fasya';
                        const isSyariah3Day = isSyariah && opt.key === '3_day' && coverType !== 'soft_cover';
                        const unitPrice = coverType === 'soft_cover' 
                          ? 15000 
                          : isSyariah3Day 
                          ? 32000 
                          : opt.pricePerCover;

                        return (
                          <>
                            <div className="text-emerald-700 font-extrabold text-lg mb-1">
                              {formatIDR(unitPrice)}
                              <span className="text-xs font-normal text-slate-500"> / sampul</span>
                            </div>

                            {isSyariah3Day && (
                              <div className="mb-2">
                                <span className="inline-flex items-center text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-300 shadow-xs">
                                  ⭐ Khusus Fakultas Syariah: Rp 32.000 / jilid
                                </span>
                              </div>
                            )}

                            <p className="text-xs text-slate-500 mb-3 flex-1 leading-relaxed">
                              {isSyariah3Day
                                ? 'Pengerjaan standar 3 hari khusus Fakultas Syariah (Rp 32.000 / sampul)'
                                : opt.description}
                            </p>
                          </>
                        );
                      })()}

                      <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs">
                        <span className="text-slate-500">Siap Ambil:</span>
                        <span className="font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                          {tempDate} Pukul 08:00 WIB
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* SECTION 4: LAYANAN TAMBAHAN WISUDA & REPOSITORI */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                  4
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-emerald-600" />
                    Layanan Tambahan Wisuda & Repositori
                  </h3>
                  <p className="text-xs text-slate-500">
                    Bisa dipilih sesuai kebutuhan kelulusan dan repositori perpustakaan.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllServices}
                  className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition"
                >
                  Pilih Semua
                </button>
                <button
                  type="button"
                  onClick={handleClearAllServices}
                  className="px-2.5 py-1 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                >
                  Batal Semua
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {visibleServices.map((svc) => {
                const isChecked = selectedServices.includes(svc.id);
                return (
                  <div
                    key={svc.id}
                    onClick={() => toggleService(svc.id)}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                      isChecked
                        ? 'border-emerald-600 bg-emerald-50/40 ring-1 ring-emerald-500'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400" />
                          )}
                          {svc.label}
                        </span>
                        <span className="text-xs font-bold text-emerald-700 font-mono">
                          {formatIDR(svc.price)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed mb-2">
                        {svc.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-100 flex-wrap gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-600">{svc.badge}</span>
                        {['artikel', 'cd', 'skek', 'pisah_perpus'].includes(svc.id) && (
                          <span className="font-bold text-amber-900 bg-amber-200/90 px-2 py-0.5 rounded-full border border-amber-300 text-[10px]">
                            ⭐ Paket Lengkap
                          </span>
                        )}
                      </div>
                      {svc.promoTag && (
                        <span className="font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                          {svc.promoTag}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION 5: STATUS TRANSAKSI & METODE PEMBAYARAN (CASH VS TRANSFER) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-2.5 pb-4 mb-5 border-b border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                5
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-emerald-600" />
                  Status Transaksi & Metode Pembayaran
                </h3>
                <p className="text-xs text-slate-500">
                  Pilih status pembayaran dan tentukan metode (Tunai Cash di Loket atau Transfer Bank / QRIS).
                </p>
              </div>
            </div>

            {/* OPSI STATUS TRANSAKSI */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
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
                    <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                      Loket / Transfer
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
                    Bayar tunai di loket atau transfer sekarang saat pesan.
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
                    Bayar uang muka dulu, sisanya saat mengambil naskah.
                  </p>
                  <input
                    type="number"
                    value={customDpAmount || ''}
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
                    Pembayaran penuh di awal agar saat naskah siap langsung bawa pulang.
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200 text-xs font-semibold text-emerald-800 font-mono">
                  {formatIDR(calculation.totalCost)}
                </div>
              </label>

              {/* Option 4: Bayar Nanti di Loket (NOTA MERAH) */}
              <label
                onClick={() => setTransactionStatus('Bayar Nanti')}
                className={`p-4 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                  transactionStatus === 'Bayar Nanti'
                    ? 'border-red-500 bg-red-50/80 ring-2 ring-red-400 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-red-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black text-red-900 bg-red-100 px-2 py-0.5 rounded border border-red-300 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-600 inline-block" />
                      🔴 NOTA MERAH
                    </span>
                    <input
                      type="radio"
                      name="transStatus"
                      checked={transactionStatus === 'Bayar Nanti'}
                      onChange={() => setTransactionStatus('Bayar Nanti')}
                      className="w-4 h-4 text-red-600 focus:ring-red-500"
                    />
                  </div>
                  <div className="font-extrabold text-slate-900 text-sm mb-1 flex items-center gap-1.5">
                    <span>Bayar Nanti (Loket)</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Dapatkan bukti <strong>NOTA MERAH</strong> resmi, bayar tunai di loket saat mengambil hasil jilid.
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200 text-xs font-bold text-red-700 font-mono">
                  Bayar di Loket
                </div>
              </label>
            </div>

            {/* CALLOUT PENJELASAN METODE NOTA MERAH VS VERIFIKASI ADMIN */}
            {transactionStatus === 'Bayar Nanti' ? (
              <div className="p-4 bg-red-50/90 rounded-2xl border-2 border-red-300 text-xs text-red-950 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-red-600 text-white flex items-center justify-center font-black shrink-0 text-sm shadow-xs">
                  🔴
                </div>
                <div>
                  <div className="font-black text-red-900 uppercase tracking-wide text-xs">
                    KHUSUS NOTA MERAH (BELUM BAYAR):
                  </div>
                  <p className="mt-1 text-red-900 leading-relaxed">
                    Pesanan Anda akan dicetak dengan stempel dan tanda khusus <strong>NOTA MERAH (Belum Bayar)</strong>. Anda <strong>tidak perlu transfer di awal</strong> dan <strong>bebas verifikasi admin awal</strong>. Anda cukup menunjukkan nota merah ini dan melunasi tagihan secara tunai saat mengambil jilid di loket ZAIN.NET.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-300 text-xs text-amber-950 flex items-start gap-2.5">
                <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold text-amber-900">Wajib Verifikasi Admin Loket ZAIN.NET:</strong>
                  <p className="mt-0.5 text-amber-800 leading-relaxed">
                    Untuk metode pembayaran selain Bayar Nanti (<strong>{transactionStatus}</strong>), pembayaran Anda akan <strong>diverifikasi oleh Admin di Panel Loket ZAIN.NET</strong>. Nota PNG akan otomatis disiapkan untuk dikirim ke WhatsApp Admin agar diproses seketika.
                  </p>
                </div>
              </div>
            )}

            {/* SUB-PILIHAN: CASH VS TRANSFER (Untuk Bayar Sekarang, DP, atau LUNAS) */}
            {transactionStatus !== 'Bayar Nanti' && (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <Wallet className="w-4 h-4 text-emerald-600" />
                    Pilih Saluran Pembayaran:
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentChannel('Cash')}
                    className={`p-3 rounded-xl border-2 text-left transition flex items-center justify-between ${
                      paymentChannel === 'Cash'
                        ? 'border-emerald-600 bg-white shadow-sm ring-1 ring-emerald-500'
                        : 'border-slate-200 bg-white/70 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                        💵
                      </div>
                      <div>
                        <div className="font-extrabold text-sm text-slate-900">Cash / Tunai di Loket</div>
                        <div className="text-[11px] text-slate-500">Bayar langsung di kasir ZAIN.NET</div>
                      </div>
                    </div>
                    {paymentChannel === 'Cash' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentChannel('Transfer')}
                    className={`p-3 rounded-xl border-2 text-left transition flex items-center justify-between ${
                      paymentChannel === 'Transfer'
                        ? 'border-emerald-600 bg-white shadow-sm ring-1 ring-emerald-500'
                        : 'border-slate-200 bg-white/70 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center font-bold">
                        💳
                      </div>
                      <div>
                        <div className="font-extrabold text-sm text-slate-900">Transfer Bank / QRIS</div>
                        <div className="text-[11px] text-slate-500">BRI, BCA, Mandiri, QRIS & E-Wallet</div>
                      </div>
                    </div>
                    {paymentChannel === 'Transfer' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
                  </button>
                </div>

                {/* INFO TRANSFER BANK / QRIS */}
                {paymentChannel === 'Transfer' && (
                  <div className="p-4 bg-white rounded-xl border border-indigo-200 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-indigo-100">
                      <div>
                        <span className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                          Rekening Resmi ZAIN.NET
                        </span>
                        <div className="text-sm font-extrabold text-slate-900 flex items-center gap-2 mt-0.5">
                          <span>{PAYMENT_ACCOUNT_INFO.bri.bank}</span>
                          <span className="font-mono text-emerald-700">{PAYMENT_ACCOUNT_INFO.bri.accountNumber}</span>
                          <span className="text-xs text-slate-500 font-normal">a.n. {PAYMENT_ACCOUNT_INFO.bri.accountHolder}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyRekening}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition flex items-center gap-1.5 shrink-0"
                      >
                        {copiedRekening ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedRekening ? 'Tersalin' : 'Salin Rekening'}</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <div className="flex items-center gap-2">
                        <QrCode className="w-4 h-4 text-indigo-600" />
                        <span><strong>{PAYMENT_ACCOUNT_INFO.qris.name}:</strong> {PAYMENT_ACCOUNT_INFO.qris.description}</span>
                      </div>
                    </div>
                    <div className="text-[11px] text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                      💡 Setelah transfer, kirim bukti transfer Anda via chat WhatsApp ke <strong>{ADMIN_WHATSAPP}</strong> bersama bukti nota pesanan.
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 p-3.5 bg-amber-50 rounded-xl border border-amber-300 text-xs text-amber-950 flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">Info Bukti Pengambilan di Loket:</strong>
                <p className="mt-0.5 text-amber-900">
                  Setelah menekan tombol di bawah, Anda akan mendapatkan <strong>Struk Pembayaran / Bukti Nota Resmi</strong> yang dapat <strong>diunduh dalam bentuk gambar PNG</strong> atau <strong>dicetak</strong> sebagai bukti saat mengambil hasil jilid di loket {PERCETAKAN_ADDRESS}.
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

              {/* Rincian Kampus & Sampul */}
              <div className="mb-4 pb-3 border-b border-emerald-800/60 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Kampus:</span>
                  <span className="font-bold text-amber-300 truncate max-w-[180px]">{activeUniversity}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Warna Sampul:</span>
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: effectiveCoverColor.hex }} />
                    {effectiveCoverColor.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Metode Dokumen:</span>
                  <span className="font-semibold text-emerald-300">
                    {fileDeliveryMethod === 'upload_server' ? 'Upload ke Server' : 'Kirim via WA'}
                  </span>
                </div>
              </div>

              {/* Highlight Paket Lengkap if active */}
              {isCompletePackage && (
                <div className="mb-4 p-3 rounded-xl bg-amber-400/20 border border-amber-400/40 text-xs text-amber-200 space-y-1">
                  <div className="font-extrabold text-amber-300 flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-amber-400" />
                    <span>Paket Lengkap Aktif (3 Jilid + 4 Layanan)</span>
                  </div>
                  <div className="text-[11px] text-slate-200">
                    • 3 Jilid Hardcover + Artikel + CD + SKEK + Pisah File
                  </div>
                  {calculation.count > 3 && (
                    <div className="text-[11px] text-amber-100 font-bold bg-amber-500/20 p-1 rounded mt-1">
                      + {calculation.count - 3} Jilid Tambahan (+{formatIDR((calculation.count - 3) * calculation.pricePerCover)})
                    </div>
                  )}
                </div>
              )}

              {/* Rincian Jilid */}
              <div className="space-y-3 text-sm">
                <div className="flex items-start justify-between gap-2 text-slate-300">
                  <div>
                    <div className="font-bold text-white">
                      {coverType === 'soft_cover' ? 'Soft Cover' : 'Hard Cover'} ({calculation.count} buku)
                    </div>
                    <div className="text-xs text-emerald-300">
                      {coverType === 'soft_cover' ? 'Tarif Soft Cover' : selectedDuration.label} ({formatIDR(calculation.pricePerCover)}/buku)
                    </div>
                  </div>
                  <span className="font-mono font-bold text-white">
                    {formatIDR(calculation.coversSubtotal)}
                  </span>
                </div>

                {/* Layanan Tambahan */}
                {calculation.servicesBreakdown.length > 0 && (
                  <div className="pt-2 border-t border-emerald-800/40 space-y-2">
                    <div className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                      Layanan Tambahan ({calculation.servicesBreakdown.length}):
                    </div>
                    {calculation.servicesBreakdown.map((s) => (
                      <div key={s.id} className="flex items-center justify-between text-xs text-slate-300">
                        <span className="truncate pr-2">{s.label}</span>
                        <span className="font-mono text-white shrink-0">{formatIDR(s.price)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Biaya Print */}
                {(printCost || 0) > 0 && (
                  <div className="pt-2 border-t border-emerald-800/40 flex items-center justify-between text-xs text-slate-300">
                    <span>Biaya Cetak/Print Naskah</span>
                    <span className="font-mono text-amber-400 font-bold">{formatIDR(printCost)}</span>
                  </div>
                )}

                {/* TOTAL */}
                <div className="pt-4 border-t border-emerald-600/80 mt-2">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                        TOTAL ESTIMASI BIAYA
                      </span>
                      <span className="text-[10px] text-emerald-300">
                        Status: [{transactionStatus}] {transactionStatus !== 'Bayar Nanti' ? `• ${paymentChannel}` : ''}
                      </span>
                    </div>
                    <span className="text-2xl font-black text-amber-400 font-mono tracking-tight">
                      {formatIDR(calculation.totalCost)}
                    </span>
                  </div>
                  {transactionStatus === 'DP' && (
                    <div className="mt-2 text-xs bg-emerald-900/60 p-2 rounded-lg flex justify-between">
                      <span className="text-amber-200">DP: {formatIDR(customDpAmount)}</span>
                      <span className="text-slate-300">Sisa: {formatIDR(Math.max(0, calculation.totalCost - customDpAmount))}</span>
                    </div>
                  )}
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
                  Pukul 08:00 WIB di Percetakan ZAIN.NET.
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
                  Struk resmi langsung dapat diunduh (PNG) / dicetak
                </span>
              </button>

              <div className="mt-2 text-center text-[11px] text-emerald-300/80">
                Tujuan WA Admin: <strong className="text-amber-300">{ADMIN_WHATSAPP}</strong>
              </div>
            </div>

            {/* QUICK INFO CARD */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm text-xs space-y-2.5">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-emerald-600" />
                Ketentuan Jilid & Layanan ZAIN.NET:
              </div>
              <ul className="space-y-1 text-slate-600 text-[11px] list-disc list-inside">
                <li>Format resmi warna sampul fakultas otomatis / custom</li>
                <li>Pilihan bayar via Cash di Loket atau Transfer BRI/QRIS</li>
                <li>Naskah dapat diunggah ke web atau dikirimkan via WA</li>
                <li>Lokasi: Utaranya Indomaret UIN Madura, samping BRI Link</li>
              </ul>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
