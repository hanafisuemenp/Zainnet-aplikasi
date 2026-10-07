import { DurationKey, OrderRecord, TransactionStatus, CoverType } from '../types';
import {
  DURATION_OPTIONS,
  EXTRA_SERVICES,
  ADMIN_WHATSAPP_INTL,
  ADMIN_WHATSAPP,
  PERCETAKAN_ADDRESS
} from '../data/uinMaduraData';
import { CUSTOM_DOMAIN } from './seoUtils';

export const formatIDR = (val: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(val);
};

export const padZero = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

export const formatDateToCustom = (date: Date): string => {
  const yyyy = date.getFullYear();
  const mm = padZero(date.getMonth() + 1);
  const dd = padZero(date.getDate());
  const hh = padZero(date.getHours());
  const min = padZero(date.getMinutes());
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
};

export const formatDisplayDate = (dateStr: string): string => {
  try {
    const [datePart, timePart] = dateStr.split(' ');
    const [y, m, d] = datePart.split('-');
    const dateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const monthNames = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const dayName = dayNames[dateObj.getDay()];
    const monthName = monthNames[dateObj.getMonth()];
    return `${dayName}, ${parseInt(d)} ${monthName} ${y} pukul ${timePart || '08:00'} WIB`;
  } catch {
    return dateStr;
  }
};

export const computePickupDate = (baseDate: Date, durationDays: number): string => {
  const pickup = new Date(baseDate.getTime());
  pickup.setDate(pickup.getDate() + durationDays);
  pickup.setHours(8, 0, 0, 0);
  return formatDateToCustom(pickup);
};

export const generateOrderCode = (date: Date = new Date()): string => {
  const yyyy = date.getFullYear();
  const mm = padZero(date.getMonth() + 1);
  const dd = padZero(date.getDate());
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  return `NOT-${yyyy}${mm}${dd}-${randomSuffix}`;
};

export const getStudentSlug = (studentName: string): string => {
  return studentName.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || 'mahasiswa';
};

export const getStudentTrackingUrl = (studentName: string): string => {
  return `${CUSTOM_DOMAIN}/nota${getStudentSlug(studentName)}`;
};

export const calculateOrderPricing = (
  coverCount: number,
  durationKey: DurationKey,
  selectedServiceIds: string[],
  pageCount: number = 0,
  coverType: CoverType = 'hard_cover',
  fakultas: string = ''
) => {
  const durationOpt = DURATION_OPTIONS.find((d) => d.key === durationKey) || DURATION_OPTIONS[2];
  const count = Math.max(1, Math.floor(coverCount || 1));
  
  // Soft cover: Rp 15.000 / jilid; Hard cover: based on duration
  let pricePerCover = coverType === 'soft_cover' ? 15000 : durationOpt.pricePerCover;

  // Khusus Fakultas Syariah harga sampul lebih mahal 2rb untuk paket pengerjaan 3 hari / biasa (Rp 32.000)
  const isSyariah = (fakultas || '').toLowerCase().includes('syariah') || (fakultas || '').toLowerCase().includes('fasya');
  if (isSyariah && durationKey === '3_day' && coverType !== 'soft_cover') {
    pricePerCover = 32000;
  }
  
  const coversSubtotal = pricePerCover * count;

  const servicesBreakdown = selectedServiceIds
    .map((id) => {
      const item = EXTRA_SERVICES.find((s) => s.id === id);
      if (!item) return null;

      let price = item.price;

      // Special dynamic pricing logic
      if (item.id === 'dummy_book' && pageCount > 0) {
        if (pageCount >= 80 && pageCount <= 110) price = 50000;
        else if (pageCount >= 111 && pageCount <= 130) price = 65000;
        else if (pageCount >= 131 && pageCount <= 160) price = 70000;
        else if (pageCount >= 161 && pageCount <= 180) price = 75000;
      } else if (item.id === 'cetak_a5_ipa' && pageCount > 0) {
        if (pageCount >= 80 && pageCount <= 100) price = 23000;
        else if (pageCount >= 101 && pageCount <= 130) price = 24000;
        else if (pageCount >= 131 && pageCount <= 160) price = 25000;
        else if (pageCount >= 161 && pageCount <= 180) price = 27000;
      }

      return { id: item.id, label: item.label, price };
    })
    .filter(Boolean) as Array<{ id: string; label: string; price: number }>;

  const servicesSubtotal = servicesBreakdown.reduce((sum, item) => sum + item.price, 0);
  const totalCost = coversSubtotal + servicesSubtotal;

  const standardDp = Math.ceil((totalCost * 0.5) / 1000) * 1000;

  return {
    count,
    coverType,
    pricePerCover,
    durationOpt,
    coversSubtotal,
    servicesBreakdown,
    servicesSubtotal,
    totalCost,
    standardDp,
  };
};

export const needsAdminVerification = (order: OrderRecord): boolean => {
  return order.transactionStatus !== 'Bayar Nanti';
};

