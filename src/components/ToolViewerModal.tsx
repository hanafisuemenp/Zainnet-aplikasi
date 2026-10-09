import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, 
  RotateCw, 
  Check, 
  ArrowLeft,
  Maximize2,
  Minimize2,
  Sparkles,
  Crown,
  Activity,
  CheckCircle2,
  ShieldCheck,
  FileCheck,
  Clock,
  Zap,
  AlertTriangle,
  HelpCircle,
  Timer,
  Lock,
  Info
} from 'lucide-react';
import { ToolItem, UserRole, ToolMaintenanceItem, AppUser, UserActivityLogEntry } from '../types';
import { recordSessionInProgress, recordSessionCompleted, getSessionForTool } from '../utils/sessionTracker';
import { SkripsiPaginatorView } from './SkripsiPaginatorView';
import { SkripsiPaginatorFixedView } from './SkripsiPaginatorFixedView';
import { PhotoGridView } from '../photoGrid/PhotoGridView';
import { Label103View } from '../label103/Label103View';
import GabungFileApp from '../gabungFile/App';

interface ToolViewerModalProps {
  tool: ToolItem | null;
  quota?: number;
  resellerTrialRemaining?: number;
  userRole?: UserRole;
  user?: AppUser | null;
  userId?: string;
  maintenanceInfo?: ToolMaintenanceItem;
  onClose: () => void;
  onFinishCreation?: (tool: ToolItem, details?: string) => void;
  onNotifyUnfinished?: (tool: ToolItem) => void;
}

