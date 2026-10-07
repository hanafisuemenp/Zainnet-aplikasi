/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Header } from './components/Header';
import { OrderForm } from './components/OrderForm';
import { InvoiceModal } from './components/InvoiceModal';
import { DatabaseSchemaModal } from './components/DatabaseSchemaModal';
import { OrderHistory } from './components/OrderHistory';
import { AdminPinModal } from './components/AdminPinModal';
import { UrgentFollowupModal } from './components/UrgentFollowupModal';
import { OrderRecord, TransactionStatus } from './types';
import {
  formatDateToCustom,
  computePickupDate,
  isPickupTomorrow,
  getPickupUrgency,
} from './utils/pricing';
import { playJilidUrgentAlarm, playSuccessChime } from './utils/audioAlert';
import './index.css';

const STORAGE_KEY = 'uin_madura_skripsi_orders_v3';
const ADMIN_STORAGE_KEY = 'uin_madura_nota_is_admin';
const SOUND_STORAGE_KEY = 'uin_madura_nota_sound_enabled';

const createSampleOrders = (): OrderRecord[] => {
  const now = new Date();
  const orderDate = formatDateToCustom(now);
  // Order 1: Tomorrow pick up (1 Day Kilat) -> URGENT ALERT
  const pickupTomorrow = computePickupDate(now, 1);
  // Order 2: Tomorrow pick up (2 Day Jadi) -> URGENT ALERT
  const pickupTomorrow2 = computePickupDate(new Date(now.getTime() - 86400000), 2);
  // Order 3: 3 Days pickup (Normal)
  const pickup3Days = computePickupDate(now, 3);

  return [
    {
      orderId: 'NOT-20261004-912',
      studentName: 'Achmad Zaini Fawaid',
      university: 'UIN Madura (Universitas Islam Negeri Madura)',
      isCustomUniversity: false,
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
      isCompletePackage: true,
      extraCoversAdded: 0,
      selectedServices: ['artikel', 'cd', 'skek', 'pisah_perpus'],
      servicesBreakdown: [
        { id: 'artikel', label: 'Artikel Jurnal', price: 20000 },
        { id: 'cd', label: 'CD Softcopy Skripsi', price: 10000 },
        { id: 'skek', label: 'Buku SKEK', price: 5000 },
        { id: 'pisah_perpus', label: 'Pisah-pisah file untuk Perpus', price: 10000 },
      ],
      servicesSubtotal: 45000,
      printCost: 0,
      totalCost: 195000,
      fileDeliveryMethod: 'upload_server',
      orderDate: orderDate,
      pickupDate: pickupTomorrow,
      uploadedFiles: [
        {
          name: 'Skripsi_PAI_Achmad_Zaini_Full.pdf',
          size: 4210500,
          type: 'application/pdf',
          uploadedAt: orderDate,
          serviceCategory: 'Naskah Skripsi Lengkap',
        },
      ],
      status: 'Proses Jilid',
      transactionStatus: 'DP',
      paymentChannel: 'Transfer',
      dpAmount: 100000,
      remainingAmount: 95000,
      adminConfirmed: true,
      adminConfirmedAt: orderDate,
      adminConfirmedBy: 'Admin Loket ZAIN.NET',
      createdAt: Date.now() - 3600000 * 12,
    },
    {
      orderId: 'NOT-20261004-805',
      studentName: 'Nurul Hidayati',
      university: 'UIN Madura (Universitas Islam Negeri Madura)',
      isCustomUniversity: false,
      fakultas: 'Fakultas Ekonomi dan Bisnis Islam (FEBI)',
      prodi: 'Perbankan Syariah (PBS)',
      coverColor: 'Kuning',
      whatsapp: '85298765432',
      coverType: 'hard_cover',
      coverCount: 4,
      durationKey: '2_day',
      durationLabel: '2 Hari Jadi',
      durationDays: 2,
      pricePerCover: 40000,
      coversSubtotal: 160000,
      isCompletePackage: true,
      extraCoversAdded: 1,
      selectedServices: ['artikel', 'cd', 'skek', 'pisah_perpus'],
      servicesBreakdown: [
        { id: 'artikel', label: 'Artikel Jurnal', price: 20000 },
        { id: 'cd', label: 'CD Softcopy Skripsi', price: 10000 },
        { id: 'skek', label: 'Buku SKEK', price: 5000 },
        { id: 'pisah_perpus', label: 'Pisah-pisah file untuk Perpus', price: 10000 },
      ],
      servicesSubtotal: 45000,
      printCost: 15000,
      totalCost: 220000,
      fileDeliveryMethod: 'upload_server',
      orderDate: orderDate,
      pickupDate: pickupTomorrow2,
      uploadedFiles: [
        {
          name: 'Naskah_Skripsi_Nurul_FEBI.docx',
          size: 2890400,
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          uploadedAt: orderDate,
          serviceCategory: 'Naskah Skripsi Lengkap',
        },
      ],
      status: 'Menunggu',
      transactionStatus: 'LUNAS',
      paymentChannel: 'Transfer',
      dpAmount: 220000,
      remainingAmount: 0,
      adminConfirmed: true,
      adminConfirmedAt: orderDate,
      adminConfirmedBy: 'Admin Loket ZAIN.NET',
      createdAt: Date.now() - 3600000 * 20,
    },
    {
      orderId: 'NOT-20261003-311',
      studentName: 'Fajar Maulana',
      university: 'UIN Madura (Universitas Islam Negeri Madura)',
      isCustomUniversity: false,
      fakultas: 'Fakultas Syariah (FASYA)',
      prodi: 'Hukum Ekonomi Syariah / Muamalah (HES)',
      coverColor: 'Marron (HES / HTN / Syariah)',
      whatsapp: '87811223344',
      coverType: 'hard_cover',
      coverCount: 3,
      durationKey: '3_day',
      durationLabel: '3 Hari Jadi / Normal',
      durationDays: 3,
      pricePerCover: 30000,
      coversSubtotal: 90000,
      isCompletePackage: false,
      selectedServices: ['cd', 'skek'],
      servicesBreakdown: [
        { id: 'cd', label: 'CD Softcopy Skripsi', price: 10000 },
        { id: 'skek', label: 'Buku SKEK', price: 5000 },
      ],
      servicesSubtotal: 15000,
      printCost: 0,
      totalCost: 105000,
      fileDeliveryMethod: 'whatsapp_only',
      orderDate: orderDate,
      pickupDate: pickup3Days,
      status: 'Menunggu',
      transactionStatus: 'Bayar Nanti',
      dpAmount: 0,
      remainingAmount: 105000,
      adminConfirmed: false,
      createdAt: Date.now() - 3600000 * 4,
    },
  ];
};