export const createWhatsAppTextForAdmin = (
  order: OrderRecord,
  receiptImageUrl?: string,
  customTrackingUrl?: string
): string => {
  const servicesList =
    order.servicesBreakdown.length > 0
      ? order.servicesBreakdown.map((s) => `  • ${s.label}: ${formatIDR(s.price)}`).join('\n')
      : '  (Tidak ada layanan tambahan)';

  const fileCount = order.uploadedFiles?.length || 0;
  const fileDeliveryText =
    order.fileDeliveryMethod === 'upload_server'
      ? `• Metode Berkas: 📤 Unggah ke Server (${fileCount > 0 ? order.uploadedFiles?.map((f: { name: string }) => f.name).join(', ') : 'File tersimpan di server'})`
      : `• Metode Berkas: 💬 Kirim via Chat WhatsApp ini`;

  const paymentChannelLabel = order.paymentChannel ? ` - [ ${order.paymentChannel} ]` : '';
  const printCostNum = order.printCost || 0;
  let paymentDetail = `*Status Transaksi:* [ ${order.transactionStatus} ]${paymentChannelLabel}`;
  if (printCostNum > 0) {
    paymentDetail += `\n*Biaya Cetak/Print:* ${formatIDR(printCostNum)}`;
  }

  if (order.transactionStatus === 'DP') {
    paymentDetail += `\n*Uang Muka (DP):* ${formatIDR(order.dpAmount)} (${order.paymentChannel || 'Cash/Transfer'})\n*Sisa Tagihan Saat Ambil:* ${formatIDR(order.remainingAmount)}`;
  } else if (order.transactionStatus === 'LUNAS') {
    paymentDetail += `\n*Nominal Lunas:* ${formatIDR(order.totalCost + printCostNum)} (${order.paymentChannel || 'Cash/Transfer'}) - SUDAH DIBAYAR`;
  } else if (order.transactionStatus === 'Bayar Nanti') {
    paymentDetail += `\n🔴 *KATEGORI NOTA: [ NOTA MERAH - BELUM BAYAR ]*\n*Metode:* Bayar Nanti di Loket Saat Pengambilan\n*Total Tagihan Belum Dibayar:* ${formatIDR(order.totalCost + printCostNum)} (Wajib dilunasi saat naskah diambil)`;
  } else {
    paymentDetail += `\n*Tagihan:* ${formatIDR(order.totalCost + printCostNum)} (${order.paymentChannel || 'Cash/Transfer'})`;
  }

  let adminValidation = '';
  if (order.transactionStatus === 'Bayar Nanti') {
    adminValidation = '\n🔴 *Status Pembayaran:* NOTA MERAH - BELUM BAYAR (Bayar tunai di loket saat pengambilan naskah skripsi)';
  } else if (order.adminConfirmed) {
    adminValidation = `\n✅ *Status Verifikasi Admin:* SUDAH DIVERIFIKASI SAH (${order.adminConfirmedBy || 'Admin Loket ZAIN.NET'}${order.adminConfirmedAt ? ` • ${order.adminConfirmedAt}` : ''})`;
  } else {
    adminValidation = `\n⏳ *Status Verifikasi Admin:* WAJIB DIVERIFIKASI OLEH ADMIN LOKET\n*(Menunggu dicek & diverifikasi di Panel Admin)*`;
  }

  const coverLabel = order.coverType === 'soft_cover' ? 'Soft Cover' : `Hard Cover (${order.coverColor})`;
  const universityText = order.university ? `• Kampus/Univ: ${order.university}` : '• Kampus/Univ: UIN Madura';

  const actualImgUrl = receiptImageUrl || order.receiptImageFullUrl || order.receiptImageUrl;
  const trackingLink = customTrackingUrl || getStudentTrackingUrl(order.studentName);

  let linkSection = `\n================================\n🌐 *LINK PANTAU PENGERJAAN & UNDUH STRUK:*\n${trackingLink}\n*(Mahasiswa & Admin bisa klik link ini untuk memantau status pengerjaan atau mendownload ulang struk nota kapan saja)*`;

  if (actualImgUrl) {
    linkSection += `\n\n🖼️ *LINK GAMBAR STRUK NOTA RESMI (PNG):*\n${actualImgUrl}\n*(Admin ZAIN.NET bisa langsung klik untuk melihat gambar nota PNG tanpa buka web)*`;
  }

  return `*STRUK PEMBAYARAN & NOTA PESANAN - ZAIN.NET*
================================
*ZAIN.NET*
Alamat: ${PERCETAKAN_ADDRESS}
WA Admin: ${ADMIN_WHATSAPP}
================================
*No. Nota:* ${order.orderId}
*Tanggal Masuk:* ${order.orderDate} WIB

*DATA PEMESAN:*
• Nama Mahasiswa: ${order.studentName}
${universityText}
• Fakultas: ${order.fakultas}
• Prodi: ${order.prodi}
• Jenis Jilid: *${coverLabel}*
• No. WhatsApp: https://wa.me/62${order.whatsapp.replace(/\D/g, '')}
${fileDeliveryText}

*RINCIAN ORDER:*
• Jumlah Buku: ${order.coverCount} eksemplar
• Jenis Jilid: ${order.coverType === 'soft_cover' ? 'Soft Cover' : 'Hard Cover'} (${formatIDR(order.pricePerCover)}/buku)
• Subtotal Jilid: ${formatIDR(order.coversSubtotal)}

*LAYANAN TAMBAHAN:*
${servicesList}
• Subtotal Layanan: ${formatIDR(order.servicesSubtotal)}
--------------------------------
*TOTAL BIAYA: ${formatIDR(order.totalCost + printCostNum)}*
${paymentDetail}${adminValidation}${linkSection}
================================
*JADWAL PENGAMBILAN (PASTI):*
📅 *${formatDisplayDate(order.pickupDate)}*
(Pukul 08:00 WIB di ZAIN.NET)
================================
*Tunjukkan bukti struk ini saat mengambil naskah di ZAIN.NET.*`;
};

