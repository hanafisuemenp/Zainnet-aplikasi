import React, { useState, useMemo } from 'react';
import {
  Search,
  FileText,
  Calendar,
  Clock,
  Printer,
  Trash2,
  Download,
  Filter,
  Eye,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  Phone,
  ShieldCheck,
  BadgeCheck,
  CreditCard,
  Bell,
  Volume2,
  VolumeX,
  FileDown,
  UploadCloud,
  Layers,
  Lock,
  Unlock,
  Building,
  UserRound,
  ExternalLink,
  MessageCircle,
  AlertTriangle,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { OrderRecord, TransactionStatus, UploadedFileInfo } from '../types';
import {
  formatIDR,
  formatDisplayDate,
  getPickupUrgency,
  isPickupTomorrow,
  createWhatsAppTextForAdmin,
  getAdminWhatsAppUrl,
  getStudentWhatsAppChatUrl
} from '../utils/pricing';
import { playJilidUrgentAlarm } from '../utils/audioAlert';
import { ADMIN_WHATSAPP, PERCETAKAN_ADDRESS, PERCETAKAN_NAME } from '../data/uinMaduraData';
import { getAllStoredFiles } from '../utils/fileStorage';

interface OrderHistoryProps {
  orders: OrderRecord[];
  onSelectOrder: (order: OrderRecord) => void;
  onDeleteOrder: (orderId: string) => void;
  onCreateNew: () => void;
  onToggleAdminConfirm?: (orderId: string) => void;
  onUpdateStatus?: (
    orderId: string,
    status: OrderRecord['status'],
    trans: TransactionStatus,
    confirmed: boolean,
    confirmedBy?: string
  ) => void;
  isAdmin: boolean;
  onOpenAdminLogin: () => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  onRefreshOrders?: () => Promise<void> | void;
  isRefreshing?: boolean;
}

export const OrderHistory: React.FC<OrderHistoryProps> = ({
  orders,
  onSelectOrder,
  onDeleteOrder,
  onCreateNew,
  onToggleAdminConfirm,
  onUpdateStatus,
  isAdmin,
  onOpenAdminLogin,
  soundEnabled = true,
  onToggleSound,
  onRefreshOrders,
  isRefreshing = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [transFilter, setTransFilter] = useState<string>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | 'tomorrow' | 'today' | 'urgent'>('all');
  const [deleteCandidate, setDeleteCandidate] = useState<OrderRecord | null>(null);

  // Calculate urgent orders count
  const tomorrowOrders = useMemo(() => {
    return orders.filter(
      (o) => isPickupTomorrow(o.pickupDate) && o.status !== 'Selesai'
    );
  }, [orders]);

  const todayOrders = useMemo(() => {
    return orders.filter(
      (o) => getPickupUrgency(o.pickupDate).type === 'today' && o.status !== 'Selesai'
    );
  }, [orders]);

  const urgentOrdersTotal = useMemo(() => {
    return orders.filter((o) => {
      const u = getPickupUrgency(o.pickupDate);
      return (u.type === 'tomorrow' || u.type === 'today' || u.type === 'overdue') && o.status !== 'Selesai';
    });
  }, [orders]);

  // Orders needing admin payment verification (all except 'Bayar Nanti')
  const needsVerificationOrders = useMemo(() => {
    return orders.filter(
      (o) => o.transactionStatus !== 'Bayar Nanti' && !o.adminConfirmed
    );
  }, [orders]);

  // Nota Merah: Orders with 'Bayar Nanti' (unpaid / pay on counter pickup)
  const bayarNantiOrders = useMemo(() => {
    return orders.filter((o) => o.transactionStatus === 'Bayar Nanti');
  }, [orders]);

  // Total summary statistics
  const stats = useMemo(() => {
    const totalOrders = orders.length;
    const totalCovers = orders.reduce((sum, o) => sum + (o.coverCount || 1), 0);
    const totalRevenue = orders.reduce((sum, o) => sum + (o.totalCost || 0) + (o.printCost || 0), 0);
    const inProgress = orders.filter((o) => o.status === 'Proses Jilid' || o.status === 'Menunggu').length;
    const readyPickup = orders.filter((o) => o.status === 'Siap Diambil').length;
    const pendingVerification = needsVerificationOrders.length;
    return { totalOrders, totalCovers, totalRevenue, inProgress, readyPickup, pendingVerification };
  }, [orders, needsVerificationOrders]);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        order.studentName.toLowerCase().includes(q) ||
        order.orderId.toLowerCase().includes(q) ||
        order.prodi.toLowerCase().includes(q) ||
        (order.whatsapp || '').includes(searchTerm);

      const matchesStatus =
        statusFilter === 'all' || order.status === statusFilter;

      let matchesTrans = true;
      if (transFilter === 'all') {
        matchesTrans = true;
      } else if (transFilter === 'needs_verification') {
        matchesTrans = order.transactionStatus !== 'Bayar Nanti' && !order.adminConfirmed;
      } else if (transFilter === 'verified') {
        matchesTrans = order.adminConfirmed;
      } else if (transFilter === 'bayar_nanti_only') {
        matchesTrans = order.transactionStatus === 'Bayar Nanti';
      } else {
        matchesTrans = order.transactionStatus === transFilter;
      }

      let matchesUrgency = true;
      if (urgencyFilter === 'tomorrow') {
        matchesUrgency = isPickupTomorrow(order.pickupDate);
      } else if (urgencyFilter === 'today') {
        matchesUrgency = getPickupUrgency(order.pickupDate).type === 'today';
      } else if (urgencyFilter === 'urgent') {
        const u = getPickupUrgency(order.pickupDate);
        matchesUrgency = (u.type === 'tomorrow' || u.type === 'today' || u.type === 'overdue') && order.status !== 'Selesai';
      }

      return matchesSearch && matchesStatus && matchesTrans && matchesUrgency;
    });
  }, [orders, searchTerm, statusFilter, transFilter, urgencyFilter]);

  const handleExportJson = () => {
    const jsonStr = JSON.stringify(orders, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `riwayat-monitoring-jilid-zainnet-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSkripsi = async (order: OrderRecord, file: UploadedFileInfo) => {
    // 1. Try server/cloud URL if present
    if (file.url) {
      try {
        const check = await fetch(file.url, { method: 'HEAD' });
        if (check.ok) {
          const a = document.createElement('a');
          a.href = file.url;
          a.download = file.filename || file.name || `Skripsi_${order.studentName}.pdf`;
          a.target = '_blank';
          a.click();
          return;
        }
      } catch {
        // If server restarted after 30 min, fallback below
      }
    }

    // 2. Try IndexedDB permanent storage
    try {
      const allStored = await getAllStoredFiles();
      const match = allStored.find(
        (f) => f.name === file.name || (file.filename && f.name === file.filename)
      );
      if (match && match.blob) {
        const objectUrl = URL.createObjectURL(match.blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = match.name || file.name || `Skripsi_${order.studentName}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
        return;
      }
    } catch {
      // ignore
    }

    // 3. Try base64 dataUrl
    if (file.dataUrl) {
      const a = document.createElement('a');
      a.href = file.dataUrl;
      a.download = file.name || `Skripsi_${order.studentName}.pdf`;
      a.click();
      return;
    }

    // 4. Fallback: generate official manifest sheet
    const content = `BERKAS SKRIPSI RESMI - ZAIN.NET\n=================================\nNo. Nota: ${order.orderId}\nNama Mahasiswa: ${order.studentName}\nFakultas: ${order.fakultas}\nProdi: ${order.prodi}\nNama File: ${file.name}\nUkuran: ${(file.size / (1024 * 1024)).toFixed(2)} MB\nTanggal Unggah: ${file.uploadedAt}\nStatus Berkas: Tersimpan permanen di cloud database ZAIN.NET.\n\n*Hanya Admin ZAIN.NET yang memiliki wewenang untuk mencetak dan menjilid berkas ini.*`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.name || 'Naskah_Skripsi'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="history-page max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      
      {/* URGENT TOP BANNER FOR ADMIN (FOLLOW-UP PENGAMBILAN BESOK) */}
      {isAdmin && urgentOrdersTotal.length > 0 && (
        <div className="mb-6 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-rose-600 via-rose-700 to-amber-600 text-white shadow-lg border border-rose-400 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center font-black shrink-0 animate-bounce">
              <Bell className="w-6 h-6 text-amber-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-black uppercase tracking-wider">
                  Follow-Up Pengambilan Besok
                </span>
                <span className="text-xs text-amber-200 font-bold">
                  ({tomorrowOrders.length} Order Besok • {todayOrders.length} Order Hari Ini)
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-white mt-0.5">
                ⚠️ Ada {urgentOrdersTotal.length} pesanan sampul jilid yang akan diambil BESOK / Hari Ini!
              </h3>
              <p className="text-xs text-rose-100">
                Admin wajib memastikan sampul dicetak & dijilid sekarang agar tidak terlambat saat mahasiswa mengambil.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              onClick={() => {
                setUrgencyFilter(urgencyFilter === 'tomorrow' ? 'all' : 'tomorrow');
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow ${
                urgencyFilter === 'tomorrow'
                  ? 'bg-white text-rose-900 ring-2 ring-white'
                  : 'bg-white/20 hover:bg-white/30 text-white'
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>{urgencyFilter === 'tomorrow' ? '✓ Sedang Tampil Order Besok' : 'Filter Order Besok Saja'}</span>
            </button>

            <button
              onClick={() => playJilidUrgentAlarm()}
              className="px-3 py-2 rounded-xl bg-black/20 hover:bg-black/30 text-white text-xs font-bold transition flex items-center gap-1"
              title="Tes Bunyi Alarm Peringatan"
            >
              <Volume2 className="w-4 h-4 text-amber-300" />
              <span>Tes Suara</span>
            </button>
          </div>
        </div>
      )}

      {/* NON-ADMIN BANNER (PORTAL MAHASISWA) */}
      {!isAdmin && (
        <div className="mb-6 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-800 via-emerald-900 to-slate-900 text-white shadow-md border border-emerald-600/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400 text-emerald-950 flex items-center justify-center font-bold shrink-0">
              <Download className="w-5 h-5 text-emerald-950" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-white">
                Halaman Mahasiswa: Cek & Unduh Struk Nota Resmi
              </h3>
              <p className="text-xs text-emerald-200/90 mt-0.5">
                Mahasiswa <strong>wajib mengunduh struk nota</strong> sebagai bukti fisik resmi saat mengambil naskah skripsi di loket ZAIN.NET.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onOpenAdminLogin}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 text-amber-300" />
              <span>Masuk Portal Admin</span>
            </button>
          </div>
        </div>
      )}

      {/* STATS OVERVIEW CARDS (ONLY ADMIN) */}
      {isAdmin && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Nota Masuk</div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1">{stats.totalOrders} <span className="text-xs font-normal text-slate-500">transaksi</span></div>
            <div className="text-[10px] text-emerald-700 font-medium mt-1">Total {stats.totalCovers} buku</div>
          </div>

          <div className={`p-3.5 rounded-2xl border shadow-xs ${tomorrowOrders.length > 0 ? 'bg-rose-50 border-rose-300' : 'bg-white border-slate-200'}`}>
            <div className="text-[10px] font-bold text-rose-800 uppercase tracking-wider flex items-center gap-1">
              <Bell className="w-3.5 h-3.5 text-rose-600" />
              Ambil BESOK (H-1)
            </div>
            <div className="text-xl sm:text-2xl font-black text-rose-950 mt-1">
              {tomorrowOrders.length} <span className="text-xs font-semibold text-rose-800">order</span>
            </div>
            <div className="text-[10px] text-rose-700 mt-1">
              {tomorrowOrders.length > 0 ? '⚠️ Prioritas jilid' : 'Aman terkendali'}
            </div>
          </div>

          <div
            onClick={() => {
              setUrgencyFilter('all');
              setStatusFilter('all');
              setTransFilter('needs_verification');
            }}
            className={`p-3.5 rounded-2xl border shadow-xs cursor-pointer transition ${
              needsVerificationOrders.length > 0
                ? 'bg-amber-50 border-amber-300 hover:bg-amber-100 ring-1 ring-amber-400/40'
                : 'bg-white border-slate-200'
            }`}
            title="Klik untuk memfilter nota yang membutuhkan verifikasi pembayaran"
          >
            <div className="text-[10px] font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
              Butuh Verifikasi
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-950 mt-1">
              {stats.pendingVerification} <span className="text-xs font-semibold text-amber-800">nota</span>
            </div>
            <div className="text-[10px] text-amber-800 font-medium mt-1">
              {stats.pendingVerification > 0 ? '⏳ Klik untuk cek pembayaran' : 'Semua telah diverifikasi'}
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              Sedang Dikerjakan
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1">{stats.inProgress} <span className="text-xs font-normal text-slate-500">naskah</span></div>
            <div className="text-[10px] text-slate-500 mt-1">Menunggu & Proses</div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
              Total Omset Loket
            </div>
            <div className="text-lg sm:text-xl font-black text-slate-900 mt-1 font-mono">{formatIDR(stats.totalRevenue)}</div>
            <div className="text-[10px] text-emerald-700 mt-1 font-medium">{stats.readyPickup} siap diambil</div>
          </div>
        </div>
      )}

      {/* Main Container Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-1">
              {isAdmin ? (
                <span className="text-rose-700 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-rose-600" />
                  PANEL MONITORING KHUSUS ADMIN ZAIN.NET
                </span>
              ) : (
                <span className="text-emerald-700 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  PORTAL MAHASISWA / PEMESAN
                </span>
              )}
            </div>
            <h2 className="text-2xl font-black text-slate-900">
              {isAdmin ? 'Monitoring Nota, Berkas Skripsi & Jadwal Jilid' : 'Daftar Nota & Bukti Struk Pengambilan'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {isAdmin
                ? 'Admin dapat memantau jadwal pengambilan besok, mengunduh file naskah skripsi mahasiswa, dan menghapus nota.'
                : 'Cari nota Anda berdasarkan nomor nota atau nama, lalu unduh struk resmi sebagai bukti sah saat mengambil jilid di loket.'}
            </p>
            <div className="mt-2.5 flex items-center gap-2 text-[11px] text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200/90 inline-flex">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
              <span>
                <strong>Penyimpanan Permanen Aktif:</strong> Data nota, naskah skripsi & bukti struk PNG tersimpan permanen di server hosting (tidak akan hilang).
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {isAdmin && onRefreshOrders && (
              <button
                onClick={() => onRefreshOrders()}
                disabled={isRefreshing}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 transition cursor-pointer disabled:opacity-50 shadow-xs"
                title="Sinkronisasi data nota terbaru dari server hosting"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-700 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? 'Menyinkron...' : '🔄 Segarkan Data'}</span>
              </button>
            )}

            {isAdmin && orders.length > 0 && (
              <button
                onClick={handleExportJson}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Ekspor JSON</span>
              </button>
            )}

            <button
              onClick={onCreateNew}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black text-emerald-950 bg-amber-400 hover:bg-amber-500 shadow-md transition"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Buat Pesanan Baru</span>
            </button>
          </div>
        </div>

        {/* Quick Filter Tabs for Admin */}
        {isAdmin && (
          <div className="flex items-center gap-2 mt-5 pt-4 border-t border-slate-100 overflow-x-auto pb-1">
            <button
              onClick={() => {
                setUrgencyFilter('all');
                setStatusFilter('all');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                urgencyFilter === 'all' && statusFilter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Semua ({orders.length})
            </button>

            <button
              onClick={() => {
                setUrgencyFilter('all');
                setStatusFilter('all');
                setTransFilter('needs_verification');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
                transFilter === 'needs_verification'
                  ? 'bg-amber-500 text-amber-950 font-black shadow-sm ring-2 ring-amber-400'
                  : 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
              <span>⏳ Butuh Verifikasi Admin ({needsVerificationOrders.length})</span>
            </button>

            <button
              onClick={() => {
                setUrgencyFilter('all');
                setStatusFilter('all');
                setTransFilter('bayar_nanti_only');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
                transFilter === 'bayar_nanti_only'
                  ? 'bg-red-600 text-white font-black shadow-sm ring-2 ring-red-400'
                  : 'bg-red-50 text-red-900 border border-red-300 hover:bg-red-100'
              }`}
            >
              <span>🔴 Nota Merah: Belum Bayar ({bayarNantiOrders.length})</span>
            </button>

            <button
              onClick={() => {
                setUrgencyFilter('tomorrow');
                setStatusFilter('all');
                setTransFilter('all');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
                urgencyFilter === 'tomorrow'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-rose-50 text-rose-900 border border-rose-200 hover:bg-rose-100'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>🚨 Ambil BESOK ({tomorrowOrders.length})</span>
            </button>

            <button
              onClick={() => {
                setUrgencyFilter('today');
                setStatusFilter('all');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
                urgencyFilter === 'today'
                  ? 'bg-amber-500 text-amber-950 font-black'
                  : 'bg-amber-50 text-amber-950 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>⚡ Ambil Hari Ini ({todayOrders.length})</span>
            </button>

            <button
              onClick={() => {
                setUrgencyFilter('all');
                setStatusFilter('Proses Jilid');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                statusFilter === 'Proses Jilid'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Sedang Dijilid
            </button>

            <button
              onClick={() => {
                setUrgencyFilter('all');
                setStatusFilter('Siap Diambil');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                statusFilter === 'Siap Diambil'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Siap Diambil
            </button>

            <button
              onClick={() => {
                setUrgencyFilter('all');
                setStatusFilter('Selesai');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                statusFilter === 'Selesai'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Selesai
            </button>
          </div>
        )}

        {/* Search & Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mt-4 pt-4 border-t border-slate-100">
          <div className="sm:col-span-6 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama mahasiswa, no. nota, atau prodi..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            />
          </div>

          <div className="sm:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-medium text-slate-700"
            >
              <option value="all">Semua Status Pengerjaan</option>
              <option value="Menunggu">Menunggu</option>
              <option value="Proses Jilid">Proses Jilid</option>
              <option value="Siap Diambil">Siap Diambil</option>
              <option value="Selesai">Selesai</option>
            </select>
          </div>

          <div className="sm:col-span-3">
            <select
              value={transFilter}
              onChange={(e) => setTransFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-medium text-slate-700"
            >
              <option value="all">Semua Status Transaksi</option>
              <option value="needs_verification">⏳ Butuh Verifikasi Admin</option>
              <option value="verified">✅ Sudah Diverifikasi Sah</option>
              <option value="bayar_nanti_only">🏷️ Bayar Nanti di Loket</option>
              <option value="Bayar Sekarang">Bayar Sekarang</option>
              <option value="DP">DP (Uang Muka)</option>
              <option value="LUNAS">LUNAS</option>
              <option value="Bayar Nanti">Bayar Nanti (di Loket)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Orders Table or Empty State */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-800">
            {searchTerm || statusFilter !== 'all' || transFilter !== 'all' || urgencyFilter !== 'all'
              ? 'Tidak ada pesanan yang sesuai dengan filter'
              : 'Belum ada nota pesanan yang tersimpan'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5">
            Silakan buat pesanan baru untuk mencetak nota otomatis dan menguji fitur pemantauan.
          </p>
          <button
            onClick={onCreateNew}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 transition shadow"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Mulai Buat Pesanan Jilid</span>
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">No. Nota</th>
                  <th className="py-3.5 px-4">Mahasiswa & Jurusan</th>
                  <th className="py-3.5 px-4">Paket & Sampul</th>
                  <th className="py-3.5 px-4">Jadwal Pengambilan</th>
                  {isAdmin && (
                    <th className="py-3.5 px-4">Berkas Skripsi (Khusus Admin)</th>
                  )}
                  <th className="py-3.5 px-4">Total Biaya</th>
                  <th className="py-3.5 px-4">Transaksi & Loket</th>
                  <th className="py-3.5 px-4">Status Pengerjaan</th>
                  <th className="py-3.5 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map((order) => {
                  const urgency = getPickupUrgency(order.pickupDate);
                  const isTomorrow = isPickupTomorrow(order.pickupDate);

                  return (
                    <tr
                      key={order.orderId}
                      className={`hover:bg-slate-50/70 transition ${
                        isTomorrow && order.status !== 'Selesai' ? 'bg-rose-50/40' : ''
                      }`}
                    >
                      {/* No. Nota */}
                      <td className="py-4 px-4 font-mono font-bold text-slate-900">
                        <div className="text-emerald-700 flex items-center gap-1">
                          {order.orderId}
                        </div>
                        <div className="text-[10px] text-slate-400 font-normal">
                          {order.orderDate} WIB
                        </div>
                        {order.isCompletePackage && (
                          <span className="inline-block mt-1 px-1.5 py-0.2 rounded bg-amber-100 text-amber-950 font-sans font-bold text-[9px] border border-amber-300">
                            📦 Paket Lengkap
                          </span>
                        )}
                      </td>

                      {/* Mahasiswa & Fakultas */}
                      <td className="py-4 px-4">
                        <div className="font-bold text-slate-900 text-sm">
                          {order.studentName}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {order.prodi}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.2 rounded">
                            {order.university || 'UIN Madura'}
                          </span>
                          <a
                            href={getStudentWhatsAppChatUrl(order)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-emerald-700 hover:text-emerald-900 font-bold bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200 transition cursor-pointer"
                            title={`Klik untuk membuka chat WhatsApp langsung ke ${order.studentName}`}
                          >
                            <MessageCircle className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span>+62 {order.whatsapp.replace(/\D/g, '').replace(/^0/, '')}</span>
                          </a>
                        </div>
                      </td>

                      {/* Paket & Sampul */}
                      <td className="py-4 px-4">
                        <div className="font-semibold text-slate-800">
                          {order.coverCount} Eksemplar {order.coverType === 'soft_cover' ? '(Soft Cover)' : `(${order.coverColor})`}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {order.coverType === 'soft_cover' ? 'Jilid Soft Cover' : order.durationLabel}
                        </div>
                        {order.selectedServices.length > 0 && (
                          <div className="text-[10px] text-amber-800 font-semibold mt-0.5">
                            +{order.selectedServices.length} Layanan (Artikel, CD, dll)
                          </div>
                        )}
                      </td>

                      {/* Jadwal Pengambilan (Highlighted) */}
                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          <div className={`px-2.5 py-1 rounded-lg border text-xs font-bold inline-block ${urgency.badgeClass}`}>
                            {formatDisplayDate(order.pickupDate)}
                          </div>
                          <div className="text-[10px] font-bold text-slate-600 block">
                            {urgency.label}
                          </div>
                        </div>
                      </td>

                      {/* FILE SKRIPSI MAHASISWA (KHUSUS ADMIN) */}
                      {isAdmin && (
                        <td className="py-4 px-4">
                          {order.uploadedFiles && order.uploadedFiles.length > 0 ? (
                            <div className="space-y-1.5">
                              {order.uploadedFiles.map((f, i) => (
                                <div
                                  key={i}
                                  className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2 max-w-[200px]"
                                >
                                  <div className="min-w-0 truncate">
                                    <div className="text-[11px] font-bold text-slate-900 truncate" title={f.name}>
                                      📄 {f.name}
                                    </div>
                                    <div className="text-[9px] text-slate-500">
                                      {(f.size / (1024 * 1024)).toFixed(2)} MB
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadSkripsi(order, f)}
                                    className="p-1 rounded bg-emerald-700 hover:bg-emerald-800 text-white shrink-0 transition"
                                    title="Unduh File Skripsi Mahasiswa ini"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-500 flex items-center gap-1">
                              <MessageCircle className="w-3.5 h-3.5 text-amber-600" />
                              <span>Berkas via WhatsApp</span>
                            </div>
                          )}
                        </td>
                      )}

                      {/* Total Biaya */}
                      <td className="py-4 px-4 font-mono font-bold text-slate-900 text-sm">
                        {formatIDR((order.totalCost || 0) + (order.printCost || 0))}
                        {order.transactionStatus === 'DP' && (
                          <div className="text-[10px] font-semibold text-amber-800">
                            DP: {formatIDR(order.dpAmount)}
                          </div>
                        )}
                        {order.transactionStatus === 'Bayar Nanti' && (
                          <div className="text-[10px] font-semibold text-indigo-700">
                            Bayar di Loket
                          </div>
                        )}
                      </td>

                      {/* Transaksi & Konfirmasi Admin */}
                      <td className="py-4 px-4">
                        {order.transactionStatus === 'Bayar Nanti' ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-red-100 text-red-900 border-2 border-red-400 shadow-xs">
                              <span className="w-2 h-2 rounded-full bg-red-600 animate-ping inline-block" />
                              🔴 NOTA MERAH (Belum Bayar)
                            </span>
                            <div className="text-[10px] text-red-800 font-bold">
                              Bayar tunai di loket saat ambil ({formatIDR(order.totalCost + (order.printCost || 0))})
                            </div>
                          </div>
                        ) : order.adminConfirmed ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                                {order.transactionStatus}
                              </span>
                              {order.paymentChannel && (
                                <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                  {order.paymentChannel}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300 inline-flex items-center gap-1">
                                <BadgeCheck className="w-3.5 h-3.5 text-emerald-600 inline" />
                                Sah Diverifikasi Admin
                              </span>
                              {isAdmin && (
                                <button
                                  onClick={() => onToggleAdminConfirm && onToggleAdminConfirm(order.orderId)}
                                  className="text-[9px] text-slate-400 hover:text-rose-600 underline cursor-pointer"
                                  title="Klik untuk membatalkan verifikasi"
                                >
                                  Batal
                                </button>
                              )}
                            </div>
                            {order.adminConfirmedAt && (
                              <div className="text-[9px] text-slate-400">
                                Oleh {order.adminConfirmedBy || 'Admin Loket'}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                {order.transactionStatus}
                              </span>
                              {order.paymentChannel && (
                                <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                  {order.paymentChannel}
                                </span>
                              )}
                            </div>
                            <div>
                              {isAdmin ? (
                                <button
                                  onClick={() => onToggleAdminConfirm && onToggleAdminConfirm(order.orderId)}
                                  className="text-[10px] font-black text-amber-950 bg-amber-400 hover:bg-amber-500 px-2.5 py-1 rounded-lg border border-amber-500 inline-flex items-center gap-1 cursor-pointer shadow-xs transition animate-pulse"
                                  title="Wajib Verifikasi: Klik untuk mensahkan bukti transfer / pembayaran"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5 text-amber-900" />
                                  <span>Verifikasi Pembayaran</span>
                                </button>
                              ) : (
                                <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-300 inline-flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-amber-600" />
                                  Menunggu Verifikasi Loket
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Status Pengerjaan (Admin can change) */}
                      <td className="py-4 px-4">
                        {isAdmin ? (
                          <select
                            value={order.status}
                            onChange={(e) => {
                              const nextStatus = e.target.value as OrderRecord['status'];
                              onUpdateStatus?.(
                                order.orderId,
                                nextStatus,
                                order.transactionStatus,
                                order.adminConfirmed,
                                order.adminConfirmedBy
                              );
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                              order.status === 'Siap Diambil'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : order.status === 'Proses Jilid'
                                ? 'bg-amber-50 text-amber-900 border-amber-300'
                                : order.status === 'Selesai'
                                ? 'bg-blue-50 text-blue-800 border-blue-300'
                                : 'bg-slate-50 text-slate-700 border-slate-300'
                            }`}
                          >
                            <option value="Menunggu">Menunggu</option>
                            <option value="Proses Jilid">Proses Jilid</option>
                            <option value="Siap Diambil">Siap Diambil</option>
                            <option value="Selesai">Selesai</option>
                          </select>
                        ) : (
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold ${
                              order.status === 'Siap Diambil'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : order.status === 'Proses Jilid'
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : order.status === 'Selesai'
                                ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                : 'bg-slate-100 text-slate-700 border border-slate-300'
                            }`}
                          >
                            {order.status}
                          </span>
                        )}
                      </td>

                      {/* Aksi */}
                      <td className="py-4 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {/* Tombol Cepat Chat WhatsApp Mahasiswa */}
                          <a
                            href={getStudentWhatsAppChatUrl(order)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition font-black flex items-center gap-1 text-[11px] shadow-xs cursor-pointer"
                            title={`Chat WhatsApp ke mahasiswa ${order.studentName} dengan template pesan ramah konfirmasi berkas`}
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-white" />
                            <span>Chat WA</span>
                          </a>

                          <button
                            onClick={() => onSelectOrder(order)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 transition font-bold flex items-center gap-1 text-[11px] cursor-pointer"
                            title="Buka / Cetak Struk Bukti Pengambilan"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Struk</span>
                          </button>

                          {/* Kirim / Cek WA ZAIN.NET dengan link nota PNG */}
                          <a
                            href={getAdminWhatsAppUrl(order, order.receiptImageFullUrl || order.receiptImageUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition font-bold flex items-center gap-1 text-[11px] cursor-pointer"
                            title="Kirim / Cek via WhatsApp ZAIN.NET (Disertai link gambar nota PNG)"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-slate-600" />
                            <span className="hidden sm:inline">WA Toko</span>
                          </a>

                          {/* Link Gambar Nota PNG jika sudah tersimpan */}
                          {(order.receiptImageFullUrl || order.receiptImageUrl) && (
                            <a
                              href={order.receiptImageFullUrl || order.receiptImageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition font-bold flex items-center gap-1 text-[11px] cursor-pointer"
                              title="Buka Gambar Nota PNG Resmi"
                            >
                              <Eye className="w-3.5 h-3.5 text-indigo-600" />
                              <span className="hidden sm:inline">PNG</span>
                            </a>
                          )}

                          {/* PENGHAPUSAN NOTA HANYA BISA OLEH ADMIN */}
                          {isAdmin && (
                            <button
                              onClick={() => setDeleteCandidate(order)}
                              className="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition cursor-pointer"
                              title="Hapus Nota (Khusus Admin)"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal for Admin */}
      {deleteCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white max-w-md w-full rounded-2xl p-6 shadow-2xl border border-rose-200 space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-black text-slate-900">
                Konfirmasi Hapus Nota Pesanan
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                Apakah Admin yakin ingin menghapus nota <strong className="text-rose-700 font-mono">{deleteCandidate.orderId}</strong> atas nama <strong className="text-slate-900">{deleteCandidate.studentName}</strong>?
              </p>
              <p className="text-[11px] text-rose-600 font-semibold mt-2">
                Tindakan ini permanen dan berkas naskah akan diarsipkan.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteOrder(deleteCandidate.orderId);
                  setDeleteCandidate(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow"
              >
                Hapus Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
