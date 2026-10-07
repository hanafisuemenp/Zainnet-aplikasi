import React, { useState, useRef } from 'react';
import {
  Printer,
  Share2,
  Copy,
  Check,
  X,
  Calendar,
  Clock,
  QrCode,
  Download,
  Send,
  Loader2,
  CheckCircle2,
  MapPin,
  Phone,
  Globe,
  Link2
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { OrderRecord, TransactionStatus } from '../types';
import {
  formatIDR,
  formatDisplayDate,
  createWhatsAppTextForAdmin,
  getAdminWhatsAppUrl,
  getStudentTrackingUrl
} from '../utils/pricing';
import {
  ADMIN_WHATSAPP,
  PERCETAKAN_NAME,
  PERCETAKAN_ADDRESS
} from '../data/uinMaduraData';

interface InvoiceModalProps {
  order: OrderRecord;
  onClose: () => void;
  onViewSchema?: () => void;
  onUpdateStatus?: (
    orderId: string,
    status: OrderRecord['status'],
    transactionStatus: TransactionStatus,
    adminConfirmed: boolean,
    adminConfirmedBy?: string
  ) => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  order,
  onClose,
  onUpdateStatus
}) => {
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [printLayout, setPrintLayout] = useState<'a4' | 'thermal'>('a4');
  
  // Local state synced with order
  const [currentTransStatus, setCurrentTransStatus] = useState<TransactionStatus>(order.transactionStatus);
  const [currentOrderStatus, setCurrentOrderStatus] = useState<OrderRecord['status']>(order.status);
  const [isAdminConfirmed, setIsAdminConfirmed] = useState<boolean>(order.adminConfirmed);
  const [adminName] = useState<string>(order.adminConfirmedBy || 'Admin ZAIN.NET');

  const receiptRef = useRef<HTMLDivElement>(null);

  const studentTrackingUrl = getStudentTrackingUrl(order.studentName);

  const handleCopyTrackingLink = () => {
    navigator.clipboard.writeText(studentTrackingUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Download high-resolution receipt image (skipFonts to prevent CSS rules errors)
  const handleDownloadImage = async () => {
    if (!receiptRef.current) return;
    try {
      setIsDownloading(true);
      const dataUrl = await toPng(receiptRef.current, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        skipFonts: true,
        fontEmbedCSS: '',
      });

      const cleanName = order.studentName.trim().replace(/[^a-zA-Z0-9]/g, '_') || 'Mahasiswa';
      const link = document.createElement('a');
      link.download = `Struk_${PERCETAKAN_NAME}_${order.orderId}_${cleanName}.png`;
      link.href = dataUrl;
      link.click();

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to generate receipt image', err);
      window.print();
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyText = () => {
    const text = createWhatsAppTextForAdmin({
      ...order,
      transactionStatus: currentTransStatus,
      status: currentOrderStatus,
      adminConfirmed: isAdminConfirmed,
      adminConfirmedBy: adminName,
    });
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSendToAdminWhatsApp = () => {
    const activeOrder: OrderRecord = {
      ...order,
      transactionStatus: currentTransStatus,
      status: currentOrderStatus,
      adminConfirmed: isAdminConfirmed,
      adminConfirmedBy: adminName,
    };

    const waUrl = getAdminWhatsAppUrl(activeOrder);
    window.open(waUrl, '_blank');
  };

  const handleConfirmAdmin = (confirm: boolean, newTrans?: TransactionStatus) => {
    const updatedTrans = newTrans || currentTransStatus;
    setIsAdminConfirmed(confirm);
    if (newTrans) setCurrentTransStatus(newTrans);

    if (onUpdateStatus) {
      onUpdateStatus(
        order.orderId,
        currentOrderStatus,
        updatedTrans,
        confirm,
        confirm ? adminName : undefined
      );
    }
  };

  const handleOrderStatusChange = (newStatus: OrderRecord['status']) => {
    setCurrentOrderStatus(newStatus);
    if (onUpdateStatus) {
      onUpdateStatus(
        order.orderId,
        newStatus,
        currentTransStatus,
        isAdminConfirmed,
        isAdminConfirmed ? adminName : undefined
      );
    }
  };

  const isSoftCover = order.coverType === 'soft_cover';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      {/* Modal Container */}
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[96vh] flex flex-col">
        
        {/* Top Control Bar */}
        <div className="no-print bg-slate-900 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-white">{PERCETAKAN_NAME}</span>
            <span className="text-slate-400 text-xs">| Struk Pesanan</span>
            <span className="text-xs bg-emerald-900 text-emerald-200 px-2 py-0.5 rounded font-mono font-semibold">
              {order.orderId}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-800 rounded-lg p-0.5 text-xs font-medium">
              <button
                onClick={() => setPrintLayout('a4')}
                className={`px-2.5 py-1 rounded-md transition ${
                  printLayout === 'a4' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-300 hover:text-white'
                }`}
              >
                Layout Standar
              </button>
              <button
                onClick={() => setPrintLayout('thermal')}
                className={`px-2.5 py-1 rounded-md transition ${
                  printLayout === 'thermal' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-300 hover:text-white'
                }`}
              >
                Thermal
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto p-4 sm:p-6 bg-slate-100 flex-1">
          
          {/* NOTICE BANNER & DOWNLOAD BUTTON */}
          <div className="no-print mb-4 bg-emerald-900 text-white p-3.5 rounded-xl shadow-sm border border-emerald-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-400 text-emerald-950 flex items-center justify-center font-bold shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">
                  Pesanan Berhasil Disimpan
                </div>
                <div className="text-[11px] text-emerald-200">
                  Unduh struk ini sebagai bukti pembayaran dan bukti saat pengambilan.
                </div>
              </div>
            </div>

            <button
              onClick={handleDownloadImage}
              disabled={isDownloading}
              className="px-3.5 py-2 bg-amber-400 hover:bg-amber-500 text-emerald-950 font-bold text-xs rounded-lg shadow transition flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Mengunduh...</span>
                </>
              ) : downloadSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Tersimpan!</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh Struk (Gambar)</span>
                </>
              )}
            </button>
          </div>

          {/* CUSTOM DOMAIN STUDENT TRACKING & RECEIPT REDOWNLOAD LINK */}
          <div className="no-print mb-4 bg-white p-4 rounded-xl border border-emerald-300 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                    Link Pantau Pengerjaan & Unduh Ulang Struk
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-mono font-bold">
                      www.karyazainnet.net
                    </span>
                  </div>
                  <div className="text-xs font-mono text-emerald-700 font-black break-all mt-1 select-all bg-emerald-50/80 px-2.5 py-1 rounded-md border border-emerald-200 inline-block">
                    {studentTrackingUrl}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                    Mahasiswa dapat membuka link ini kapan saja di HP / laptop untuk memantau status pesanan (Proses Jilid / Siap Diambil) dan mendownload ulang struk nota.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <button
                  type="button"
                  onClick={handleCopyTrackingLink}
                  className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-bold rounded-lg border border-emerald-300 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title="Salin link pelacakan untuk dikirim ke mahasiswa"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Link2 className="w-3.5 h-3.5" />
                      <span>Salin Link</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* PROGRESS STEP INDICATOR */}
            <div className="mt-3.5 pt-3 border-t border-slate-100 grid grid-cols-4 gap-2 text-center">
              {[
                { key: 'Menunggu', label: '1. Menunggu' },
                { key: 'Proses Jilid', label: '2. Proses Jilid' },
                { key: 'Siap Diambil', label: '3. Siap Diambil' },
                { key: 'Selesai', label: '4. Selesai' }
              ].map((step, idx) => {
                const statusOrder = ['Menunggu', 'Proses Jilid', 'Siap Diambil', 'Selesai'];
                const currentIdx = statusOrder.indexOf(currentOrderStatus);
                const isPastOrCurrent = currentIdx >= idx;
                const isCurrent = currentOrderStatus === step.key;

                return (
                  <div
                    key={step.key}
                    className={`py-1.5 px-1 rounded-lg text-[10px] font-bold border transition ${
                      isCurrent
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : isPastOrCurrent
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-slate-50 text-slate-400 border-slate-200'
                    }`}
                  >
                    {step.label}
                  </div>
                );
              })}
            </div>
          </div>

          {/* SIMPLIFIED PRINTABLE / DOWNLOADABLE RECEIPT */}
          <div
            ref={receiptRef}
            id="printable-nota"
            className={`printable-invoice bg-white mx-auto shadow-sm border border-slate-300 text-slate-800 transition-all ${
              printLayout === 'thermal'
                ? 'max-w-sm p-4 font-mono text-xs rounded-none border-dashed'
                : 'max-w-xl p-6 sm:p-7 rounded-xl'
            }`}
          >
            {/* KOP NOTA SIMPLE */}
            <div className="text-center pb-3 border-b border-slate-300 mb-4">
              <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">
                {PERCETAKAN_NAME}
              </h2>
              <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                {PERCETAKAN_ADDRESS}
              </p>
              <p className="text-[11px] text-slate-500 font-medium">
                WhatsApp: {ADMIN_WHATSAPP}
              </p>
            </div>

            {/* INFO TRANSAKSI DUA KOLOM */}
            <div className="grid grid-cols-2 gap-3 pb-3 mb-3 border-b border-slate-200 text-xs">
              <div className="space-y-1">
                <div>
                  <span className="text-slate-400">No. Nota:</span>{' '}
                  <span className="font-bold text-slate-900 font-mono">{order.orderId}</span>
                </div>
                <div>
                  <span className="text-slate-400">Tanggal:</span>{' '}
                  <span className="text-slate-700">{order.orderDate} WIB</span>
                </div>
                <div>
                  <span className="text-slate-400">Mahasiswa:</span>{' '}
                  <strong className="text-slate-900">{order.studentName}</strong>
                </div>
                <div>
                  <span className="text-slate-400">WhatsApp:</span>{' '}
                  <span className="font-mono text-slate-800">+62 {order.whatsapp}</span>
                </div>
              </div>

              <div className="space-y-1 text-right">
                <div>
                  <span className="text-slate-400">Fakultas:</span>{' '}
                  <span className="text-slate-800 font-medium">{order.fakultas}</span>
                </div>
                <div>
                  <span className="text-slate-400">Prodi:</span>{' '}
                  <span className="text-slate-800 font-medium">{order.prodi}</span>
                </div>
                <div>
                  <span className="text-slate-400">Jenis:</span>{' '}
                  <strong className="text-slate-900">
                    {isSoftCover ? 'Soft Cover' : `Hard Cover (${order.coverColor})`}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400">Status Bayar:</span>{' '}
                  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                    currentTransStatus === 'LUNAS'
                      ? 'bg-emerald-100 text-emerald-900'
                      : currentTransStatus === 'DP'
                      ? 'bg-amber-100 text-amber-900'
                      : currentTransStatus === 'Bayar Nanti'
                      ? 'bg-indigo-100 text-indigo-900'
                      : 'bg-blue-100 text-blue-900'
                  }`}>
                    {currentTransStatus}
                  </span>
                </div>
              </div>
            </div>

            {/* JADWAL PENGAMBILAN NASKAH (SIMPEL) */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-700 shrink-0" />
                <div>
                  <span className="text-slate-500 font-medium">Jadwal Pengambilan:</span>
                  <div className="font-bold text-slate-900 text-sm">
                    {formatDisplayDate(order.pickupDate)}
                  </div>
                </div>
              </div>
              <div className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded">
                Pukul 08:00 WIB
              </div>
            </div>

            {/* TABEL ITEM & BIAYA (SIMPEL) */}
            <div className="mb-4">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-300 text-slate-500 bg-slate-50">
                    <th className="py-1.5 px-2 text-left font-semibold">Item</th>
                    <th className="py-1.5 px-2 text-center font-semibold">Qty</th>
                    <th className="py-1.5 px-2 text-right font-semibold">Harga</th>
                    <th className="py-1.5 px-2 text-right font-semibold">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-2 px-2">
                      <div className="font-bold text-slate-900">
                        {isSoftCover ? 'Soft Cover' : 'Hard Cover'}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {isSoftCover ? 'Jilid Standar' : `Warna ${order.coverColor} &bull; ${order.durationLabel}`}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center font-medium">
                      {order.coverCount}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-slate-600">
                      {formatIDR(order.pricePerCover)}
                    </td>
                    <td className="py-2 px-2 text-right font-mono font-bold text-slate-900">
                      {formatIDR(order.coversSubtotal)}
                    </td>
                  </tr>

                  {order.servicesBreakdown.map((s) => (
                    <tr key={s.id}>
                      <td className="py-1.5 px-2 font-medium text-slate-800">
                        {s.label}
                      </td>
                      <td className="py-1.5 px-2 text-center text-slate-500">
                        1
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono text-slate-600">
                        {formatIDR(s.price)}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-medium text-slate-900">
                        {formatIDR(s.price)}
                      </td>
                    </tr>
                  ))}
                </tbody>

                <tfoot>
                  <tr className="border-t-2 border-slate-800 font-bold text-sm">
                    <td colSpan={3} className="py-2.5 px-2 text-right text-slate-900 uppercase">
                      TOTAL:
                    </td>
                    <td className="py-2.5 px-2 text-right font-black text-slate-900 font-mono text-base">
                      {formatIDR(order.totalCost)}
                    </td>
                  </tr>

                  {currentTransStatus === 'DP' && (
                    <>
                      <tr className="text-xs text-amber-900 border-t border-slate-200">
                        <td colSpan={3} className="py-1.5 px-2 text-right">
                          DP (Uang Muka):
                        </td>
                        <td className="py-1.5 px-2 text-right font-bold font-mono">
                          {formatIDR(order.dpAmount)}
                        </td>
                      </tr>
                      <tr className="text-xs text-amber-950 font-bold border-t border-slate-200">
                        <td colSpan={3} className="py-1.5 px-2 text-right uppercase">
                          Sisa Saat Ambil:
                        </td>
                        <td className="py-1.5 px-2 text-right font-black font-mono">
                          {formatIDR(order.remainingAmount)}
                        </td>
                      </tr>
                    </>
                  )}

                  {currentTransStatus === 'Bayar Nanti' && (
                    <tr className="text-xs text-indigo-900 font-bold border-t border-slate-200">
                      <td colSpan={3} className="py-1.5 px-2 text-right uppercase">
                        Bayar di Loket:
                      </td>
                      <td className="py-1.5 px-2 text-right font-black font-mono">
                        {formatIDR(order.totalCost)}
                      </td>
                    </tr>
                  )}

                  {currentTransStatus === 'LUNAS' && (
                    <tr className="text-xs text-emerald-900 font-bold border-t border-slate-200">
                      <td colSpan={3} className="py-1.5 px-2 text-right uppercase">
                        Status Pembayaran:
                      </td>
                      <td className="py-1.5 px-2 text-right font-black font-mono">
                        LUNAS
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>

            {/* FOOTER & TANDA TANGAN SIMPEL */}
            <div className="pt-3 border-t border-dashed border-slate-300 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-11 h-11 bg-slate-50 border border-slate-300 rounded flex items-center justify-center">
                  <QrCode className="w-9 h-9 text-slate-800" />
                </div>
                <div className="text-[10px] text-slate-500">
                  <div className="font-bold text-slate-700">{PERCETAKAN_NAME}</div>
                  <div className="font-mono text-slate-400">{order.orderId}</div>
                </div>
              </div>

              <div className="text-right text-[11px]">
                <div className="text-slate-400 mb-6">Petugas,</div>
                <div className="font-bold text-slate-800 underline">
                  ( {isAdminConfirmed ? adminName : PERCETAKAN_NAME} )
                </div>
              </div>
            </div>

            {/* LINK TRACKING DI STRUK CETAK */}
            <div className="mt-3 py-1.5 px-2 bg-slate-50 border border-slate-200 rounded text-[10px] text-slate-600 flex flex-wrap items-center justify-between gap-1">
              <span className="font-semibold text-slate-700">Pantau Pengerjaan & Unduh Struk:</span>
              <span className="font-mono font-bold text-emerald-800">{studentTrackingUrl}</span>
            </div>

            <div className="mt-2 pt-1.5 border-t border-slate-100 text-[10px] text-slate-400 text-center italic">
              Tunjukkan bukti struk ini saat mengambil naskah di {PERCETAKAN_NAME}.
            </div>
          </div>

          {/* ADMIN STATUS CONTROLS (NO PRINT) */}
          <div className="no-print max-w-xl mx-auto mt-4 p-3 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-600">Status Pengerjaan:</span>
              <select
                value={currentOrderStatus}
                onChange={(e) => handleOrderStatusChange(e.target.value as OrderRecord['status'])}
                className="px-2 py-1 rounded border border-slate-300 font-semibold bg-white text-xs"
              >
                <option value="Menunggu">Menunggu</option>
                <option value="Proses Jilid">Proses Jilid</option>
                <option value="Siap Diambil">Siap Diambil</option>
                <option value="Selesai">Selesai</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-600">Status Transaksi:</span>
              <select
                value={currentTransStatus}
                onChange={(e) => {
                  const val = e.target.value as TransactionStatus;
                  setCurrentTransStatus(val);
                  if (onUpdateStatus) {
                    onUpdateStatus(order.orderId, currentOrderStatus, val, isAdminConfirmed, adminName);
                  }
                }}
                className="px-2 py-1 rounded border border-slate-300 font-semibold bg-white text-xs"
              >
                <option value="Bayar Sekarang">Bayar Sekarang</option>
                <option value="DP">DP (Uang Muka)</option>
                <option value="LUNAS">LUNAS</option>
                <option value="Bayar Nanti">Bayar Nanti</option>
              </select>
            </div>
          </div>

        </div>

        {/* BOTTOM ACTION BUTTONS */}
        <div className="no-print bg-white px-5 py-3.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyText}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin Teks</span>
                </>
              )}
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak / PDF</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadImage}
              disabled={isDownloading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-emerald-950 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 transition cursor-pointer"
            >
              {isDownloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5 text-emerald-900" />
              )}
              <span>{downloadSuccess ? 'Terunduh!' : 'Unduh Gambar'}</span>
            </button>

            <button
              onClick={handleSendToAdminWhatsApp}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-emerald-950 bg-amber-400 hover:bg-amber-500 shadow-sm transition cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Kirim ke WA</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