export const getAdminWhatsAppUrl = (
  order: OrderRecord,
  receiptImageUrl?: string,
  studentNotaUrl?: string
): string => {
  const text = encodeURIComponent(createWhatsAppTextForAdmin(order, receiptImageUrl, studentNotaUrl));
  return `https://wa.me/${ADMIN_WHATSAPP_INTL}?text=${text}`;
};

export const createWhatsAppText = (
  order: OrderRecord,
  receiptImageUrl?: string,
  studentNotaUrl?: string
): string => {
  return createWhatsAppTextForAdmin(order, receiptImageUrl, studentNotaUrl);
};

export interface PickupUrgencyInfo {
  type: 'overdue' | 'today' | 'tomorrow' | 'upcoming';
  label: string;
  badgeClass: string;
  isUrgent: boolean;
  daysDiff: number;
}

export const getPickupUrgency = (pickupDateStr: string): PickupUrgencyInfo => {
  try {
    const [datePart] = (pickupDateStr || '').split(' ');
    if (!datePart) {
      return { type: 'upcoming', label: 'Mendatang', badgeClass: 'bg-slate-100 text-slate-700 border-slate-300', isUrgent: false, daysDiff: 99 };
    }
    const [y, m, d] = datePart.split('-').map(Number);
    const targetDate = new Date(y, m - 1, d);
    targetDate.setHours(0, 0, 0, 0);

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    today.setHours(0, 0, 0, 0);

    const msPerDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.round((targetDate.getTime() - today.getTime()) / msPerDay);

    if (diffDays < 0) {
      return {
        type: 'overdue',
        label: `Lewat ${Math.abs(diffDays)} Hari!`,
        badgeClass: 'bg-red-100 text-red-900 border-red-300 font-black animate-pulse',
        isUrgent: true,
        daysDiff: diffDays,
      };
    }
    if (diffDays === 0) {
      return {
        type: 'today',
        label: 'Diambil HARI INI',
        badgeClass: 'bg-amber-100 text-amber-950 border-amber-400 font-black',
        isUrgent: true,
        daysDiff: 0,
      };
    }
    if (diffDays === 1) {
      return {
        type: 'tomorrow',
        label: 'Diambil BESOK (H-1)',
        badgeClass: 'bg-rose-100 text-rose-950 border-rose-300 font-black ring-2 ring-rose-400/40',
        isUrgent: true,
        daysDiff: 1,
      };
    }
    return {
      type: 'upcoming',
      label: `H-${diffDays} (${diffDays} hari lagi)`,
      badgeClass: 'bg-emerald-50 text-emerald-900 border-emerald-200',
      isUrgent: false,
      daysDiff: diffDays,
    };
  } catch {
    return {
      type: 'upcoming',
      label: 'Mendatang',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
      isUrgent: false,
      daysDiff: 99,
    };
  }
};

export const isPickupTomorrow = (pickupDateStr: string): boolean => {
  return getPickupUrgency(pickupDateStr).type === 'tomorrow';
};

export const getFirestoreSchemaSnippet = () => {
  return {
    collection: 'orders_hardcover_uin_madura',
    description: 'Koleksi penyimpanan permanen transaksi & nota jilid skripsi UIN Madura',
    schemaVersion: '2.0.0',
    primaryKey: 'orderId',
    sampleDocument: {
      orderId: 'NOT-20261003-882',
      studentName: 'Ahmad Sugianto',
      fakultas: 'Fakultas Syariah (FASYA)',
      prodi: 'Hukum Ekonomi Syariah (HES)',
      whatsapp: '81234567890',
      coverType: 'hard_cover',
      coverCount: 3,
      durationKey: '3_day',
      durationLabel: '3 Hari Jadi / Paket Normal',
      pricePerCover: 32000,
      coversSubtotal: 96000,
      selectedServices: ['cd', 'skek', 'pisah_perpus'],
      servicesSubtotal: 25000,
      totalCost: 121000,
      transactionStatus: 'DP',
      dpAmount: 61000,
      remainingAmount: 60000,
      status: 'Proses Jilid',
      adminConfirmed: true,
      adminConfirmedBy: 'Admin ZAIN.NET',
      adminConfirmedAt: '2026-10-07 10:00',
      orderDate: '2026-10-07 10:00',
      pickupDate: '2026-10-10 08:00',
      trackingUrl: 'https://www.karyazainnet.net/notaahmadsugianto',
      createdAt: 1728295200000,
    },
  };
};
