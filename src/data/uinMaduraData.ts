import { FacultyData, DurationOption, ExtraServiceOption } from '../types';

export const ADMIN_WHATSAPP = '085231176597';
export const ADMIN_WHATSAPP_INTL = '6285231176597';
export const PERCETAKAN_NAME = 'ZAIN.NET';
export const PERCETAKAN_ADDRESS = 'Utaranya Indomaret Uin Madura , barat jalan ,samping nya BRI Link';

export const UIN_MADURA_FACULTIES: FacultyData[] = [
  {
    id: 'fatar',
    name: 'Fakultas Tarbiyah (FATAR)',
    code: 'FATAR',
    defaultCoverColor: 'Hijau',
    prodis: [
      'Pendidikan Agama Islam (PAI)',
      'Pendidikan Bahasa Arab (PBA)',
      'Manajemen Pendidikan Islam (MPI)',
      'Tadris Bahasa Inggris (TBI)',
      'Pendidikan Guru Madrasah Ibtidaiyah (PGMI)',
      'Pendidikan Islam Anak Usia Dini (PIAUD)',
      'Tadris Ilmu Pengetahuan Alam (TIPA)',
      'Tadris Bahasa Indonesia (TBIN)',
      'Bimbingan dan Konseling Pendidikan Islam (BKPI)',
      'Tadris Matematika (TMAT)',
    ],
  },
  {
    id: 'febi',
    name: 'Fakultas Ekonomi dan Bisnis Islam (FEBI)',
    code: 'FEBI',
    defaultCoverColor: 'Kuning',
    prodis: [
      'Perbankan Syariah (PBS)',
      'Ekonomi Syariah (ES)',
      'Akuntansi Syariah (AKS)',
    ],
  },
  {
    id: 'faud',
    name: 'Fakultas Ushuluddin dan Dakwah (FAUD)',
    code: 'FAUD',
    defaultCoverColor: 'Biru',
    prodis: [
      'Ilmu Al-Qur\'an dan Tafsir (IAT)',
      'Komunikasi dan Penyiaran Islam (KPI)',
      'Ilmu Hadis (ILHA)',
      'Bimbingan dan Konseling Islam (BKI)',
    ],
  },
  {
    id: 'fasya',
    name: 'Fakultas Syariah (FASYA)',
    code: 'FASYA',
    defaultCoverColor: 'Marron',
    prodis: [
      'Hukum Keluarga Islam / Ahwal Al-Syakhshiyyah (HKI)',
      'Hukum Ekonomi Syariah / Muamalah (HES)',
      'Hukum Tata Negara / Siyasah Syar\'iyyah (HTN)',
    ],
  },
  {
    id: 'pasca',
    name: 'Program Pascasarjana (S2)',
    code: 'PASCA',
    defaultCoverColor: 'Hijau',
    prodis: [
      'Magister Pendidikan Agama Islam (M.Pd)',
      'Magister Hukum Keluarga Islam (M.H)',
      'Magister Manajemen Pendidikan Islam (M.Pd)',
    ],
  },
];

/**
 * Rules per user request:
 * Fatar : Hijau
 * Febi : Kuning
 * USULUDDIN DAN DAKWAH : Biru
 * Fasya : HKI : merah , SYARIAH, HTN: MARRON
 */
export const getCoverColorInfo = (fakultasId: string, prodiName: string = '') => {
  const prodiLower = prodiName.toLowerCase();

  if (fakultasId === 'fatar') {
    return {
      name: 'Hijau',
      badgeBg: 'bg-emerald-600 text-white',
      cardBorder: 'border-emerald-500',
      lightBg: 'bg-emerald-50 text-emerald-900 border-emerald-300',
      hex: '#16a34a',
    };
  }

  if (fakultasId === 'febi') {
    return {
      name: 'Kuning',
      badgeBg: 'bg-yellow-400 text-yellow-950 font-bold',
      cardBorder: 'border-yellow-400',
      lightBg: 'bg-yellow-50 text-yellow-900 border-yellow-300',
      hex: '#eab308',
    };
  }

  if (fakultasId === 'faud') {
    return {
      name: 'Biru',
      badgeBg: 'bg-blue-600 text-white',
      cardBorder: 'border-blue-500',
      lightBg: 'bg-blue-50 text-blue-900 border-blue-300',
      hex: '#2563eb',
    };
  }

  if (fakultasId === 'fasya') {
    if (prodiLower.includes('hki') || prodiLower.includes('keluarga') || prodiLower.includes('syakhshiyyah')) {
      return {
        name: 'Merah (HKI)',
        badgeBg: 'bg-red-600 text-white',
        cardBorder: 'border-red-500',
        lightBg: 'bg-red-50 text-red-900 border-red-300',
        hex: '#dc2626',
      };
    }
    // SYARIAH, HES, HTN -> MARRON
    return {
      name: 'Marron (HES / HTN / Syariah)',
      badgeBg: 'bg-rose-900 text-amber-200',
      cardBorder: 'border-rose-900',
      lightBg: 'bg-rose-50 text-rose-950 border-rose-300',
      hex: '#881337',
    };
  }

  return {
    name: 'Hijau',
    badgeBg: 'bg-emerald-600 text-white',
    cardBorder: 'border-emerald-500',
    lightBg: 'bg-emerald-50 text-emerald-900 border-emerald-300',
    hex: '#16a34a',
  };
};

