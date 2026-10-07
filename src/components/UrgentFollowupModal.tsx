import React from 'react';
import {
  Bell,
  AlertTriangle,
  Clock,
  BookOpen,
  CheckCircle2,
  X,
  Volume2,
  VolumeX,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { OrderRecord } from '../types';
import { formatDisplayDate, getPickupUrgency } from '../utils/pricing';
import { playJilidUrgentAlarm } from '../utils/audioAlert';

interface UrgentFollowupModalProps {
  isOpen: boolean;
  onClose: () => void;
  urgentOrders: OrderRecord[];
  onSelectOrder: (order: OrderRecord) => void;
  onFilterUrgentOrders: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export const UrgentFollowupModal: React.FC<UrgentFollowupModalProps> = ({
  isOpen,
  onClose,
  urgentOrders,
  onSelectOrder,
  onFilterUrgentOrders,
  soundEnabled,
  onToggleSound,
}) => {
  if (!isOpen || urgentOrders.length === 0) return null;

  const tomorrowCount = urgentOrders.filter((o) => getPickupUrgency(o.pickupDate).type === 'tomorrow').length;
  const todayCount = urgentOrders.filter((o) => getPickupUrgency(o.pickupDate).type === 'today').length;
  const overdueCount = urgentOrders.filter((o) => getPickupUrgency(o.pickupDate).type === 'overdue').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border-2 border-rose-400 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header Alert */}
        <div className="bg-gradient-to-r from-rose-600 via-rose-700 to-amber-600 p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md text-white flex items-center justify-center font-black shadow-inner animate-bounce">
              <Bell className="w-7 h-7 text-amber-200" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-black tracking-wider uppercase mb-0.5">
                <AlertTriangle className="w-3 h-3 text-amber-300" />
                Pemberitahuan Follow-Up Loket Jilid
              </div>
              <h3 className="font-black text-lg sm:text-xl text-white">
                ⚠️ Pengingat Jilid: Pengambilan Besok!
              </h3>
              <p className="text-xs text-rose-100">
                Ada <strong className="text-amber-200">{urgentOrders.length} pesanan sampul jilid skripsi</strong> yang harus diselesaikan!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onToggleSound();
                if (!soundEnabled) playJilidUrgentAlarm();
              }}
              className={`p-2 rounded-xl transition cursor-pointer flex items-center gap-1 text-xs font-bold ${
                soundEnabled ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-black/30 text-rose-200'
              }`}
              title={soundEnabled ? 'Matikan Suara Alarm' : 'Aktifkan Suara Alarm'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-amber-300" /> : <VolumeX className="w-4 h-4 text-rose-300" />}
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
              aria-label="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Warning Banner Info */}
        <div className="bg-rose-50 border-b border-rose-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="text-xs text-rose-950 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-ping shrink-0" />
            <span>
              <strong>Perhatian Admin:</strong> Jangan sampai lupa mencetak sampul & jilid naskah mahasiswa berikut agar tidak terlambat saat mahasiswa datang mengambil.
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px] font-bold">
            {tomorrowCount > 0 && (
              <span className="px-2 py-0.5 rounded-lg bg-rose-200 text-rose-900 border border-rose-300">
                Besok: {tomorrowCount} Order
              </span>
            )}
            {todayCount > 0 && (
              <span className="px-2 py-0.5 rounded-lg bg-amber-200 text-amber-950 border border-amber-400">
                Hari Ini: {todayCount}
              </span>
            )}
            {overdueCount > 0 && (
              <span className="px-2 py-0.5 rounded-lg bg-red-200 text-red-950 border border-red-400">
                Lewat: {overdueCount}
              </span>
            )}
          </div>
        </div>

        {/* List of Urgent Orders */}
        <div className="p-6 overflow-y-auto space-y-3.5 flex-1">
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Daftar Pesanan Jilid yang Wajib Dikerjakan:
          </div>

          {urgentOrders.map((order) => {
            const urgency = getPickupUrgency(order.pickupDate);
            return (
              <div
                key={order.orderId}
                className="p-4 rounded-2xl border-2 border-rose-200 hover:border-rose-400 bg-white hover:bg-rose-50/30 transition shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-xs text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {order.orderId}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${urgency.badgeClass}`}>
                      {urgency.label}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      order.status === 'Proses Jilid'
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'bg-slate-100 text-slate-800 border border-slate-300'
                    }`}>
                      Status: {order.status}
                    </span>
                  </div>

                  <div className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                    <span>{order.studentName}</span>
                    <span className="text-xs font-normal text-slate-500">
                      ({order.prodi} • {order.fakultas})
                    </span>
                  </div>

                  <div className="text-xs text-slate-700 flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-rose-800 bg-rose-100/70 px-2 py-0.5 rounded">
                      📚 {order.coverCount} Eksemplar {order.coverType === 'soft_cover' ? 'Soft Cover' : `Hard Cover (${order.coverColor})`}
                    </span>
                    <span>•</span>
                    <span className="text-slate-600">
                      Jadwal Ambil: <strong className="text-slate-900">{formatDisplayDate(order.pickupDate)}</strong>
                    </span>
                  </div>
                </div>

                <div className="flex sm:flex-col items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      onSelectOrder(order);
                      onClose();
                    }}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow transition"
                  >
                    <span>Buka Nota</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Actions */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={playJilidUrgentAlarm}
            className="w-full sm:w-auto px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 flex items-center justify-center gap-1.5 transition"
          >
            <Bell className="w-3.5 h-3.5 text-rose-600" />
            <span>Tes Bunyi Suara Alarm</span>
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-200 transition"
            >
              Mengerti & Tutup
            </button>
            <button
              type="button"
              onClick={() => {
                onFilterUrgentOrders();
                onClose();
              }}
              className="flex-1 sm:flex-none px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow transition flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Lihat Antrean Besok di Tabel</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
