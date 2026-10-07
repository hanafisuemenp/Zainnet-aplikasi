/**
 * Permanent IndexedDB File Storage for uploaded student theses & manuscripts.
 * Guarantees uploaded files are never lost even if server restarts or 30-minute Cloud Run timeouts occur.
 */

const DB_NAME = 'ZainnetNotaStorage';
const DB_VERSION = 1;
const STORE_NAME = 'uploaded_files';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export interface StoredFileRecord {
  id: string; // e.g. "orderId_filename" or "filename"
  orderId?: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
  blob: Blob;
  dataUrl?: string;
}

export async function saveFileToPermanentStorage(
  id: string,
  file: File | Blob,
  metadata: { name: string; type: string; size: number; orderId?: string; uploadedAt?: string; dataUrl?: string }
): Promise<boolean> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const record: StoredFileRecord = {
      id,
      orderId: metadata.orderId,
      name: metadata.name,
      type: metadata.type,
      size: metadata.size,
      uploadedAt: metadata.uploadedAt || new Date().toISOString(),
      blob: file instanceof Blob ? file : new Blob([file], { type: metadata.type }),
      dataUrl: metadata.dataUrl,
    };

    await new Promise<void>((resolve, reject) => {
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    return true;
  } catch (err) {
    console.warn('Could not save to IndexedDB permanent storage:', err);
    return false;
  }
}

export async function getFileFromPermanentStorage(id: string): Promise<StoredFileRecord | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    return new Promise<StoredFileRecord | null>((resolve) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function getAllStoredFiles(): Promise<StoredFileRecord[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    return new Promise<StoredFileRecord[]>((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}