export const JILID_OPTIONS = [
  {
    id: 'hard_cover',
    label: 'Hard Cover',
    priceBase: 30000,
  },
  {
    id: 'soft_cover',
    label: 'Soft Cover',
    priceBase: 15000,
  }
];

export const DURATION_OPTIONS: DurationOption[] = [
  {
    key: '1_day',
    label: '1 Hari Jadi',
    days: 1,
    pricePerCover: 50000,
    tag: '⚡ 1 Hari Jadi',
    description: 'Pengerjaan kilat 1 hari langsung siap ambil (Rp 50.000 / sampul)',
  },
  {
    key: '2_day',
    label: '2 Hari Jadi',
    days: 2,
    pricePerCover: 40000,
    tag: '⏱️ 2 Hari Jadi',
    description: 'Pengerjaan 2 hari selesai dan rapi (Rp 40.000 / sampul)',
  },
  {
    key: '3_day',
    label: '3 Hari Jadi / Paket Normal',
    days: 3,
    pricePerCover: 30000,
    tag: '🏷️ 3 Hari Jadi (Normal)',
    description: 'Pengerjaan standar 3 hari paling hemat (Rp 30.000 / sampul)',
  },
];

export const EXTRA_SERVICES: ExtraServiceOption[] = [
  {
    id: 'artikel',
    label: 'Artikel',
    price: 20000,
    requiresFile: true,
    description: 'Format naskah artikel jurnal ilmiah siap submit yudisium & cetak naskah',
    badge: 'Upload File',
    promoTag: '🔥 Best Seller Yudisium',
  },
  {
    id: 'cd',
    label: 'CD',
    price: 10000,
    requiresFile: false,
    description: 'Keping CD softcopy skripsi full bab + casing mika tebal & stiker label resmi UIN Madura',
    badge: 'Fisik + Kotak',
    promoTag: '⭐ Wajib Perpus',
  },
  {
    id: 'skek',
    label: 'Buku SKEK',
    price: 5000,
    requiresFile: false,
    description: 'Buku SKEK fisik untuk kelengkapan administrasi wisuda',
    badge: 'Buku Fisik',
    promoTag: '🎯 Praktis',
  },
  {
    id: 'pisah_perpus',
    label: 'Pisah-pisah file untuk Perpus',
    price: 10000,
    requiresFile: true,
    description: 'Pemisahan PDF per bab (Cover, Bab 1-5, Daftar Pustaka) sesuai standar repositori UIN Madura',
    badge: 'Upload File',
    promoTag: '🚀 Bebas Revisi Perpus',
  },
  // SPECIAL PRODI SERVICES PER USER REQUEST:
  {
    id: 'dummy_book',
    label: 'DUMMY BOOK',
    price: 50000, // Default base price or start of range
    requiresFile: true,
    description: 'Pembuatan Dummy Book contoh naskah fisik (Otomatis hitung harga berdasarkan jumlah halaman)',
    badge: 'Upload File / PIAUD',
    promoTag: '🎓 Khusus PIAUD',
    allowedProdiKeywords: ['piaud', 'anak usia dini'],
    specialProdiNote: 'Khusus Mahasiswa Prodi PIAUD',
  },
  {
    id: 'cetak_a5_ipa',
    label: 'Cetak skripsi A5 bolak balik',
    price: 23000, // Default base price or start of range
    requiresFile: true,
    description: 'Cetak naskah skripsi format A5 bolak-balik standar prodi IPS (Otomatis hitung harga berdasarkan jumlah halaman)',
    badge: 'Khusus IPS',
    promoTag: '🔬 Khusus Prodi IPS',
    allowedProdiKeywords: ['ips', 'ilmu pengetahuan sosial'],
    specialProdiNote: 'Khusus Mahasiswa Prodi IPS',
  },
];
