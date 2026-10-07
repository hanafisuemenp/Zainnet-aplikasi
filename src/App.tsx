/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { OrderForm } from './components/OrderForm';
import { InvoiceModal } from './components/InvoiceModal';
import { DatabaseSchemaModal } from './components/DatabaseSchemaModal';
import { OrderHistory } from './components/OrderHistory';
import { OrderRecord, TransactionStatus } from './types';
import { formatDateToCustom, computePickupDate, getStudentSlug } from './utils/pricing';

const STORAGE_KEY = 'uin_madura_skripsi_orders_v2';

const extractSlugFromUrl = (): string | null => {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname.toLowerCase();

  // 1. Path format: /notaahmadsugianto or /nota/ahmadsugianto or /pantau/ahmadsugianto
  const matchDirect = path.match(/^\/nota([a-z0-9_-]+)$/i);
  if (matchDirect && matchDirect[1]) {
    return matchDirect[1].replace(/^[-_]/, '');
  }

  const matchSlash = path.match(/^\/(?:nota|pantau)\/([a-z0-9_-]+)$/i);
  if (matchSlash && matchSlash[1]) {
    return matchSlash[1];
  }

  // 2. Query param format: ?nota=ahmadsugianto or ?id=NOT-20261003-882
  const params = new URLSearchParams(window.location.search);
  const notaParam = params.get('nota') || params.get('id') || params.get('order');
  if (notaParam) {
    return notaParam.toLowerCase().trim();
  }

  return null;
};

const createSampleOrder = (): OrderRecord => {
  const now = new Date();
  const orderDate = formatDateToCustom(now);
  const pickupDate = computePickupDate(now, 1);

  return {
    orderId: 'NOT-20261003-882',
    studentName: 'Achmad Zaini Fawaid',
    fakultas: 'Fakultas Tarbiyah (FATAR)',
    prodi: 'Pendidikan Agama Islam (PAI)',
    coverColor: 'Hijau',
    whatsapp: '81234567890',
    coverType: 'hard_cover',
    coverCount: 3,
    durationKey: '1_day',
    durationLabel: '1 Hari Jadi',
    durationDays: 1,
    pricePerCover: 50000,
    coversSubtotal: 150000,
    selectedServices: ['cd', 'skek', 'pisah_perpus'],
    servicesBreakdown: [
      {
        id: 'cd',
        label: 'CD',
        price: 10000,
      },
      {
        id: 'skek',
        label: 'Buku SKEK',
        price: 5000,
      },
      {
        id: 'pisah_perpus',
        label: 'Pisah-pisah file untuk Perpus',
        price: 10000,
      },
    ],
    servicesSubtotal: 25000,
    totalCost: 175000,
    orderDate: orderDate,
    pickupDate: pickupDate,
    uploadedFiles: [
      {
        name: 'Skripsi_Lengkap_Achmad_Zaini.pdf',
        size: 3840210,
        type: 'application/pdf',
        uploadedAt: orderDate,
        serviceCategory: 'Perpustakaan & Repositori',
      },
    ],
    status: 'Siap Diambil',
    transactionStatus: 'DP',
    dpAmount: 88000,
    remainingAmount: 87000,
    adminConfirmed: true,
    adminConfirmedAt: orderDate,
    adminConfirmedBy: 'Admin ZAIN.NET',
    createdAt: Date.now() - 3600000 * 18,
  };
};

