import { DurationKey, OrderRecord, TransactionStatus, CoverType } from '../types';
import { DURATION_OPTIONS, EXTRA_SERVICES, ADMIN_WHATSAPP_INTL, ADMIN_WHATSAPP } from '../data/uinMaduraData';

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
  // Set to 08:00 AM
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

  // Request: Fakultas Syariah (FASYA) harga sampul otomatis dihitung Rp 32.000 untuk paket pengerjaan 3 hari / biasa
  const isSyariah = fakultas.toLowerCase().includes('syariah') || fakultas.toLowerCase().includes('fasya');
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

export const needsAdminVerification = (transactionStatus: TransactionStatus): boolean => {
  return transactionStatus !== 'Bayar Nanti';
};

export const createWhatsAppTextForAdmin = (order: OrderRecord, receiptImageUrl?: string): string => {
  const servicesList =
    order.servicesBreakdown.length > 0
      ? order.servicesBreakdown.map((s) => `  • ${s.label}: ${formatIDR(s.price)}`).join('\n')
      : '  (Tidak ada layanan tambahan)';

  const fileCount = order.uploadedFiles?.length || 0;
  const fileDeliveryText =
    order.fileDeliveryMethod === 'upload_server'
      ? `• Metode Berkas: 📤 Unggah ke Server (${fileCount > 0 ? order.uploadedFiles?.map((f: { name: string }) => f.name).join(', ') : 'File berhasil diunggah'})`
      : `• Metode Berkas: 💬 Kirim via Chat WhatsApp ini`;

  const paymentChannelLabel = order.paymentChannel ? ` - [ ${order.paymentChannel} ]` : '';
  let paymentDetail = `*Status Transaksi:* [ ${order.transactionStatus} ]${paymentChannelLabel}`;
  paymentDetail += `\n*Biaya Print:* ${formatIDR(order.printCost)}`;
  if (order.transactionStatus === 'DP') {
    paymentDetail += `\n*Uang Muka (DP):* ${formatIDR(order.dpAmount)} (${order.paymentChannel || 'Cash/Transfer'})\n*Sisa Tagihan Saat Ambil:* ${formatIDR(order.remainingAmount)}`;
  } else if (order.transactionStatus === 'LUNAS') {
    paymentDetail += `\n*Nominal Lunas:* ${formatIDR(order.totalCost + order.printCost)} (${order.paymentChannel || 'Cash/Transfer'}) - SUDAH DIBAYAR`;
  } else if (order.transactionStatus === 'Bayar Nanti') {
    paymentDetail += `\n🔴 *KATEGORI NOTA: [ NOTA MERAH - BELUM BAYAR ]*\n*Metode:* Bayar Nanti di Loket Saat Pengambilan\n*Total Tagihan Belum Dibayar:* ${formatIDR(order.totalCost + order.printCost)} (Wajib dilunasi saat naskah diambil)`;
  } else {
    paymentDetail += `\n*Tagihan:* ${formatIDR(order.totalCost + order.printCost)} (${order.paymentChannel || 'Cash/Transfer'})`;
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
  const imgSection = actualImgUrl
    ? `\n================================\n🖼️ *LINK GAMBAR STRUK NOTA RESMI (PNG):*\n${actualImgUrl}\n*(Admin ZAIN.NET bisa langsung klik link di atas untuk melihat & memeriksa bukti nota PNG dari WhatsApp tanpa perlu buka website)*`
    : `\n================================\n🖼️ *NOTA PNG RESMI:* Gambar nota PNG otomatis digenerate & tersimpan di sistem ZAIN.NET.`;

  return `*STRUK PEMBAYARAN & NOTA PESANAN - ZAIN.NET*
================================
*ZAIN.NET*
Alamat: Utaranya Indomaret Uin Madura , barat jalan ,samping nya BRI Link
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
*TOTAL BIAYA: ${formatIDR(order.totalCost + order.printCost)}*
${paymentDetail}${adminValidation}${imgSection}
================================
*JADWAL PENGAMBILAN (PASTI):*
📅 *${formatDisplayDate(order.pickupDate)}*
(Pukul 08:00 WIB di ZAIN.NET)
================================
*Tunjukkan bukti struk ini saat mengambil naskah di ZAIN.NET.*`;
};

export const COMPLETE_PACKAGE_SERVICES = ['artikel', 'cd', 'skek', 'pisah_perpus'];
export const COMPLETE_PACKAGE_DEFAULT_COUNT = 3;

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

export const getAdminWhatsAppUrl = (order: OrderRecord, receiptImageUrl?: string): string => {
  const text = encodeURIComponent(createWhatsAppTextForAdmin(order, receiptImageUrl));
  return `https://wa.me/${ADMIN_WHATSAPP_INTL}?text=${text}`;
};

export const getStudentWhatsAppChatUrl = (order: OrderRecord): string => {
  let cleanNumber = (order.whatsapp || '').replace(/\D/g, '');
  if (cleanNumber.startsWith('0')) {
    cleanNumber = '62' + cleanNumber.slice(1);
  } else if (!cleanNumber.startsWith('62')) {
    cleanNumber = '62' + cleanNumber;
  }

  const text = `Halo kak ${order.studentName}, kami dari Admin Percetakan ZAIN.NET terkait pesanan nota ${order.orderId} (Jilid Skripsi ${order.fakultas || 'UIN Madura'} - ${order.coverCount} eks). Mohon konfirmasi, apakah ada berkas/data naskah yang perlu dicek atau dilengkapi? Terima kasih.`;

  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(text)}`;
};

export const createWhatsAppText = (order: OrderRecord, receiptImageUrl?: string): string => {
  return createWhatsAppTextForAdmin(order, receiptImageUrl);
};

export const getFirestoreSchemaSnippet = () => {
  return {
    collection: "orders",
    document_id: "NOT-20261003-782",
    admin_notification: {
      targetWhatsAppAdmin: ADMIN_WHATSAPP,
      autoSent: true,
      exportFormat: "JPG & WhatsApp Payload"
    },
    schema_fields: {
      orderId: "string (e.g. NOT-20261003-782)",
      studentName: "string (e.g. Achmad Farhan)",
      fakultas: "string (e.g. Fakultas Tarbiyah (FATAR))",
      prodi: "string (e.g. Pendidikan Islam Anak Usia Dini (PIAUD))",
      coverColor: "string (FATAR: Hijau, FEBI: Kuning, FAUD: Biru, FASYA HKI: Merah, FASYA HES/HTN: Marron)",
      whatsapp: "string (e.g. 81234567890)",
      coverCount: "number (e.g. 3)",
      durationKey: "string ('1_day' | '2_day' | '3_day')",
      durationLabel: "string (e.g. 1 Hari Jadi)",
      durationDays: "number (e.g. 1)",
      pricePerCover: "number (e.g. 50000)",
      coversSubtotal: "number (e.g. 150000)",
      selectedServices: ["artikel", "cd", "skek", "pisah_perpus", "dummy_book", "cetak_a5_ipa"],
      servicesBreakdown: [
        { "id": "skek", "label": "Buku SKEK", "price": 5000 },
        { "id": "dummy_book", "label": "DUMMY BOOK (Khusus PIAUD)", "price": 20000 }
      ],
      servicesSubtotal: "number (e.g. 25000)",
      totalCost: "number (e.g. 175000)",
      orderDate: "string (ISO format 'YYYY-MM-DD HH:mm')",
      pickupDate: "string (calculated 'orderDate + durationDays')",
      status: "string ('Menunggu' | 'Proses Jilid' | 'Siap Diambil' | 'Selesai')",
      transactionStatus: "string ('Bayar Sekarang' | 'DP' | 'LUNAS')",
      dpAmount: "number (e.g. 88000)",
      remainingAmount: "number (e.g. 87000)",
      adminConfirmed: "boolean (true if confirmed by admin)",
      adminConfirmedAt: "string | null",
      adminConfirmedBy: "string | null",
      createdAt: "number (unix epoch milliseconds)"
    }
  };
};
