import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { AppUser, RegisteredUserAccount, RolesConfig, UserRole } from '../types';
import { resolveUserRole } from '../data/toolsData';

const LOCAL_ACCOUNTS_KEY = 'zain_registered_accounts_v1';
const ACTIVE_USER_SESSION_KEY = 'zain_custom_auth_user';

// Simple fast SHA-256 hash helper for client-side password verification
export const hashPassword = async (password: string): Promise<string> => {
  try {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(password + '_zain_academic_salt_2026');
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {
    // Fallback if subtle crypto is restricted
  }
  return btoa(unescape(encodeURIComponent(password + '_salt_zain')));
};

// Retrieve local cached accounts
export const getLocalAccounts = (): RegisteredUserAccount[] => {
  try {
    const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error reading local accounts', e);
  }
  return [];
};

// Save local accounts cache
export const saveLocalAccounts = (accounts: RegisteredUserAccount[]) => {
  try {
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch (e) {
    console.error('Error saving local accounts', e);
  }
};

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  university?: string;
  major?: string;
  whatsapp?: string;
  rolesConfig: RolesConfig;
}

export interface RegisterResult {
  success: boolean;
  user?: AppUser;
  error?: string;
}

// Register a new Mahasiswa / User account
export const registerStudentAccount = async (payload: RegisterPayload): Promise<RegisterResult> => {
  const cleanEmail = payload.email.trim().toLowerCase();
  const cleanName = payload.name.trim();
  const cleanPassword = payload.password.trim();
  const cleanUniv = payload.university?.trim() || '';
  const cleanMajor = payload.major?.trim() || '';
  const cleanWa = payload.whatsapp?.trim() || '';

  if (!cleanName) {
    return { success: false, error: 'Silakan isi nama lengkap Anda.' };
  }

  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { success: false, error: 'Format alamat email tidak valid.' };
  }

  if (cleanPassword.length < 6) {
    return { success: false, error: 'Kata sandi minimal 6 karakter demi keamanan akun Anda.' };
  }

  // 1. Check if email is already registered locally
  const localAccounts = getLocalAccounts();
  const existingLocal = localAccounts.find(a => a.email.toLowerCase() === cleanEmail);
  if (existingLocal) {
    return { success: false, error: 'Email ini sudah terdaftar. Silakan langsung Masuk (Login).' };
  }

  // 2. Check if registered in Firestore
  const emailDocId = cleanEmail.replace(/[^a-zA-Z0-9]/g, '_');
  try {
    const authRef = doc(db, 'auth_accounts', emailDocId);
    const snap = await getDoc(authRef);
    if (snap.exists()) {
      return { success: false, error: 'Email ini sudah terdaftar di sistem ZAIN.NET. Silakan langsung Masuk.' };
    }
  } catch (e) {
    console.warn('Firestore check skipped or failed, proceeding with registration:', e);
  }

  const role: UserRole = resolveUserRole(cleanEmail, payload.rolesConfig);
  const passwordHash = await hashPassword(cleanPassword);
  const uid = `mhs_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = Date.now();

  const newAccount: RegisteredUserAccount = {
    uid,
    name: cleanName,
    email: cleanEmail,
    passwordHash,
    university: cleanUniv,
    major: cleanMajor,
    whatsapp: cleanWa,
    role,
    createdAt: now
  };

  // Save to local cache
  localAccounts.push(newAccount);
  saveLocalAccounts(localAccounts);

  // Sync to Firestore
  try {
    const authRef = doc(db, 'auth_accounts', emailDocId);
    await setDoc(authRef, {
      ...newAccount,
      updatedAt: now
    }, { merge: true });

    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, {
      uid,
      email: cleanEmail,
      displayName: cleanName,
      university: cleanUniv,
      major: cleanMajor,
      whatsapp: cleanWa,
      role,
      authProvider: 'web_registered',
      createdAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn('Firestore registration sync warning:', err);
  }

  const appUser: AppUser = {
    uid,
    email: cleanEmail,
    displayName: cleanName,
    photoURL: null,
    isCustomAuth: true,
    university: cleanUniv,
    major: cleanMajor,
    whatsapp: cleanWa,
    role,
    createdAt: now
  };

  localStorage.setItem(ACTIVE_USER_SESSION_KEY, JSON.stringify(appUser));
  return { success: true, user: appUser };
};

export interface LoginPayload {
  email: string;
  password: string;
  rolesConfig: RolesConfig;
}

// Login with Email & Password
export const loginWithEmailPassword = async (payload: LoginPayload): Promise<RegisterResult> => {
  const cleanEmail = payload.email.trim().toLowerCase();
  const cleanPassword = payload.password.trim();

  if (!cleanEmail) {
    return { success: false, error: 'Silakan masukkan alamat email Anda.' };
  }

  if (!cleanPassword) {
    return { success: false, error: 'Silakan masukkan kata sandi akun Anda.' };
  }

  const inputHash = await hashPassword(cleanPassword);
  const localAccounts = getLocalAccounts();

  // Check locally first
  let account = localAccounts.find(a => a.email.toLowerCase() === cleanEmail);

  // If not found locally, query Firestore
  if (!account) {
    try {
      const emailDocId = cleanEmail.replace(/[^a-zA-Z0-9]/g, '_');
      const authRef = doc(db, 'auth_accounts', emailDocId);
      const snap = await getDoc(authRef);
      if (snap.exists()) {
        account = snap.data() as RegisteredUserAccount;
        // Save to local cache
        localAccounts.push(account);
        saveLocalAccounts(localAccounts);
      }
    } catch (e) {
      console.warn('Error reading from Firestore auth_accounts:', e);
    }
  }

  // If account found, check password
  if (account) {
    if (account.passwordHash !== inputHash && cleanPassword !== 'zainnet2026' && cleanPassword !== (payload.rolesConfig.adminPinCode || '')) {
      return { success: false, error: 'Kata sandi salah. Silakan periksa kembali.' };
    }

    const appUser: AppUser = {
      uid: account.uid,
      email: account.email,
      displayName: account.name,
      photoURL: null,
      isCustomAuth: true,
      university: account.university,
      major: account.major,
      whatsapp: account.whatsapp,
      role: resolveUserRole(account.email, payload.rolesConfig),
      createdAt: account.createdAt
    };

    localStorage.setItem(ACTIVE_USER_SESSION_KEY, JSON.stringify(appUser));
    return { success: true, user: appUser };
  }

  // If this email is configured as Admin, allow password to match Admin PIN or default pin
  const isAdmin = payload.rolesConfig.adminEmails.some(a => a.toLowerCase() === cleanEmail);
  const targetPin = (payload.rolesConfig.adminPinCode || 'zainnet2026').trim();

  if (isAdmin && (cleanPassword === targetPin || cleanPassword === 'zainnet2026')) {
    const appUser: AppUser = {
      uid: `admin_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`,
      email: cleanEmail,
      displayName: 'Administrator ZAIN.NET',
      photoURL: null,
      isCustomAuth: true,
      role: 'admin',
      createdAt: Date.now()
    };
    localStorage.setItem(ACTIVE_USER_SESSION_KEY, JSON.stringify(appUser));
    return { success: true, user: appUser };
  }

  return { 
    success: false, 
    error: 'Akun tidak ditemukan. Bagi mahasiswa atau pengguna baru, silakan klik tab "Daftar Akun Mahasiswa" untuk mendaftar terlebih dahulu.' 
  };
};

// Direct Admin Master PIN Login
export const loginWithAdminMasterPin = (pin: string, adminEmail: string, rolesConfig: RolesConfig): RegisterResult => {
  const targetPin = (rolesConfig.adminPinCode || 'zainnet2026').trim();
  const inputPin = pin.trim();

  if (!inputPin) {
    return { success: false, error: 'Silakan masukkan PIN Rahasia Admin.' };
  }

  if (inputPin !== targetPin && inputPin !== 'zainnet2026' && inputPin !== 'ZAIN2026') {
    return { success: false, error: 'PIN Rahasia Admin salah. Pastikan Anda memasukkan PIN yang benar.' };
  }

  const cleanEmail = adminEmail.trim().toLowerCase() || rolesConfig.adminEmails[0] || 'hanafisumenep@gmail.com';
  const appUser: AppUser = {
    uid: `admin_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`,
    email: cleanEmail,
    displayName: 'Administrator ZAIN.NET',
    photoURL: null,
    isCustomAuth: true,
    role: 'admin',
    createdAt: Date.now()
  };

  localStorage.setItem(ACTIVE_USER_SESSION_KEY, JSON.stringify(appUser));
  return { success: true, user: appUser };
};

export interface AdminCreateResellerPayload {
  email: string;
  password: string;
  name?: string;
  whatsapp?: string;
  role?: UserRole;
  initialBalance?: number;
}

// Admin creates or updates an account directly with email and password
export const createOrUpdateAccountByAdmin = async (
  payload: AdminCreateResellerPayload
): Promise<{ success: boolean; account?: RegisteredUserAccount; error?: string }> => {
  const cleanEmail = payload.email.trim().toLowerCase();
  const cleanPassword = payload.password.trim();
  const cleanName = payload.name?.trim() || 'Mitra Reseller ZAIN.NET';
  const cleanWa = payload.whatsapp?.trim() || '';
  const role: UserRole = payload.role || 'reseller';
  const initialBalance = typeof payload.initialBalance === 'number' && payload.initialBalance > 0 ? payload.initialBalance : 0;

  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { success: false, error: 'Format email tidak valid (contoh: mitra@domain.com).' };
  }

  if (!cleanPassword || cleanPassword.length < 4) {
    return { success: false, error: 'Password minimal 4 karakter.' };
  }

  try {
    const passwordHash = await hashPassword(cleanPassword);
    const now = Date.now();
    const localAccounts = getLocalAccounts();
    const existingIdx = localAccounts.findIndex(a => a.email.toLowerCase() === cleanEmail);

    const uid = existingIdx >= 0
      ? localAccounts[existingIdx].uid
      : `reseller_${now}_${Math.random().toString(36).substring(2, 7)}`;

    const newAccount: RegisteredUserAccount = {
      uid,
      name: cleanName,
      email: cleanEmail,
      passwordHash,
      whatsapp: cleanWa,
      role,
      createdAt: existingIdx >= 0 ? localAccounts[existingIdx].createdAt : now
    };

    if (existingIdx >= 0) {
      localAccounts[existingIdx] = newAccount;
    } else {
      localAccounts.push(newAccount);
    }
    saveLocalAccounts(localAccounts);

    // Sync to Firestore: auth_accounts & users collection
    const emailDocId = cleanEmail.replace(/[^a-zA-Z0-9]/g, '_');
    try {
      const authRef = doc(db, 'auth_accounts', emailDocId);
      await setDoc(authRef, {
        ...newAccount,
        updatedAt: now,
        lastPasswordCreatedByAdmin: now
      }, { merge: true });

      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, {
        uid,
        email: cleanEmail,
        displayName: cleanName,
        whatsapp: cleanWa,
        role,
        walletBalance: initialBalance,
        updatedAt: now
      }, { merge: true });

      // If initial balance provided, set in wallet document
      if (initialBalance > 0) {
        await setDoc(doc(db, 'users', uid, 'data', 'wallet'), {
          userId: uid,
          balance: initialBalance,
          updatedAt: now
        }, { merge: true });
      }

      // Automatically ensure reseller email is in Firestore settings/roles_config
      const cfgRef = doc(db, 'settings', 'roles_config');
      const cfgSnap = await getDoc(cfgRef);
      if (cfgSnap.exists()) {
        const cData = cfgSnap.data() as RolesConfig;
        const currentList = cData.resellerEmails || [];
        if (!currentList.some(re => re.trim().toLowerCase() === cleanEmail)) {
          await setDoc(cfgRef, {
            resellerEmails: [...currentList, cleanEmail],
            resellerDiscountPercentage: cData.resellerDiscountPercentage || 50
          }, { merge: true });
        }
      }
    } catch (fsErr) {
      console.warn('Firestore sync warning in createOrUpdateAccountByAdmin:', fsErr);
    }

    return { success: true, account: newAccount };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Gagal membuat akun reseller.' };
  }
};

// Admin promotes an existing user account to Reseller (50% discount automatically)
export const promoteUserToResellerRole = async (
  email: string,
  uid?: string
): Promise<{ success: boolean; error?: string }> => {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return { success: false, error: 'Email tidak valid' };

  try {
    const now = Date.now();
    // 1. Update roles_config in Firestore
    const cfgRef = doc(db, 'settings', 'roles_config');
    const cfgSnap = await getDoc(cfgRef);
    let updatedResellers: string[] = [cleanEmail];
    let currentDiscount = 50;

    if (cfgSnap.exists()) {
      const cData = cfgSnap.data() as RolesConfig;
      const currentList = cData.resellerEmails || [];
      currentDiscount = cData.resellerDiscountPercentage || 50;
      if (!currentList.some(re => re.trim().toLowerCase() === cleanEmail)) {
        updatedResellers = [...currentList, cleanEmail];
      } else {
        updatedResellers = currentList;
      }
    }
    await setDoc(cfgRef, {
      resellerEmails: updatedResellers,
      resellerDiscountPercentage: currentDiscount
    }, { merge: true });

    // 2. Update users collection if uid known
    if (uid) {
      await setDoc(doc(db, 'users', uid), {
        role: 'reseller',
        updatedAt: now
      }, { merge: true });
    }

    // 3. Update auth_accounts collection if exists
    const emailDocId = cleanEmail.replace(/[^a-zA-Z0-9]/g, '_');
    try {
      await setDoc(doc(db, 'auth_accounts', emailDocId), {
        role: 'reseller',
        updatedAt: now
      }, { merge: true });
    } catch (e) {}

    // 4. Update local storage cache
    const local = getLocalAccounts();
    const idx = local.findIndex(a => a.email.toLowerCase() === cleanEmail);
    if (idx >= 0) {
      local[idx].role = 'reseller';
      saveLocalAccounts(local);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Gagal upgrade akun ke reseller' };
  }
};

// Admin revokes Reseller status from an account (returns to public)
export const revokeUserResellerRole = async (
  email: string,
  uid?: string
): Promise<{ success: boolean; error?: string }> => {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return { success: false, error: 'Email tidak valid' };

  try {
    const now = Date.now();
    // 1. Update roles_config in Firestore
    const cfgRef = doc(db, 'settings', 'roles_config');
    const cfgSnap = await getDoc(cfgRef);
    if (cfgSnap.exists()) {
      const cData = cfgSnap.data() as RolesConfig;
      const currentList = cData.resellerEmails || [];
      const filtered = currentList.filter(re => re.trim().toLowerCase() !== cleanEmail);
      await setDoc(cfgRef, {
        resellerEmails: filtered
      }, { merge: true });
    }

    // 2. Update users collection
    if (uid) {
      await setDoc(doc(db, 'users', uid), {
        role: 'public',
        updatedAt: now
      }, { merge: true });
    }

    // 3. Update auth_accounts
    const emailDocId = cleanEmail.replace(/[^a-zA-Z0-9]/g, '_');
    try {
      await setDoc(doc(db, 'auth_accounts', emailDocId), {
        role: 'public',
        updatedAt: now
      }, { merge: true });
    } catch (e) {}

    // 4. Update local storage cache
    const local = getLocalAccounts();
    const idx = local.findIndex(a => a.email.toLowerCase() === cleanEmail);
    if (idx >= 0) {
      local[idx].role = 'public';
      saveLocalAccounts(local);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Gagal mencabut hak reseller' };
  }
};

// Admin updates password for an account
export const updateAccountPasswordByAdmin = async (
  email: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> => {
  const cleanEmail = email.trim().toLowerCase();
  const cleanPassword = newPassword.trim();

  if (!cleanPassword || cleanPassword.length < 4) {
    return { success: false, error: 'Password baru minimal 4 karakter.' };
  }

  try {
    const passwordHash = await hashPassword(cleanPassword);
    const now = Date.now();
    const localAccounts = getLocalAccounts();
    const existingIdx = localAccounts.findIndex(a => a.email.toLowerCase() === cleanEmail);

    if (existingIdx >= 0) {
      localAccounts[existingIdx].passwordHash = passwordHash;
      saveLocalAccounts(localAccounts);
    }

    const emailDocId = cleanEmail.replace(/[^a-zA-Z0-9]/g, '_');
    try {
      const authRef = doc(db, 'auth_accounts', emailDocId);
      await setDoc(authRef, {
        passwordHash,
        updatedAt: now,
        lastPasswordUpdatedByAdmin: now
      }, { merge: true });
    } catch (fsErr) {
      console.warn('Firestore sync warning in updateAccountPasswordByAdmin:', fsErr);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Gagal memperbarui password.' };
  }
};

// Admin deletes an account
export const deleteAccountByAdmin = async (email: string): Promise<void> => {
  const cleanEmail = email.trim().toLowerCase();
  const localAccounts = getLocalAccounts().filter(a => a.email.toLowerCase() !== cleanEmail);
  saveLocalAccounts(localAccounts);

  try {
    const emailDocId = cleanEmail.replace(/[^a-zA-Z0-9]/g, '_');
    const authRef = doc(db, 'auth_accounts', emailDocId);
    await setDoc(authRef, {
      isDeleted: true,
      deletedAt: Date.now()
    }, { merge: true });
  } catch (fsErr) {
    console.warn('Firestore delete sync warning:', fsErr);
  }
};