export default function App() {
  const [currentTab, setCurrentTab] = useState<'order' | 'history' | 'schema'>('order');
  const [orders, setOrders] = useState<OrderRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    return [createSampleOrder()];
  });

  const [activeInvoiceOrder, setActiveInvoiceOrder] = useState<OrderRecord | null>(null);

  // 1. Load & real-time auto-sync with permanent server database
  useEffect(() => {
    const syncWithServer = async () => {
      try {
        const res = await fetch('/api/orders');
        if (!res.ok) return;
        const data = await res.json();
        if (data && Array.isArray(data.orders)) {
          const serverList: OrderRecord[] = data.orders;
          if (serverList.length > 0) {
            setOrders((prev) => {
              const map = new Map<string, OrderRecord>();
              serverList.forEach((o) => map.set(o.orderId, o));
              prev.forEach((o) => {
                if (!map.has(o.orderId)) {
                  map.set(o.orderId, o);
                  fetch('/api/orders', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ order: o }),
                  }).catch(() => {});
                }
              });
              const merged = Array.from(map.values()).sort(
                (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
              );
              try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
              } catch {}
              return merged;
            });
          }
        }
      } catch (err) {
        console.warn('Gagal sinkronisasi data dari server:', err);
      }
    };

    syncWithServer();
    const interval = setInterval(syncWithServer, 15000);
    return () => clearInterval(interval);
  }, []);

  // 2. Custom Domain URL routing: www.karyazainnet.net/nota[namamahasiswa]
  useEffect(() => {
    const slug = extractSlugFromUrl();
    if (!slug) return;

    // Check local orders state
    const match = orders.find((o) => {
      const studentSlug = getStudentSlug(o.studentName);
      const cleanOrderId = o.orderId.toLowerCase().replace(/[^a-z0-9]/g, '');
      const searchClean = slug.toLowerCase().replace(/[^a-z0-9]/g, '');
      return (
        studentSlug === searchClean ||
        cleanOrderId === searchClean ||
        o.orderId.toLowerCase() === slug.toLowerCase() ||
        (searchClean.length > 3 && studentSlug.includes(searchClean))
      );
    });

    if (match) {
      setActiveInvoiceOrder(match);
    } else {
      // If not in local state, fetch by-slug from server API
      fetch(`/api/orders/by-slug/${slug}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && data.order) {
            setActiveInvoiceOrder(data.order);
            setOrders((prev) => {
              if (prev.some((o) => o.orderId === data.order.orderId)) return prev;
              return [data.order, ...prev];
            });
          }
        })
        .catch(() => {});
    }
  }, [orders]);

  // Sync orders to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    } catch (e) {
      console.error('Failed to save orders to localStorage', e);
    }
  }, [orders]);

  const handleOrderCreated = async (newOrder: OrderRecord) => {
    setOrders((prev) => [newOrder, ...prev]);
    setActiveInvoiceOrder(newOrder);

    // Simpan permanen ke server hosting disk
    try {
      await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newOrder }),
      });
    } catch (e) {
      console.warn('Gagal simpan nota ke server disk:', e);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    setOrders((prev) => prev.filter((o) => o.orderId !== orderId));
    if (activeInvoiceOrder?.orderId === orderId) {
      setActiveInvoiceOrder(null);
    }

    try {
      await fetch(`/api/orders/${orderId}`, {
        method: 'DELETE',
      });
    } catch (e) {
      console.warn('Gagal menghapus nota dari server:', e);
    }
  };

  const handleUpdateOrderStatus = async (
    orderId: string,
    status: OrderRecord['status'],
    transactionStatus: TransactionStatus,
    adminConfirmed: boolean,
    adminConfirmedBy?: string
  ) => {
    const updatedFields = {
      status,
      transactionStatus,
      adminConfirmed,
      adminConfirmedBy: adminConfirmed ? (adminConfirmedBy || 'Admin Loket') : undefined,
      adminConfirmedAt: adminConfirmed ? formatDateToCustom(new Date()) : undefined,
    };

    setOrders((prev) =>
      prev.map((o) => (o.orderId === orderId ? { ...o, ...updatedFields } : o))
    );

    if (activeInvoiceOrder?.orderId === orderId) {
      setActiveInvoiceOrder((prev) => (prev ? { ...prev, ...updatedFields } : null));
    }

    try {
      await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFields),
      });
    } catch (e) {
      console.warn('Gagal memperbarui status nota di server:', e);
    }
  };

  const handleToggleAdminConfirm = async (orderId: string) => {
    const targetOrder = orders.find((o) => o.orderId === orderId);
    if (!targetOrder) return;
    const nextConfirm = !targetOrder.adminConfirmed;
    const updatedFields = {
      adminConfirmed: nextConfirm,
      adminConfirmedBy: nextConfirm ? 'Admin Loket Percetakan' : undefined,
      adminConfirmedAt: nextConfirm ? formatDateToCustom(new Date()) : undefined,
    };

    setOrders((prev) =>
      prev.map((o) => (o.orderId === orderId ? { ...o, ...updatedFields } : o))
    );

    if (activeInvoiceOrder?.orderId === orderId) {
      setActiveInvoiceOrder((prev) => (prev ? { ...prev, ...updatedFields } : null));
    }

    try {
      await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFields),
      });
    } catch (e) {
      console.warn('Gagal mengubah konfirmasi nota di server:', e);
    }
  };

  const handleRefreshOrders = async () => {
    try {
      const res = await fetch('/api/orders');
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.orders)) {
          setOrders(data.orders);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data.orders));
        }
      }
    } catch (e) {
      console.warn('Gagal memuat data dari server:', e);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Header */}
      <Header
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        orderCount={orders.length}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {currentTab === 'order' && (
          <OrderForm onOrderCreated={handleOrderCreated} />
        )}

        {currentTab === 'history' && (
          <OrderHistory
            orders={orders}
            onSelectOrder={(ord) => setActiveInvoiceOrder(ord)}
            onDeleteOrder={handleDeleteOrder}
            onCreateNew={() => setCurrentTab('order')}
            onToggleAdminConfirm={handleToggleAdminConfirm}
            onRefreshOrders={handleRefreshOrders}
          />
        )}

        {currentTab === 'schema' && (
          <DatabaseSchemaModal
            currentOrder={activeInvoiceOrder || orders[0] || null}
            onClose={() => setCurrentTab('order')}
          />
        )}
      </main>

      {/* Modal Nota / Invoice */}
      {activeInvoiceOrder && (
        <InvoiceModal
          order={activeInvoiceOrder}
          onClose={() => setActiveInvoiceOrder(null)}
          onViewSchema={() => {
            setActiveInvoiceOrder(null);
            setCurrentTab('schema');
          }}
          onUpdateStatus={handleUpdateOrderStatus}
        />
      )}

      {/* Footer */}
      <footer className="no-print bg-white border-t border-slate-200 py-6 mt-12 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">
              Sistem Nota & Jilid Hard Cover Skripsi UIN Madura
            </span>
            <span>•</span>
            <span>Verifikasi Transaksi DP & LUNAS oleh Admin</span>
          </div>
          <div>
            Format Resmi Fakultas &bull; FATAR (Hijau) &bull; FEBI (Kuning) &bull; USULUDDIN (Biru) &bull; FASYA (Merah/Marron)
          </div>
        </div>
      </footer>
    </div>
  );
}