export const ToolViewerModal: React.FC<ToolViewerModalProps> = ({ 
  tool, 
  quota = 1,
  resellerTrialRemaining = 0,
  userRole = 'public',
  user,
  userId,
  maintenanceInfo,
  onClose,
  onFinishCreation,
  onNotifyUnfinished
}) => {
  const effectiveUserId = userId || user?.uid || 'guest';
  const [iframeKey, setIframeKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showExitAlert, setShowExitAlert] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Time Thresholds: 2 minutes (120s) status notice, 5 minutes (300s) timeout completion
  const TWO_MINUTES_CHECK_SECONDS = 120; // 2 menit
  const FIVE_MINUTES_TIMEOUT_SECONDS = 300; // 5 menit
  const AUTO_COMPLETE_TARGET_SECONDS = FIVE_MINUTES_TIMEOUT_SECONDS;
  const [autoProgressPercent, setAutoProgressPercent] = useState(0);
  const [autoDetectionStage, setAutoDetectionStage] = useState<'connecting' | 'drafting' | 'generating' | 'completed'>('connecting');
  
  // 2-Minute prompt & 5-Minute timeout states
  const [showTwoMinuteNotice, setShowTwoMinuteNotice] = useState(false);
  const [hasDismissedTwoMinuteNotice, setHasDismissedTwoMinuteNotice] = useState(false);
  const [showFiveMinuteTimeoutToast, setShowFiveMinuteTimeoutToast] = useState(false);
  const [isPastFiveMinutes, setIsPastFiveMinutes] = useState(false);
  const [showBlockedBackNotice, setShowBlockedBackNotice] = useState(false);

  // System Activity Tracker State
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const [downloadedInfo, setDownloadedInfo] = useState<{ fileName: string; timestamp: string; reason: string } | null>(null);
  const [showAutoFinishToast, setShowAutoFinishToast] = useState(false);
  const [showActivityDrawer, setShowActivityDrawer] = useState(false);
  const [activityLogs, setActivityLogs] = useState<UserActivityLogEntry[]>([]);
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [interactionCount, setInteractionCount] = useState(0);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const hasTriggeredFinishRef = useRef(false);
  const isPastFiveMinutesRef = useRef(false);
  const activeSecondsRef = useRef(0);
  const interactionCountRef = useRef(0);
  const activityLogsRef = useRef<UserActivityLogEntry[]>([]);

  const isAdmin = userRole === 'admin';
  const isReseller = userRole === 'reseller';
  const isUsingResellerTrial = isReseller && resellerTrialRemaining > 0;

  const addLog = useCallback((type: 'info' | 'action' | 'download' | 'complete' | 'alert' | 'status', message: string) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const newEntry: UserActivityLogEntry = { id: `${Date.now()}-${Math.random()}`, time: timeStr, type, message };
    setActivityLogs((prev) => {
      const next = [newEntry, ...prev];
      activityLogsRef.current = next;
      return next;
    });
  }, []);

  const onFinishCreationRef = useRef(onFinishCreation);
  useEffect(() => {
    onFinishCreationRef.current = onFinishCreation;
  }, [onFinishCreation]);

  const addLogRef = useRef(addLog);
  useEffect(() => {
    addLogRef.current = addLog;
  }, [addLog]);

  // Trigger Automatic Completion when Download, Generation Lifecycle, or File Export is Detected
  const handleAutoFinishDownload = useCallback((fileName = `${tool?.title || 'Dokumen'}.docx`, reason = 'Deteksi otomatis penyelesaian naskah') => {
    if (hasTriggeredFinishRef.current) return;
    hasTriggeredFinishRef.current = true;
    setAutoDetectionStage('completed');
    setAutoProgressPercent(100);

    const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setHasDownloaded(true);
    setDownloadedInfo({ fileName, timestamp: nowStr, reason });
    setShowAutoFinishToast(true);

    addLog('complete', `DETEKSI SELESAI OTOMATIS: Naskah "${fileName}" telah selesai disusun (${reason}).`);
    addLog('complete', 'TRANSAKSI SELESAI RESMI: Kuota 1x pemakaian telah otomatis dicatat & dipotong oleh sistem.');

    if (tool) {
      recordSessionCompleted(tool, effectiveUserId, { fileName, reason }, activityLogsRef.current, activeSecondsRef.current);
    }

    if (onFinishCreationRef.current && tool && !isAdmin) {
      onFinishCreationRef.current(tool, `Selesai Otomatis (${reason} — ${fileName})`);
    }

    // Direct synchronization to prevent multiple uses on 1 payment
    try {
      localStorage.setItem(`zain_completed_${tool?.id}`, JSON.stringify({
        toolId: tool?.id,
        completedAt: Date.now(),
        fileName,
        reason
      }));

      // Synchronously decrement local quota storage to immediately lock tool on return
      const quotaKey = user?.uid ? `zain_quotas_${user.uid}` : 'zain_guest_quotas';
      const raw = localStorage.getItem(quotaKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (tool?.id && typeof parsed[tool.id] === 'number' && parsed[tool.id] > 0) {
          parsed[tool.id] = Math.max(0, parsed[tool.id] - 1);
          localStorage.setItem(quotaKey, JSON.stringify(parsed));
        }
      }
    } catch (e) {
      console.warn('Direct local quota sync warning:', e);
    }

    // Auto dismiss toast after 9 seconds
    setTimeout(() => {
      setShowAutoFinishToast(false);
    }, 9000);
  }, [addLog, tool, isAdmin, effectiveUserId, user?.uid]);

  const handleAutoFinishDownloadRef = useRef(handleAutoFinishDownload);
  useEffect(() => {
    handleAutoFinishDownloadRef.current = handleAutoFinishDownload;
  }, [handleAutoFinishDownload]);

  const handleGuardedCloseRef = useRef<() => void>(() => {});

  // Main Effect: Timer, Intelligent Auto-Completion, Interceptors, and Exit Protection
  useEffect(() => {
    if (!tool) return;

    const isInternalPaginator =
      tool.id === 'num-2' ||
      tool.id === 'num-3' ||
      tool.id === 'foto-1' ||
      tool.id === 'label-103' ||
      tool.id === 'gabung-1' ||
      tool.url === 'internal://skripsi-paginator' ||
      tool.url === 'internal://skripsi-paginator-fixed' ||
      tool.url === 'internal://docx-photo-grid' ||
      tool.url === 'internal://label-103' ||
      tool.url === 'internal://gabung-file';
    setIsLoading(!isInternalPaginator);
    hasTriggeredFinishRef.current = false;
    const startStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Check existing session state
    const existingSession = getSessionForTool(tool.id, effectiveUserId);
    if (existingSession && existingSession.status === 'in_progress') {
      setActiveSeconds(existingSession.activeSeconds || 0);
      setInteractionCount(existingSession.interactionCount || 0);
      activeSecondsRef.current = existingSession.activeSeconds || 0;
      interactionCountRef.current = existingSession.interactionCount || 0;

      const resumedLog: UserActivityLogEntry = {
        id: `log-resume-${Date.now()}`,
        time: startStr,
        type: 'status',
        message: `[STATUS: DILANJUTKAN] Melanjutkan sesi kerja pembuatan naskah (${existingSession.activeSeconds}s aktif). Sistem memantau pembuatan secara otomatis.`
      };
      const initialLogs = [resumedLog, ...(existingSession.logs || [])];
      activityLogsRef.current = initialLogs;
      setActivityLogs(initialLogs);
    } else {
      setActiveSeconds(0);
      setInteractionCount(0);
      activeSecondsRef.current = 0;
      interactionCountRef.current = 0;

      const initialLog: UserActivityLogEntry = {
        id: 'log-start',
        time: startStr,
        type: 'info',
        message: `[SESI AKTIF] Sesi modul "${tool.title}" dimulai. Sistem secara otomatis mendeteksi penyusunan naskah hingga selesai.`
      };
      const initialLogs = [initialLog];
      activityLogsRef.current = initialLogs;
      setActivityLogs(initialLogs);

      // Record initial state as in_progress
      recordSessionInProgress(
        tool,
        effectiveUserId,
        initialLogs,
        0,
        0,
        'Sesi baru dibuka. Sistem memantau proses pembuatan naskah.'
      );
    }

    // Active usage & Auto-Completion Timer (runs every second)
    const timerInterval = setInterval(() => {
      setActiveSeconds((prev) => {
        const next = prev + 1;
        activeSecondsRef.current = next;
        
        // Calculate progress percentage towards 5 minutes (300 seconds)
        const progress = Math.min(100, Math.round((next / FIVE_MINUTES_TIMEOUT_SECONDS) * 100));
        setAutoProgressPercent(progress);

        // Lifecycle Stages
        if (hasTriggeredFinishRef.current) {
          setAutoDetectionStage('completed');
        } else if (next < 15) {
          setAutoDetectionStage('connecting');
        } else if (next < TWO_MINUTES_CHECK_SECONDS) {
          setAutoDetectionStage('drafting');
          if (next === 10) {
            addLogRef.current('info', 'Sensor Sistem: Pengguna mengisi topik/formulir naskah...');
          }
        } else if (next < FIVE_MINUTES_TIMEOUT_SECONDS) {
          setAutoDetectionStage('generating');
        } else {
          setAutoDetectionStage('completed');
        }

        // 2-Minute status check notification (~120 seconds)
        if (next === TWO_MINUTES_CHECK_SECONDS && !hasTriggeredFinishRef.current && !isAdmin) {
          setShowTwoMinuteNotice(true);
          addLogRef.current('alert', `Pemberitahuan 2 Menit: Menanyakan apakah pengguna sudah selesai membuat "${tool.title}".`);
        }

        // 5-Minute timeout auto-completion (~300 seconds)
        if (next >= FIVE_MINUTES_TIMEOUT_SECONDS && !hasTriggeredFinishRef.current && !isAdmin) {
          setShowTwoMinuteNotice(false);
          setIsPastFiveMinutes(true);
          isPastFiveMinutesRef.current = true;
          setShowFiveMinuteTimeoutToast(true);
          addLogRef.current('complete', `Batas Waktu 5 Menit Tercapai: Pemrosesan file naskah "${tool.title}" otomatis dianggap telah selesai oleh sistem. Kuota 1x telah dicatat. Pengguna tetap dapat melanjutkan pengeditan naskah di halaman ini.`);
          handleAutoFinishDownloadRef.current(
            'Pemrosesan Selesai',
            'Batas waktu pengerjaan 5 menit telah tercapai (Dianggap selesai pemrosesan file)'
          );
        } else if (next >= FIVE_MINUTES_TIMEOUT_SECONDS && !isAdmin) {
          if (!isPastFiveMinutesRef.current) {
            setIsPastFiveMinutes(true);
            isPastFiveMinutesRef.current = true;
          }
        }

        return next;
      });
    }, 1000);

    // Add hash for history back button navigation
    window.history.pushState({ toolModalOpen: true }, '', '#workspace');
    document.body.style.overflow = 'hidden';

    // 1. Intercept Global URL.createObjectURL (catches all blob/file downloads in window)
    const originalCreateObjectURL = window.URL.createObjectURL;
    window.URL.createObjectURL = function (obj: Blob | MediaSource) {
      try {
        const url = originalCreateObjectURL.call(window.URL, obj);
        if (obj instanceof Blob && !isInternalPaginator) {
          const type = obj.type || '';
          const size = obj.size;
          addLogRef.current('download', `Sistem mendeteksi pembuatan berkas Blob (${type || 'dokumen'}, ${Math.round(size / 1024)} KB).`);
          handleAutoFinishDownloadRef.current(`${tool.title}.docx`, 'Blob file stream terdeteksi');
        }
        return url;
      } catch (e) {
        return originalCreateObjectURL.call(window.URL, obj);
      }
    };

    // 2. Intercept HTMLAnchorElement.prototype.click (catches programmatic & user link downloads)
    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      try {
        const downloadAttr = this.getAttribute('download');
        const href = this.getAttribute('href') || '';
        if (
          !isInternalPaginator &&
          (downloadAttr !== null || 
          href.startsWith('blob:') || 
          href.startsWith('data:') || 
          href.includes('.docx') || 
          href.includes('.pdf') ||
          href.includes('export'))
        ) {
          const fileName = downloadAttr || `${tool.title}.docx`;
          handleAutoFinishDownloadRef.current(fileName, 'Programmatic download trigger');
        }
      } catch (err) {
        console.warn('Anchor click interception warning:', err);
      }
      return originalAnchorClick.call(this);
    };

    // 3. Intercept window.open
    const originalWindowOpen = window.open;
    window.open = function (url?: string | URL, target?: string, features?: string) {
      try {
        if (url) {
          const urlStr = String(url).toLowerCase();
          if (
            urlStr.startsWith('blob:') || 
            urlStr.startsWith('data:') || 
            urlStr.includes('.docx') || 
            urlStr.includes('.pdf') || 
            urlStr.includes('download') ||
            urlStr.includes('export')
          ) {
            handleAutoFinishDownloadRef.current(`${tool.title}.docx`, 'Window.open file stream');
          }
        }
      } catch (err) {
        console.warn('Window.open interceptor warning:', err);
      }
      return originalWindowOpen.call(window, url, target, features);
    };

    // 4. Listen to postMessage from iframe / child webapps
    const handleWindowMessage = (event: MessageEvent) => {
      try {
        const data = event.data;
        if (!data) return;

        let isCompletionEvent = false;
        let detectedName = `${tool.title}.docx`;

        if (typeof data === 'string') {
          const lower = data.toLowerCase();
          if (
            lower.includes('download') || 
            lower.includes('unduh') || 
            lower.includes('export') || 
            lower.includes('.docx') || 
            lower.includes('.pdf') || 
            lower.includes('file_generated') ||
            lower.includes('save_file') ||
            lower.includes('generate_complete') ||
            lower.includes('document_ready') ||
            lower.includes('makalah') ||
            lower.includes('proposal') ||
            lower.includes('artikel') ||
            lower.includes('finished') ||
            lower.includes('result') ||
            lower.includes('done')
          ) {
            isCompletionEvent = true;
          }
        } else if (typeof data === 'object') {
          const typeStr = String(data.type || data.action || data.event || data.status || data.message || '').toLowerCase();
          if (
            typeStr.includes('download') || 
            typeStr.includes('export') || 
            typeStr.includes('complete') || 
            typeStr.includes('file') || 
            typeStr.includes('pdf') || 
            typeStr.includes('doc') ||
            typeStr.includes('ready') ||
            typeStr.includes('generate') ||
            typeStr.includes('done') ||
            typeStr.includes('finish')
          ) {
            isCompletionEvent = true;
            if (data.fileName || data.filename || data.title) {
              detectedName = String(data.fileName || data.filename || data.title);
            }
          }
        }

        if (isCompletionEvent) {
          handleAutoFinishDownloadRef.current(detectedName, 'Sinyal otomatis dari antarmuka modul (postMessage)');
        }
      } catch (e) {
        console.warn('Error handling postMessage in ToolViewer:', e);
      }
    };

    // 5. Detect iframe click & interactions via window blur
    const handleWindowBlur = () => {
      setTimeout(() => {
        if (document.activeElement && document.activeElement.tagName === 'IFRAME') {
          setInteractionCount((prev) => {
            const next = prev + 1;
            interactionCountRef.current = next;
            addLogRef.current('action', `Aktivitas ke-${next} di dalam generator naskah terdeteksi.`);
            return next;
          });
        }
      }, 100);
    };

    // 6. Detect clipboard copy (User copying generated text from generator)
    const handleCopyEvent = () => {
      addLogRef.current('action', 'Penyalinan teks naskah ke clipboard terdeteksi.');
    };

    // 7. Intercept document click in window
    const handleDocumentClick = (e: MouseEvent) => {
      try {
        if (isInternalPaginator) return;
        const target = e.target as HTMLElement | null;
        if (!target) return;

        const anchor = target.closest('a');
        if (anchor) {
          const href = anchor.getAttribute('href') || '';
          const downloadAttr = anchor.getAttribute('download');
          if (
            downloadAttr !== null || 
            href.startsWith('blob:') || 
            href.startsWith('data:') || 
            href.includes('.docx') || 
            href.includes('.pdf') || 
            href.includes('export')
          ) {
            const fileName = downloadAttr || `${tool.title}.docx`;
            handleAutoFinishDownloadRef.current(fileName, 'Klik tautan unduh');
          }
        }

        const btn = target.closest('button');
        if (btn) {
          const btnText = (btn.innerText || btn.textContent || '').toLowerCase();
          if (
            (btnText.includes('download') || btnText.includes('unduh') || btnText.includes('cetak docx') || btnText.includes('simpan file')) &&
            !btnText.includes('batal')
          ) {
            handleAutoFinishDownloadRef.current(`${tool.title} (Hasil)`, 'Interaksi tombol unduh');
          }
        }
      } catch (err) {
        console.warn('Click interceptor error:', err);
      }
    };

    // 8. Exit / Unload Protection:
    // If user has interacted or spent time in generator, AUTO-CONSUME quota on unload to close the loophole!
    const handleBeforeUnload = () => {
      if (!hasTriggeredFinishRef.current && tool && !isAdmin) {
        if (activeSecondsRef.current >= 15 || interactionCountRef.current >= 1) {
          hasTriggeredFinishRef.current = true;
          recordSessionCompleted(
            tool,
            effectiveUserId,
            { fileName: `${tool.title}.docx`, reason: 'Sesi pembuatan naskah diselesaikan otomatis saat peramban ditutup/direfresh' },
            activityLogsRef.current,
            activeSecondsRef.current
          );

          if (onFinishCreationRef.current) {
            onFinishCreationRef.current(tool, 'Pembuatan naskah diselesaikan otomatis saat peramban ditutup/direfresh');
          }

          // Directly decrement local quota to guarantee tool locks immediately
          try {
            const quotaKey = user?.uid ? `zain_quotas_${user.uid}` : 'zain_guest_quotas';
            const raw = localStorage.getItem(quotaKey);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed[tool.id] > 0) {
                parsed[tool.id] = Math.max(0, parsed[tool.id] - 1);
                localStorage.setItem(quotaKey, JSON.stringify(parsed));
              }
            }
          } catch (e) {}
        }
      }
    };

    const handlePopState = () => {
      if (isPastFiveMinutesRef.current && !isAdmin) {
        window.history.pushState({ toolModalOpen: true }, '', '#workspace');
        setShowBlockedBackNotice(true);
        return;
      }
      handleGuardedCloseRef.current();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) {
        if (isPastFiveMinutesRef.current && !isAdmin) {
          setShowBlockedBackNotice(true);
          return;
        }
        handleGuardedCloseRef.current();
      }
    };

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('copy', handleCopyEvent);
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('message', handleWindowMessage);
    window.addEventListener('click', handleDocumentClick, true);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      clearInterval(timerInterval);
      document.body.style.overflow = 'auto';

      // Restore monkey-patched functions
      window.URL.createObjectURL = originalCreateObjectURL;
      HTMLAnchorElement.prototype.click = originalAnchorClick;
      window.open = originalWindowOpen;

      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('copy', handleCopyEvent);
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('message', handleWindowMessage);
      window.removeEventListener('click', handleDocumentClick, true);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [tool?.id, effectiveUserId, isAdmin, user?.uid]);

  if (!tool) return null;

  // Guarded Close: Check whether finished or active
  const handleGuardedClose = () => {
    // If 5 minutes have passed, user cannot click kembali
    if (isPastFiveMinutesRef.current && !isAdmin) {
      setShowBlockedBackNotice(true);
      return;
    }

    // If already officially finished or admin, allow close immediately
    if (hasTriggeredFinishRef.current || hasDownloaded || isAdmin) {
      onClose();
      return;
    }

    // Always show confirmation prompt if user clicks back before finishing
    setShowExitAlert(true);
  };

  handleGuardedCloseRef.current = handleGuardedClose;

  // Accidental opening cancel (under 15s, no interactions)
  const handleConfirmCancelEarly = () => {
    if (tool) {
      recordSessionInProgress(
        tool,
        effectiveUserId,
        activityLogs,
        activeSecondsRef.current,
        interactionCountRef.current,
        'Pengguna keluar cepat (<15s tanpa interaksi). Kuota tidak berkurang.'
      );
      if (onNotifyUnfinished) {
        onNotifyUnfinished(tool);
      }
    }
    setShowExitAlert(false);
    onClose();
  };

  // Exit & Complete Transaction: Consumes quota and finishes session cleanly
  const handleConfirmExitAndComplete = () => {
    handleAutoFinishDownload(
      'Pembuatan Selesai',
      'Penyelesaian transaksi saat pengguna kembali ke menu utama'
    );
    setShowExitAlert(false);
    onClose();
  };

  const handleReload = () => {
    const isInternalPaginator =
      tool.id === 'num-2' ||
      tool.id === 'num-3' ||
      tool.id === 'foto-1' ||
      tool.id === 'label-103' ||
      tool.id === 'gabung-1' ||
      tool.url === 'internal://skripsi-paginator' ||
      tool.url === 'internal://skripsi-paginator-fixed' ||
      tool.url === 'internal://docx-photo-grid' ||
      tool.url === 'internal://label-103' ||
      tool.url === 'internal://gabung-file';
    setIsLoading(!isInternalPaginator);
    setIframeKey((prev) => prev + 1);
    addLog('action', 'Pengguna menyegarkan (reload) tampilan modul.');
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (containerRef.current) {
          await containerRef.current.requestFullscreen();
        }
      } else {
        await document.exitFullscreen();
      }
    } catch (e) {
      console.warn('Fullscreen request failed:', e);
    }
  };

  return (
    <div 
      ref={containerRef}
      id="module-workspace-container"
      className="fixed inset-0 z-50 bg-slate-950 flex flex-col animate-in fade-in duration-200"
    >
      {/* Top Workspace Header Bar */}
      <header className="h-14 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-3 sm:px-4 flex items-center justify-between gap-2 shrink-0 z-20">
        
        {/* Left: Back & Title */}
        <div className="flex items-center gap-2.5 min-w-0">
          {isPastFiveMinutes && !isAdmin ? (
            <button
              id="close-workspace-btn-locked"
              onClick={() => setShowBlockedBackNotice(true)}
              title="Waktu 5 menit telah lewat. Proses sudah dianggap selesai dan tombol kembali dinonaktifkan agar Anda tetap bisa mengedit dokumen."
              className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-amber-300 border border-slate-700/60 flex items-center gap-1.5 text-xs font-semibold cursor-not-allowed shrink-0 transition-colors"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Kembali (Terkunci)</span>
              <span className="sm:hidden">Terkunci</span>
            </button>
          ) : (
            <button
              id="close-workspace-btn"
              onClick={handleGuardedClose}
              aria-label="Kembali ke menu"
              className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer border border-slate-700/60 shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Kembali</span>
            </button>
          )}

          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-violet-600 flex items-center justify-center text-white font-extrabold text-sm shadow-md shadow-blue-500/20 shrink-0 hidden xs:flex">
            Z
          </div>

          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white truncate flex items-center gap-2">
              <span className="truncate">{tool.title}</span>
              {isAdmin ? (
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 shrink-0">
                  <Crown className="w-2.5 h-2.5 text-amber-400" />
                  <span>Admin Bebas Akses</span>
                </span>
              ) : isUsingResellerTrial ? (
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1 shrink-0 animate-pulse">
                  <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
                  <span>Free Trial Reseller ({resellerTrialRemaining}/3x)</span>
                </span>
              ) : (
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1 shrink-0">
                  <Sparkles className="w-2.5 h-2.5 text-blue-400" />
                  <span>Sesi Aktif ({quota}x Kuota)</span>
                </span>
              )}
            </h2>
            <p className="text-[11px] text-slate-400 truncate hidden md:block">
              {tool.description || 'Modul Pemrosesan & Penyusunan Dokumen Akademik'}
            </p>
          </div>
        </div>

        {/* Center/Right: Intelligent Auto-Detection Status Badge & Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          
          {/* Intelligent Sensor Status Badge */}
          <button
            id="btn-system-status-indicator"
            onClick={() => setShowActivityDrawer((prev) => !prev)}
            title="Klik untuk melihat catatan rekaman sensor sistem"
            className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm ${
              hasDownloaded 
                ? 'bg-emerald-950/90 border-emerald-500/70 text-emerald-300 hover:bg-emerald-900/70' 
                : 'bg-cyan-950/80 border-cyan-500/60 text-cyan-300 hover:bg-cyan-900/60'
            }`}
          >
            {hasDownloaded ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">✓ Selesai Otomatis: 1x Kuota Tercatat</span>
                <span className="sm:hidden">Selesai ✓</span>
              </>
            ) : (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                </span>
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">
                  Deteksi AI: {autoDetectionStage === 'connecting' ? 'Menghubungkan' : autoDetectionStage === 'drafting' ? 'Menyusun' : 'Memproses'} ({autoProgressPercent}%)
                </span>
                <span className="sm:hidden">Deteksi ({autoProgressPercent}%)</span>
              </>
            )}
          </button>

          {/* Quick Manual Finish Button */}
          {!isAdmin && !hasDownloaded && (
            <button
              id="btn-download-complete-transaction"
              onClick={() => handleAutoFinishDownload('Pembuatan Selesai', 'Diselesaikan secara manual oleh pengguna')}
              title="Klik jika Anda ingin menyelesaikan proses pembuatan dan mencatat transaksi sekarang."
              className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-950/50 transition-all cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Selesaikan Sekarang</span>
              <span className="md:hidden">Selesai</span>
            </button>
          )}

          {/* If already completed: Finish & Close Button */}
          {hasDownloaded && (
            isPastFiveMinutes && !isAdmin ? (
              <div 
                title="Waktu 5 menit telah tercapai. Kuota 1x telah dicatat dan proses resmi selesai. Anda tetap bebas mengedit naskah."
                className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center gap-1.5 shadow-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden md:inline">Selesai (5 Menit) • Bebas Lanjut Edit</span>
                <span className="md:hidden">Selesai • Lanjut Edit</span>
              </div>
            ) : (
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-950 transition-all cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tutup ke Menu</span>
                <span className="sm:hidden">Tutup</span>
              </button>
            )
          )}

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? "Keluar Layar Penuh" : "Layar Penuh"}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer border border-slate-700/60 hidden sm:flex items-center gap-1 text-xs"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            <span className="hidden md:inline">{isFullscreen ? 'Kecilkan' : 'Layar Penuh'}</span>
          </button>

          {/* Reload internal view button */}
          <button
            onClick={handleReload}
            title="Segarkan tampilan modul"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer border border-slate-700/60"
          >
            <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
          </button>

          {/* Close button */}
          <button
            onClick={handleGuardedClose}
            aria-label="Tutup modul"
            className="p-2 rounded-xl bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-400 transition-colors cursor-pointer border border-slate-700/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Floating Smart Progress Bar: 5-Minute Lifecycle & 2-Minute Status Engine */}
      <div className={`px-4 py-2 text-xs flex items-center justify-between gap-3 shadow-inner border-b transition-colors ${
        hasDownloaded
          ? 'bg-gradient-to-r from-emerald-950/95 via-slate-900 to-emerald-900/90 border-emerald-500/40 text-emerald-200'
          : 'bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950/90 border-slate-800 text-slate-300'
      }`}>
        <div className="flex items-center gap-2.5 truncate flex-1">
          {hasDownloaded ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <Timer className="w-4 h-4 text-cyan-400 shrink-0 animate-pulse" />
          )}
          
          <div className="min-w-0 flex-1">
            {isPastFiveMinutes ? (
              <span className="truncate block">
                <strong className="text-emerald-300">Batas 5 Menit Terlewati (Proses Selesai):</strong> Kuota 1x telah tercatat resmi. Anda bebas tetap mengedit naskah di halaman ini.
              </span>
            ) : hasDownloaded ? (
              <span className="truncate block">
                <strong className="text-emerald-300">Transaksi Resmi Selesai:</strong> Pembuatan naskah berhasil diselesaikan. Kuota 1x pemakaian telah tercatat.
              </span>
            ) : (
              <div className="flex items-center gap-3">
                <span className="truncate hidden sm:inline">
                  <strong>Waktu Pengerjaan:</strong> {Math.floor(activeSeconds / 60)}:{activeSeconds % 60 < 10 ? '0' : ''}{activeSeconds % 60} / 05:00 menit {activeSeconds >= TWO_MINUTES_CHECK_SECONDS ? '• (Notif 2 menit dikirim)' : '• (Konfirmasi status di menit ke-2)'}
                </span>
                <span className="truncate sm:hidden">
                  Waktu: {Math.floor(activeSeconds / 60)}:{activeSeconds % 60 < 10 ? '0' : ''}{activeSeconds % 60} / 5m ({autoProgressPercent}%)
                </span>
                {/* Visual Mini Progress Bar */}
                <div className="w-24 sm:w-36 h-2 rounded-full bg-slate-800 border border-slate-700/80 overflow-hidden shrink-0">
                  <div 
                    className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-500 transition-all duration-300 rounded-full"
                    style={{ width: `${autoProgressPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Status Help */}
        <div className="flex items-center gap-2 shrink-0">
          {isPastFiveMinutes && !isAdmin ? (
            <span className="text-[11px] text-amber-300 font-medium bg-amber-950/60 px-2.5 py-0.5 rounded-lg border border-amber-500/40 flex items-center gap-1">
              <Lock className="w-3 h-3 text-amber-400" />
              <span>Kembali Dinonaktifkan (Tetap Mengedit)</span>
            </span>
          ) : !hasDownloaded && !isAdmin && (
            <span className="text-[11px] text-cyan-300/90 font-mono bg-cyan-950/60 px-2.5 py-0.5 rounded-lg border border-cyan-500/30">
              Selesai otomatis: {Math.floor(Math.max(0, FIVE_MINUTES_TIMEOUT_SECONDS - activeSeconds) / 60)}:{(Math.max(0, FIVE_MINUTES_TIMEOUT_SECONDS - activeSeconds) % 60) < 10 ? '0' : ''}{Math.max(0, FIVE_MINUTES_TIMEOUT_SECONDS - activeSeconds) % 60}
            </span>
          )}
        </div>
      </div>

      {/* Floating Auto-Finish Alert Toast Notification */}
      {showAutoFinishToast && downloadedInfo && (
        <div className="absolute top-24 right-4 z-40 max-w-md w-[calc(100%-2rem)] bg-slate-900/95 backdrop-blur-md border-2 border-emerald-500 rounded-2xl p-4 shadow-2xl shadow-emerald-950/60 animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <FileCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-emerald-400 tracking-wide uppercase flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Transaksi Berhasil Selesai
                </span>
                <span className="text-[10px] text-slate-400 font-mono">{downloadedInfo.timestamp}</span>
              </div>
              <h4 className="text-sm font-bold text-white truncate mt-0.5">
                {tool.title} — Selesai
              </h4>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Sistem otomatis mendeteksi naskah Anda telah selesai disusun! Kuota pemakaian 1x telah dicatat dan transaksi selesai resmi tanpa perlu klik manual.
              </p>
            </div>
            <button
              onClick={() => setShowAutoFinishToast(false)}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* System Activity Drawer Log (Popover) */}
      {showActivityDrawer && (
        <div className="absolute top-24 right-4 z-30 w-84 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-2xl p-4 shadow-2xl text-xs space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-1.5 font-bold text-white">
              <Activity className="w-4 h-4 text-cyan-400" />
              <span>Rekaman Sensor Sistem Real-Time</span>
            </div>
            <button
              onClick={() => setShowActivityDrawer(false)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Status Transaksi:</span>
              <span className={hasDownloaded ? "text-emerald-400 font-bold" : "text-cyan-400 font-bold"}>
                {hasDownloaded ? "Selesai Otomatis (1x Kuota Tercatat)" : `Sedang Diproses (${autoProgressPercent}%)`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Pendeteksian AI:</span>
              <span className="text-slate-200 font-semibold">{autoDetectionStage.toUpperCase()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Waktu Aktif:</span>
              <span className="text-slate-200 font-semibold">{activeSeconds} detik</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Total Interaksi:</span>
              <span className="text-slate-200 font-semibold">{interactionCount} kali</span>
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {activityLogs.map((log) => (
              <div 
                key={log.id} 
                className={`p-2 rounded-xl border text-[11px] space-y-0.5 ${
                  log.type === 'download' || log.type === 'complete'
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200' 
                    : log.type === 'alert'
                    ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                    : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono">
                  <span className="flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {log.time}
                  </span>
                  <span className="uppercase font-bold tracking-wider">{log.type}</span>
                </div>
                <p className="leading-tight">{log.message}</p>
              </div>
            ))}
          </div>

          {/* Action & Admin Simulation buttons inside drawer */}
          <div className="pt-2 border-t border-slate-800 space-y-1.5">
            <button
              onClick={() => handleAutoFinishDownload('Pembuatan Selesai', 'Diselesaikan secara manual oleh pengguna')}
              className="w-full py-1.5 rounded-lg bg-emerald-950 border border-emerald-500/40 hover:bg-emerald-900/60 text-emerald-300 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Tandai Selesai Sekarang</span>
            </button>

            {isAdmin && (
              <div className="pt-1 flex gap-1.5">
                <button
                  onClick={() => {
                    setActiveSeconds(119);
                    activeSecondsRef.current = 119;
                  }}
                  className="flex-1 py-1 rounded bg-blue-950/80 border border-blue-500/30 hover:bg-blue-900 text-blue-300 text-[10px] font-medium"
                >
                  ⚡ Tes Notif 2 Mnt
                </button>
                <button
                  onClick={() => {
                    setActiveSeconds(299);
                    activeSecondsRef.current = 299;
                  }}
                  className="flex-1 py-1 rounded bg-purple-950/80 border border-purple-500/30 hover:bg-purple-900 text-purple-300 text-[10px] font-medium"
                >
                  ⚡ Tes Timeout 5 Mnt
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Seamless Workspace Container */}
      <div className="flex-1 relative w-full h-full bg-slate-950 overflow-hidden">
        
        {/* Loading Indicator */}
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10 transition-opacity">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-xl shadow-blue-500/25 animate-pulse mb-4">
              <span className="text-2xl font-black text-white">Z</span>
            </div>
            <p className="text-sm font-bold text-slate-200">Menyiapkan {tool.title}...</p>
            <p className="text-xs text-slate-400 mt-1">Memuat antarmuka kerja sistem ZAIN.NET</p>
          </div>
        )}

        {/* Embedded Module Content */}
        {tool.id === 'num-2' ||
        tool.id === 'num-3' ||
        tool.url === 'internal://skripsi-paginator' ||
        tool.url === 'internal://skripsi-paginator-fixed' ? (
          <div key={iframeKey} className="w-full h-full overflow-y-auto bg-slate-50">
            <SkripsiPaginatorFixedView
              onCorrectionComplete={(outFileName) => {
                handleAutoFinishDownload(
                  outFileName,
                  'Koreksi & validasi penomoran halaman Word (.docx) + TOC selesai'
                );
              }}
            />
          </div>
        ) : tool.id === 'foto-1' || tool.url === 'internal://docx-photo-grid' ? (
          <div key={iframeKey} className="w-full h-full overflow-y-auto bg-neutral-100">
            <PhotoGridView
              onExportComplete={(outFileName) => {
                handleAutoFinishDownload(
                  outFileName,
                  'Edit foto & ekspor kisi foto Word (.docx) selesai'
                );
              }}
            />
          </div>
        ) : tool.id === 'label-103' || tool.url === 'internal://label-103' ? (
          <div key={iframeKey} className="w-full h-full overflow-y-auto bg-slate-50">
            <Label103View
              onExportComplete={(outFileName) => {
                handleAutoFinishDownload(
                  outFileName,
                  'Pemformatan & ekspor Label Undangan 103 selesai'
                );
              }}
            />
          </div>
        ) : tool.id === 'gabung-1' || tool.url === 'internal://gabung-file' ? (
          <div key={iframeKey} className="w-full h-full overflow-y-auto bg-slate-900">
            <GabungFileApp
              onExportComplete={(outFileName) => {
                handleAutoFinishDownload(
                  outFileName,
                  'Penggabungan berkas scan & lampiran skripsi Word (.docx) selesai'
                );
              }}
            />
          </div>
        ) : (
          <iframe
            key={iframeKey}
            id="module-embed-view"
            src={tool.url}
            title={tool.title}
            className="w-full h-full border-0 bg-white"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; camera; microphone"
            allowFullScreen
            onLoad={() => {
              setIsLoading(false);
              addLog('info', 'Antarmuka generator berhasil terhubung dan siap digunakan.');
            }}
          />
        )}

        {/* 2-Minute Inactivity / Completion Check Notification Modal */}
        {showTwoMinuteNotice && !hasTriggeredFinishRef.current && (
          <div className="absolute inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-[#0c1220] border-2 border-emerald-500/60 rounded-3xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/40 shadow-lg shadow-emerald-500/20">
                  <Clock className="w-6 h-6 text-emerald-400 animate-pulse" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white leading-snug">
                      Pemberitahuan Waktu Pengerjaan
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold shrink-0">
                      2 Menit
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Anda telah berada di halaman modul selama sekitar 2 menit.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/80 border border-emerald-500/30 text-xs text-slate-200 space-y-2.5 shadow-inner">
                <p className="text-sm text-slate-100 font-semibold leading-relaxed">
                  Apakah kamu sudah selesai dalam proses pembuatan <span className="text-emerald-300 font-bold">{tool.title}</span>?
                </p>
                <p className="text-slate-300 text-xs leading-relaxed">
                  Kalau sudah selesai, silakan klik tombol <strong>"Sudah Selesai"</strong> di bawah. Namun jika masih dalam proses penyusunan, silakan klik <strong>"Belum Selesai (Lanjut Pengerjaan)"</strong>.
                </p>
                <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-300 text-[11px] flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Pengingat: Jika pengerjaan lewat dari <strong>5 menit</strong>, pemrosesan file akan otomatis dianggap selesai.</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowTwoMinuteNotice(false);
                    setHasDismissedTwoMinuteNotice(true);
                    addLog('action', 'Pengguna memilih belum selesai (melanjutkan pengerjaan setelah notif 2 menit).');
                  }}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-colors cursor-pointer text-center"
                >
                  Belum Selesai (Lanjut Pengerjaan)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowTwoMinuteNotice(false);
                    handleAutoFinishDownload(
                      'Pembuatan Selesai',
                      'Dikonfirmasi selesai oleh pengguna pada notifikasi 2 menit'
                    );
                  }}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-extrabold transition-all shadow-lg shadow-emerald-600/30 cursor-pointer flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Sudah Selesai (Klik Selesai)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 5-Minute Non-Blocking Notification Banner: User Tetap Bisa Mengedit */}
        {showFiveMinuteTimeoutToast && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-40 max-w-lg w-[calc(100%-2rem)] bg-slate-900/95 backdrop-blur-md border-2 border-blue-500/70 rounded-2xl p-4 shadow-2xl shadow-blue-950/70 animate-in slide-in-from-top-4 duration-300">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/40 shadow-md">
                <FileCheck className="w-5 h-5 text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-white leading-snug">
                    Batas Waktu 5 Menit Terlewati
                  </h4>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold shrink-0">
                    Proses Selesai (1x Kuota)
                  </span>
                </div>

                <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                  Batas waktu pengerjaan 5 menit telah tercapai. Pemrosesan file naskah <strong className="text-blue-300">{tool.title}</strong> otomatis <strong className="text-emerald-300">telah dianggap selesai</strong> dan kuota 1x pemakaian telah resmi dicatat.
                </p>

                <div className="mt-2 p-2.5 rounded-xl bg-blue-950/50 border border-blue-500/30 text-[11px] text-blue-200 leading-relaxed flex items-center gap-2">
                  <Info className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>
                    <strong>Anda tetap bisa mengedit</strong> naskah di halaman ini sesuka Anda. Tombol kembali telah dinonaktifkan.
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setShowFiveMinuteTimeoutToast(false)}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-blue-600/30 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>Lanjutkan Mengedit di Halaman Ini</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Blocked Back Notice: User Tidak Bisa Klik Kembali Setelah 5 Menit */}
        {showBlockedBackNotice && (
          <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-md bg-[#0c1220] border-2 border-amber-500/60 rounded-3xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/40 shadow-lg shadow-amber-500/20">
                  <Lock className="w-6 h-6 text-amber-400 animate-pulse" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-white leading-snug">
                    Tidak Bisa Klik Kembali
                  </h3>
                  <p className="text-xs text-amber-300 font-semibold mt-0.5">
                    Waktu 5 Menit Telah Lewat
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/90 border border-amber-500/40 text-xs text-slate-200 space-y-3 shadow-inner">
                <p className="text-sm text-amber-200 font-bold leading-relaxed">
                  Proses pembuatan {tool.title} sudah dianggap selesai resmi oleh sistem.
                </p>
                <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs leading-relaxed">
                  ✓ <strong>Kuota 1x pemakaian telah tercatat</strong> dan tidak dapat dikembalikan atau diulang.
                </div>
                <p className="text-slate-300 text-xs leading-relaxed">
                  Tombol kembali tidak dapat diklik. Anda dipersilakan untuk <strong>tetap melanjutkan pengeditan naskah</strong> di halaman link ini sampai selesai.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBlockedBackNotice(false)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-blue-600/30 cursor-pointer text-center"
                >
                  Tetap di Halaman (Lanjut Mengedit)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowBlockedBackNotice(false);
                    onClose();
                  }}
                  className="w-full sm:w-auto px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-[11px] font-medium transition-colors cursor-pointer text-center"
                  title="Gunakan hanya jika Anda sudah benar-benar selesai mengetik/mengedit dan ingin menutup modul"
                >
                  Sudah Selesai Mengedit & Ingin Tutup
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Exit Guard Confirmation Modal: User Tidak Bisa Klik Kembali Tanpa Konfirmasi */}
        {showExitAlert && (
          <div className="absolute inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-md bg-[#0c1220] border-2 border-amber-500/60 rounded-3xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/40 shadow-lg shadow-amber-500/20">
                  <AlertTriangle className="w-6 h-6 text-amber-400 animate-pulse" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-white leading-snug">
                    Konfirmasi Keluar Modul
                  </h3>
                  <p className="text-xs text-amber-300 font-semibold mt-0.5">
                    Periksa status proses pembuatan dokumen
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/90 border border-amber-500/40 text-xs text-slate-200 space-y-3 shadow-inner">
                <p className="text-sm text-amber-200 font-bold leading-relaxed">
                  Apakah anda sudah selesai dalam proses pembuatan {tool.title}?
                </p>
                <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-red-200 text-xs leading-relaxed font-medium">
                  Soalnya jika belum selesai kamu klik kembali maka di hitung sudah selesai, jadi kalau masih belum selesai jangan klik kembali.
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Waktu pengerjaan saat ini: <strong className="text-white">{Math.floor(activeSeconds / 60)} menit {activeSeconds % 60} detik</strong> (batas maksimal pengerjaan 5 menit).
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowExitAlert(false)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-blue-600/30 cursor-pointer text-center"
                >
                  Belum Selesai (Jangan Klik Kembali)
                </button>
                <button
                  type="button"
                  onClick={handleConfirmExitAndComplete}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-colors cursor-pointer text-center"
                >
                  Sudah Selesai (Kembali ke Menu)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
