import { ToolItem, UserSessionRecord, UserActivityLogEntry } from '../types';

const SESSIONS_STORAGE_KEY = 'zain_user_tool_sessions_v1';

// Helper to get storage key scoped to user or guest
const getStorageKey = (userId?: string) => {
  return userId ? `${SESSIONS_STORAGE_KEY}_${userId}` : `${SESSIONS_STORAGE_KEY}_guest`;
};

// Retrieve all recorded sessions for the user
export const getAllUserSessions = (userId?: string): Record<string, UserSessionRecord> => {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Error reading user tool sessions:', e);
  }
  return {};
};

// Retrieve a specific session for a tool
export const getSessionForTool = (toolId: string, userId?: string): UserSessionRecord | null => {
  const sessions = getAllUserSessions(userId);
  return sessions[toolId] || null;
};

// Save a session record
export const saveUserSession = (session: UserSessionRecord): void => {
  try {
    const key = getStorageKey(session.userId);
    const sessions = getAllUserSessions(session.userId);
    sessions[session.toolId] = session;
    localStorage.setItem(key, JSON.stringify(sessions));

    // Also dispatch custom event for instant cross-component synchronization
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('zain_session_updated', {
        detail: { toolId: session.toolId, session }
      }));
    }
  } catch (e) {
    console.warn('Error saving user tool session:', e);
  }
};

// Record or update session as IN PROGRESS (Belum Selesai)
// Crucial: When user clicks "Kembali", session is marked in_progress. NO quota is consumed.
export const recordSessionInProgress = (
  tool: ToolItem,
  userId: string | undefined,
  currentLogs: UserActivityLogEntry[],
  activeSeconds: number,
  interactionCount: number,
  notes: string = 'Pengguna menekan Kembali. Transaksi Belum Selesai, kuota aman & dapat dilanjutkan kapan saja.'
): UserSessionRecord => {
  const existing = getSessionForTool(tool.id, userId);
  const now = Date.now();
  const timeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const updatedLogs: UserActivityLogEntry[] = [
    ...currentLogs,
    {
      id: `log-pause-${now}`,
      time: timeStr,
      type: 'status',
      message: `[STATUS: BELUM SELESAI] ${notes}`
    }
  ];

  const session: UserSessionRecord = {
    id: existing?.id || `sess-${tool.id}-${now}`,
    toolId: tool.id,
    toolTitle: tool.title,
    categoryId: tool.categoryId,
    userId: userId || 'guest',
    status: 'in_progress', // Belum Selesai
    startedAt: existing?.startedAt || now,
    lastActiveAt: now,
    activeSeconds: Math.max(existing?.activeSeconds || 0, activeSeconds),
    interactionCount: Math.max(existing?.interactionCount || 0, interactionCount),
    notes,
    logs: updatedLogs
  };

  saveUserSession(session);
  return session;
};

// Record session as COMPLETED (Selesai Transaksi)
// Crucial: Triggered ONLY when file download is detected or clicked!
export const recordSessionCompleted = (
  tool: ToolItem,
  userId: string | undefined,
  downloadInfo: { fileName: string; reason: string },
  currentLogs: UserActivityLogEntry[],
  activeSeconds: number
): UserSessionRecord => {
  const existing = getSessionForTool(tool.id, userId);
  const now = Date.now();
  const timeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const updatedLogs: UserActivityLogEntry[] = [
    ...currentLogs,
    {
      id: `log-dl-${now}`,
      time: timeStr,
      type: 'download',
      message: `[BERKAS DIUNDUH] "${downloadInfo.fileName}" berhasil diunduh (${downloadInfo.reason}).`
    },
    {
      id: `log-done-${now + 1}`,
      time: timeStr,
      type: 'complete',
      message: `[STATUS: SELESAI TRANSAKSI] Berkas telah diunduh. Transaksi resmi dinyatakan selesai dan kuota 1x dicatat.`
    }
  ];

  const session: UserSessionRecord = {
    id: existing?.id || `sess-${tool.id}-${now}`,
    toolId: tool.id,
    toolTitle: tool.title,
    categoryId: tool.categoryId,
    userId: userId || 'guest',
    status: 'completed', // Selesai Transaksi
    startedAt: existing?.startedAt || now,
    lastActiveAt: now,
    completedAt: now,
    activeSeconds: Math.max(existing?.activeSeconds || 0, activeSeconds),
    interactionCount: (existing?.interactionCount || 0) + 1,
    downloadInfo: {
      fileName: downloadInfo.fileName,
      downloadedAt: now,
      reason: downloadInfo.reason
    },
    notes: `Transaksi selesai resmi saat berkas "${downloadInfo.fileName}" diunduh.`,
    logs: updatedLogs
  };

  saveUserSession(session);
  return session;
};