interface AppProps {
  onBackToHome?: () => void;
}

export default function App({ onBackToHome }: AppProps = {}) {
  const [currentTab, setCurrentTab] = useState<'order' | 'history' | 'schema'>('order');
  
  // Role Access: Mahasiswa vs Admin
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    try {
      return localStorage.getItem(ADMIN_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SOUND_STORAGE_KEY) !== 'false';
    } catch {
      return true;
    }
  });

  const [showAdminPinModal, setShowAdminPinModal] = useState<boolean>(false);
  const [showUrgentModal, setShowUrgentModal] = useState<boolean>(false);
  const hasTriggeredAlarmRef = useRef<boolean>(false);

  const [orders, setOrders] = useState<OrderRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    return createSampleOrders();
  });

  const [activeInvoiceOrder, setActiveInvoiceOrder] = useState<OrderRecord | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Sync orders to localStorage as local cache layer
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    } catch (e) {
      console.error('Failed to save orders to localStorage', e);
    }
  }, [orders]);

  // Load from persistent server storage on mount & periodically sync (anti-lost data)
  const syncOrdersFromServer = async () => {
    try {
      setIsSyncing(true);
      const res = await fetch('/api/orders');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.orders)) {
          if (data.orders.length > 0) {
            setOrders((prevLocal) => {
              const serverMap = new Map<string, OrderRecord>();
              data.orders.forEach((o: OrderRecord) => {
                if (o && o.orderId) serverMap.set(o.orderId, o);
              });

              // If local has something missing from server, merge and push to server
              const missingOnServer: OrderRecord[] = [];
              prevLocal.forEach((lo) => {
                if (!serverMap.has(lo.orderId)) {
                  serverMap.set(lo.orderId, lo);
                  missingOnServer.push(lo);
                }
              });

              if (missingOnServer.length > 0) {
                fetch('/api/orders/bulk-sync', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ orders: missingOnServer }),
                }).catch(() => {});
              }

              const merged = Array.from(serverMap.values()).sort(
                (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
              );
              try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
              } catch {}
              return merged;
            });
          } else {
            // Server database is empty: seed server with local cache/sample
            const localSaved = localStorage.getItem(STORAGE_KEY);
            const initial = localSaved ? JSON.parse(localSaved) : createSampleOrders();
            fetch('/api/orders/bulk-sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orders: initial }),
            }).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.warn('Permanent order fetch fallback to local cache:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    syncOrdersFromServer();
    // Live multi-device background sync every 15 seconds per requirement
    const interval = setInterval(() => {
      if (isMounted) syncOrdersFromServer();
    }, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Sync admin state
  useEffect(() => {
    try {
      localStorage.setItem(ADMIN_STORAGE_KEY, isAdmin ? 'true' : 'false');
    } catch (e) {
      // ignore
    }
  }, [isAdmin]);

  // Sync sound setting
  useEffect(() => {
    try {
      localStorage.setItem(SOUND_STORAGE_KEY, soundEnabled ? 'true' : 'false');
    } catch (e) {
      // ignore
    }
  }, [soundEnabled]);

  // Calculate urgent orders due tomorrow / today / overdue
  const urgentOrders = useMemo(() => {
    return orders.filter((o) => {
      const u = getPickupUrgency(o.pickupDate);
      return (u.type === 'tomorrow' || u.type === 'today' || u.type === 'overdue') && o.status !== 'Selesai';
    });
  }, [orders]);

  // Trigger sound alarm & popup notification when Admin opens panel and urgent orders exist
  useEffect(() => {
    if (isAdmin && urgentOrders.length > 0 && !hasTriggeredAlarmRef.current) {
      hasTriggeredAlarmRef.current = true;
      if (soundEnabled) {
        playJilidUrgentAlarm();
      }
      setShowUrgentModal(true);
    }
  }, [isAdmin, urgentOrders, soundEnabled]);

  const handleAdminLoginSuccess = () => {
    setIsAdmin(true);
    setCurrentTab('history');
    playSuccessChime();

    // Check if there are urgent orders due tomorrow
    if (urgentOrders.length > 0) {
      setTimeout(() => {
        if (soundEnabled) {
          playJilidUrgentAlarm();
        }
        setShowUrgentModal(true);
      }, 350);
    }
  };

  const handleLogoutAdmin = () => {
    setIsAdmin(false);
    setCurrentTab('order');
    hasTriggeredAlarmRef.current = false;
  };

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
    } catch (err) {
      console.warn('Gagal menyimpan nota baru ke server database:', err);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    setOrders((prev) => prev.filter((o) => o.orderId !== orderId));
    if (activeInvoiceOrder?.orderId === orderId) {
      setActiveInvoiceOrder(null);
    }

    try {
      await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Gagal menghapus nota di server:', err);
    }
  };

  const handleUpdateOrderStatus = async (
    orderId: string,
    status: OrderRecord['status'],
    transactionStatus: TransactionStatus,
    adminConfirmed: boolean,
    adminConfirmedBy?: string
  ) => {
    const adminConfirmedAt = adminConfirmed ? formatDateToCustom(new Date()) : undefined;
    const adminBy = adminConfirmed ? (adminConfirmedBy || 'Admin Loket') : undefined;

    setOrders((prev) =>
      prev.map((o) => {
        if (o.orderId !== orderId) return o;
        return {
          ...o,
          status,
          transactionStatus,
          adminConfirmed,
          adminConfirmedBy: adminBy,
          adminConfirmedAt,
        };
      })
    );

    if (activeInvoiceOrder?.orderId === orderId) {
      setActiveInvoiceOrder((prev) =>
        prev
          ? {
              ...prev,
              status,
              transactionStatus,
              adminConfirmed,
              adminConfirmedBy: adminBy,
              adminConfirmedAt,
            }
          : null
      );
    }

    // Simpan perubahan ke server hosting disk
    try {
      await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          transactionStatus,
          adminConfirmed,
          adminConfirmedBy: adminBy,
          adminConfirmedAt,
        }),
      });
    } catch (err) {
      console.warn('Gagal menyimpan status nota ke server:', err);
    }
  };

  const handleToggleAdminConfirm = async (orderId: string) => {
    const target = orders.find((o) => o.orderId === orderId);
    if (!target) return;
    const nextConfirm = !target.adminConfirmed;
    const adminBy = nextConfirm ? 'Admin Loket ZAIN.NET' : undefined;
    const adminAt = nextConfirm ? formatDateToCustom(new Date()) : undefined;

    if (nextConfirm && soundEnabled) {
      playSuccessChime();
    }

    setOrders((prev) =>
      prev.map((o) => {
        if (o.orderId !== orderId) return o;
        return {
          ...o,
          adminConfirmed: nextConfirm,
          adminConfirmedBy: adminBy,
          adminConfirmedAt: adminAt,
        };
      })
    );

    if (activeInvoiceOrder?.orderId === orderId) {
      setActiveInvoiceOrder((prev) =>
        prev
          ? {
              ...prev,
              adminConfirmed: nextConfirm,
              adminConfirmedBy: adminBy,
              adminConfirmedAt: adminAt,
            }
          : null
      );
    }

    // Simpan verifikasi ke server
    try {
      await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminConfirmed: nextConfirm,
          adminConfirmedBy: adminBy,
          adminConfirmedAt: adminAt,
        }),
      });
    } catch (err) {
      console.warn('Gagal menyimpan verifikasi ke server:', err);
    }
  };

  const handleUpdateReceiptImage = async (orderId: string, url: string, fullUrl: string) => {
    const genAt = formatDateToCustom(new Date());

    setOrders((prev) =>
      prev.map((o) => {
        if (o.orderId !== orderId) return o;
        return {
          ...o,
          receiptImageUrl: url,
          receiptImageFullUrl: fullUrl,
          receiptPngGeneratedAt: genAt,
        };
      })
    );

    if (activeInvoiceOrder?.orderId === orderId) {
      setActiveInvoiceOrder((prev) =>
        prev
          ? {
              ...prev,
              receiptImageUrl: url,
              receiptImageFullUrl: fullUrl,
              receiptPngGeneratedAt: genAt,
            }
          : null
      );
    }

    // Simpan URL gambar struk PNG ke database server permanen
    try {
      await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiptImageUrl: url,
          receiptImageFullUrl: fullUrl,
          receiptPngGeneratedAt: genAt,
        }),
      });
    } catch (err) {
      console.warn('Gagal menyimpan URL struk ke server database:', err);
    }
  };

  return (
    <div className="app-shell min-h-screen flex flex-col">
      {/* Header */}
      <Header
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        orderCount={orders.length}
        urgentCount={urgentOrders.length}
        onBackToHome={onBackToHome}
        isAdmin={isAdmin}
        onOpenAdminLogin={() => setShowAdminPinModal(true)}
        onLogoutAdmin={handleLogoutAdmin}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((prev) => !prev)}
        onTestSound={playJilidUrgentAlarm}
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
            onUpdateStatus={handleUpdateOrderStatus}
            isAdmin={isAdmin}
            onOpenAdminLogin={() => setShowAdminPinModal(true)}
            soundEnabled={soundEnabled}
            onToggleSound={() => setSoundEnabled((prev) => !prev)}
            onRefreshOrders={syncOrdersFromServer}
            isRefreshing={isSyncing}
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
          onUpdateReceiptImage={handleUpdateReceiptImage}
          isAdmin={isAdmin}
        />
      )}

      {/* Modal PIN Admin */}
      <AdminPinModal
        isOpen={showAdminPinModal}
        onClose={() => setShowAdminPinModal(false)}
        onSuccess={handleAdminLoginSuccess}
      />

      {/* Modal Peringatan Follow-up Jilid Besok (Suara & Pop-up) */}
      <UrgentFollowupModal
        isOpen={showUrgentModal}
        onClose={() => setShowUrgentModal(false)}
        urgentOrders={urgentOrders}
        onSelectOrder={(ord) => {
          setActiveInvoiceOrder(ord);
          setShowUrgentModal(false);
        }}
        onFilterUrgentOrders={() => {
          setCurrentTab('history');
          setShowUrgentModal(false);
        }}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((prev) => !prev)}
      />

      {/* Footer */}
      <footer className="no-print bg-white border-t border-slate-200 py-6 mt-12 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">
              Sistem Nota & Jilid Hard Cover Skripsi UIN Madura
            </span>
            <span>•</span>
            <span>{isAdmin ? '👑 Mode Admin Aktif' : '👤 Mode Mahasiswa / Pemesan'}</span>
          </div>
          <div>
            Format Resmi Fakultas &bull; FATAR (Hijau) &bull; FEBI (Kuning) &bull; USULUDDIN (Biru) &bull; FASYA (Merah/Marron)
          </div>
        </div>
      </footer>
    </div>
  );
}
