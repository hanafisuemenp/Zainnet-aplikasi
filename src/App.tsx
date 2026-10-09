import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  onAuthStateChanged, 
  logoutUser, 
  auth, 
  db, 
  signInWithCredential,
  GoogleAuthProvider,
  type User 
} from './firebase';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  getDocs, 
  deleteDoc,
  onSnapshot
} from 'firebase/firestore';
import { 
  categoriesData, 
  defaultPaymentConfig, 
  defaultRolesConfig, 
  resolveUserRole, 
  defaultCustomPrices, 
  applyCustomPricesToCategories 
} from './data/toolsData';
import { initialSampleDocuments } from './data/sampleDocuments';
import { 
  ToolCategory, 
  ToolItem, 
  UserPurchase, 
  UserQuotas, 
  PaymentConfig, 
  UserRole, 
  RolesConfig, 
  UserLoyalty, 
  defaultLoyalty,
  CustomPricesConfig,
  UserDocumentItem,
  ResellerTrials,
  RESELLER_MAX_FREE_TRIALS,
  AppUser,
  DeviceTrialRecord,
  FreeTrialStatus,
  DailyTrafficStat
} from './types';
import { recordWebTrafficVisit, subscribeToTodayTraffic } from './utils/trafficTracker';
import { TrafficStatsModal } from './components/TrafficStatsModal';
import { collectDeviceFingerprint } from './utils/deviceFingerprint';
import { FreeTrialClaimModal } from './components/FreeTrialClaimModal';
import { FreeTrialHomeBanner } from './components/FreeTrialHomeBanner';
import { LoginView } from './components/LoginView';
import { Navbar } from './components/Navbar';
import { CategorySection } from './components/CategorySection';
import { ToolViewerModal } from './components/ToolViewerModal';
import { UserProfileModal } from './components/UserProfileModal';
import { RoleManagementModal } from './components/RoleManagementModal';
import { ManualQrisPaymentModal, CheckoutTarget } from './components/ManualQrisPaymentModal';
import { ManualQrisSettingsModal } from './components/ManualQrisSettingsModal';
import { AdminVerificationModal } from './components/AdminVerificationModal';
import { AdminPinModal } from './components/AdminPinModal';
import { WhatsAppSupportWidget } from './components/WhatsAppSupportWidget';
import { LoyaltyBanner } from './components/LoyaltyBanner';
import { HeroSection } from './components/HeroSection';
import { ModuleGrid } from './components/ModuleGrid';
import { TrustBadges } from './components/TrustBadges';
import { Footer } from './components/Footer';
import { RewardCelebrationModal } from './components/RewardCelebrationModal';
import { AdminAnalyticsModal } from './components/AdminAnalyticsModal';
import { PriceManagementModal } from './components/PriceManagementModal';
import { DocumentArchiveModal } from './components/DocumentArchiveModal';
import { TopUpModal } from './components/TopUpModal';
import { WalletHomeBanner } from './components/WalletHomeBanner';
import { AuthBridgeView } from './components/AuthBridgeView';
import { NotaHardcover } from './components/NotaHardcover';
import GabungFileApp from './gabungFile/App';
import { MakalahPost, AgcPost } from './types';
import { MakalahBlogView } from './components/MakalahBlogView';
import { AgcBlogView } from './components/AgcBlogView';
import { TemplateJurnalManager } from './components/TemplateJurnalManager';
import { MakalahBatchUploadModal } from './components/MakalahBatchUploadModal';
import { AgcAutoPostModal } from './components/AgcAutoPostModal';
import { fetchMakalahPosts, deleteMakalahPost, fetchMakalahBySlug } from './utils/makalahService';
import { fetchAgcPosts } from './utils/agcService';
import { 
  Sparkles, 
  FileText, 
  Scissors, 
  Hash, 
  BookOpen, 
  Star,
  Search,
  ExternalLink,
  Layers,
  ArrowRight,
  ShieldCheck,
  Lock,
  Unlock,
  QrCode,
  Flame,
  Zap,
  CheckCircle2,
  Building2,
  MessageCircle,
  HelpCircle,
  Clock,
  Crown,
  Users,
  Gift,
  BarChart3,
  Tag,
  FolderArchive,
  Wallet,
  AlertTriangle,
  KeyRound,
  LogOut,
  UserCheck,
  SlidersHorizontal,
  FileCheck
} from 'lucide-react';

export default function App() {
  // If navigating to /auth-bridge or ?auth_bridge=1, render the isolated Auth Bridge component
  const searchParams = new URLSearchParams(window.location.search);
  const isAuthBridge = window.location.pathname === '/auth-bridge' || searchParams.get('auth_bridge') === '1' || searchParams.has('auth_bridge');
  if (isAuthBridge) {
    return <AuthBridgeView />;
  }

  const isNotaHardcover = window.location.pathname === '/notahardcover';
  if (isNotaHardcover) {
    return <NotaHardcover />;
  }

  const isGabungFile = window.location.pathname === '/gabung-file' || window.location.pathname === '/gabung';
  if (isGabungFile) {
    return <GabungFileApp />;
  }

  const [user, setUser] = useState<User | AppUser | null>(() => {
    const savedCustom = localStorage.getItem('zain_custom_auth_user');
    if (savedCustom) {
      try {
        return JSON.parse(savedCustom);
      } catch (e) {}
    }
    return null;
  });
  const [authLoading, setAuthLoading] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      if (localStorage.getItem('zain_guest_session') === 'true' || localStorage.getItem('zain_custom_auth_user')) {
        return false;
      }
    }
    return true;
  });
  const [isGuest, setIsGuest] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('zain_guest_session') === 'true';
    }
    return false;
  });
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [showPinLoginModal, setShowPinLoginModal] = useState<boolean>(false);
  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showRoleManagementModal, setShowRoleManagementModal] = useState<boolean>(false);
  const [showRewardCelebration, setShowRewardCelebration] = useState<boolean>(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState<boolean>(false);
  const [showPriceManagementModal, setShowPriceManagementModal] = useState<boolean>(false);
  const [showDocumentArchiveModal, setShowDocumentArchiveModal] = useState<boolean>(false);
  const [showVerificationModal, setShowVerificationModal] = useState<boolean>(false);
  const [showTopUpModal, setShowTopUpModal] = useState<boolean>(false);
  const [topUpPresetAmount, setTopUpPresetAmount] = useState<number | undefined>(undefined);
  const [showTrafficStatsModal, setShowTrafficStatsModal] = useState<boolean>(false);
  const [todayTraffic, setTodayTraffic] = useState<DailyTrafficStat | null>(null);

  // Makalah, AGC Blog & Template Jurnal State
  const [currentView, setCurrentView] = useState<'tools' | 'blog' | 'agc_blog' | 'template_jurnal'>(() => {
    if (typeof window !== 'undefined') {
      const p = window.location.pathname;
      const s = new URLSearchParams(window.location.search);
      if (p.startsWith('/template') || s.get('view') === 'template' || s.get('view') === 'template_jurnal') {
        return 'template_jurnal';
      }
      if (p.startsWith('/agc') || s.get('view') === 'agc' || s.get('view') === 'agc_blog') {
        return 'agc_blog';
      }
      if (
        p.startsWith('/makalah') || 
        p.startsWith('/blog') || 
        s.get('view') === 'blog' || 
        s.has('makalah') || 
        s.has('post')
      ) {
        return 'blog';
      }
    }
    return 'tools';
  });
  const [makalahPosts, setMakalahPosts] = useState<MakalahPost[]>([]);
  const [agcPosts, setAgcPosts] = useState<AgcPost[]>([]);
  const [showAgcAutoPostModal, setShowAgcAutoPostModal] = useState<boolean>(false);
  const [selectedMakalah, setSelectedMakalah] = useState<MakalahPost | null>(null);
  const [showBatchUploadModal, setShowBatchUploadModal] = useState<boolean>(false);
  const [showMakalahAdmin, setShowMakalahAdmin] = useState<boolean>(false);

  // 1x Free Trial Anti-Abuse (Hardware, Windows & IP Lock) State
  const [freeTrialStatus, setFreeTrialStatus] = useState<FreeTrialStatus | null>(null);
  const [isCheckingTrialEligibility, setIsCheckingTrialEligibility] = useState<boolean>(true);
  const [freeTrialTargetTool, setFreeTrialTargetTool] = useState<ToolItem | null>(null);
  const [showFreeTrialModal, setShowFreeTrialModal] = useState<boolean>(false);

  // User Wallet Balance (Saldo Akun)
  const [userWalletBalance, setUserWalletBalance] = useState<number>(0);

  // Loyalty Program State: Buy 3 get 1 free
  const [loyalty, setLoyalty] = useState<UserLoyalty>(defaultLoyalty);

  // Dynamic Custom Prices state (Admin editable)
  const [customPrices, setCustomPrices] = useState<CustomPricesConfig>(() => {
    const saved = localStorage.getItem('zain_custom_prices');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const merged = { 
          ...defaultCustomPrices, 
          ...parsed,
          itemPrices: {
            ...defaultCustomPrices.itemPrices,
            ...(parsed.itemPrices || {}),
            'ref-1': (parsed.itemPrices?.['ref-1'] === 20000 || !parsed.itemPrices?.['ref-1']) ? 2000 : parsed.itemPrices['ref-1']
          },
          categoryPrices: {
            ...defaultCustomPrices.categoryPrices,
            ...(parsed.categoryPrices || {}),
            7: (parsed.categoryPrices?.[7] === 20000 || !parsed.categoryPrices?.[7]) ? 2000 : parsed.categoryPrices[7]
          }
        };
        return merged;
      } catch (e) {}
    }
    return defaultCustomPrices;
  });

  // User Document Archive state
  const [documents, setDocuments] = useState<UserDocumentItem[]>(() => {
    const saved = localStorage.getItem('zain_user_documents');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return initialSampleDocuments;
  });

  // Payment & Config state (Manual QRIS & Bank Transfer)
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig>(() => {
    const saved = localStorage.getItem('zain_manual_qris_config') || localStorage.getItem('zain_midtrans_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { 
          ...defaultPaymentConfig, 
          ...parsed,
          bankAccounts: (parsed.bankAccounts && parsed.bankAccounts.length > 0) ? parsed.bankAccounts : defaultPaymentConfig.bankAccounts,
          // Always lock the official merchant, NMID and QRIS payload string
          merchantName: defaultPaymentConfig.merchantName,
          nmid: defaultPaymentConfig.nmid,
          terminalId: defaultPaymentConfig.terminalId,
          printedBy: defaultPaymentConfig.printedBy,
          qrisString: defaultPaymentConfig.qrisString
        };
      } catch (e) {}
    }
    return defaultPaymentConfig;
  });

  // 3-Tier Roles Configuration (Admin, Reseller, Public)
  const [rolesConfig, setRolesConfig] = useState<RolesConfig>(() => {
    const saved = localStorage.getItem('zain_roles_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const mergedAdmin = Array.from(new Set([...defaultRolesConfig.adminEmails, ...(parsed.adminEmails || [])]));
        const mergedReseller = Array.from(new Set([...defaultRolesConfig.resellerEmails, ...(parsed.resellerEmails || [])]));
        return { 
          ...defaultRolesConfig, 
          ...parsed,
          adminEmails: mergedAdmin,
          resellerEmails: mergedReseller
        };
      } catch (e) {}
    }
    return defaultRolesConfig;
  });

  // Derived user role (admin | reseller | public)
  const userRole: UserRole = useMemo(() => {
    return resolveUserRole(user?.email, rolesConfig);
  }, [user?.email, rolesConfig]);

  // Apply custom prices dynamically to categories
  const categories: ToolCategory[] = useMemo(() => {
    return applyCustomPricesToCategories(categoriesData, customPrices);
  }, [customPrices]);

  // Pay-per-use quotas state: { [toolId: string]: number of available creation sessions }
  const [userQuotas, setUserQuotas] = useState<UserQuotas>({});
  const [purchases, setPurchases] = useState<UserPurchase[]>([]);
  const [allPurchasesForAdmin, setAllPurchasesForAdmin] = useState<UserPurchase[]>([]);
  const processedPurchaseIdsRef = useRef<Set<string>>(new Set());

  // Reseller Free Trial state: { [toolId: string]: number of used trial sessions (0-3) }
  const [resellerTrials, setResellerTrials] = useState<ResellerTrials>({});

  // Checkout modal target
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutTarget | null>(null);

  // Accordion open state (id of open section, or null — default null so all menus 1-8 start closed)
  const [openSectionId, setOpenSectionId] = useState<number | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<number | 'all' | 'favorites'>('all');
  const [filterFavoritesOnly, setFilterFavoritesOnly] = useState<boolean>(false);

  // Favorites state
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Active tool opened in iframe modal
  const [activeTool, setActiveTool] = useState<ToolItem | null>(null);

  // Handle bridge redirect sign-in callback if redirected
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authIdToken = params.get('auth_id_token');
    const authAccessToken = params.get('auth_access_token');

    if (authIdToken) {
      params.delete('auth_id_token');
      params.delete('auth_access_token');
      const cleanSearch = params.toString();
      const cleanUrl = window.location.pathname + (cleanSearch ? `?${cleanSearch}` : '') + window.location.hash;
      window.history.replaceState({}, '', cleanUrl);

      const credential = GoogleAuthProvider.credential(authIdToken, authAccessToken || undefined);
      signInWithCredential(auth, credential).catch((err) => {
        console.error('Failed to sign in from bridge redirect token:', err);
      });
    }
  }, []);

  // Realtime subscription for global transactions (for Admin verification & real-time badge count)
  useEffect(() => {
    try {
      const trxCol = collection(db, 'transactions');
      const unsubscribeTrx = onSnapshot(trxCol, (snapshot) => {
        const globalPurchList: UserPurchase[] = [];
        snapshot.forEach((d) => {
          globalPurchList.push(d.data() as UserPurchase);
        });
        globalPurchList.sort((a, b) => b.purchasedAt - a.purchasedAt);
        setAllPurchasesForAdmin(globalPurchList);
      }, (err) => {
        console.warn('Realtime transactions snapshot listener error:', err);
      });

      return () => unsubscribeTrx();
    } catch (e) {
      console.warn('Error establishing transactions snapshot:', e);
    }
  }, []);

  // Web Traffic Tracking & Live Today's Traffic Listener (Page Views & User Views per Day)
  useEffect(() => {
    recordWebTrafficVisit(user).catch((err) => {
      console.warn('Traffic visit record warning:', err);
    });

    const unsubscribeTraffic = subscribeToTodayTraffic((stat) => {
      setTodayTraffic(stat);
    });

    return () => unsubscribeTraffic();
  }, [user?.uid]);

  // Realtime subscription for current user's wallet balance
  useEffect(() => {
    if (!user) return;
    try {
      const walletRef = doc(db, 'users', user.uid, 'data', 'wallet');
      const unsubscribeWallet = onSnapshot(walletRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (typeof data.balance === 'number') {
            setUserWalletBalance(data.balance);
            localStorage.setItem(`zain_wallet_${user.uid}`, data.balance.toString());
          }
        }
      }, (err) => {
        console.warn('Realtime wallet subscription warning:', err);
      });

      return () => unsubscribeWallet();
    } catch (err) {
      console.warn('Error subscribing to wallet:', err);
    }
  }, [user?.uid]);

  // Realtime subscription for current user's quotas
  useEffect(() => {
    if (!user) return;
    try {
      const quotaRef = doc(db, 'users', user.uid, 'data', 'quotas');
      const unsubscribeQuota = onSnapshot(quotaRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserQuotas;
          if (data && typeof data === 'object') {
            setUserQuotas(data);
            localStorage.setItem(`zain_quotas_${user.uid}`, JSON.stringify(data));
          }
        }
      }, (err) => {
        console.warn('Realtime quota subscription warning:', err);
      });

      return () => unsubscribeQuota();
    } catch (err) {
      console.warn('Error subscribing to quotas:', err);
    }
  }, [user?.uid]);

  // Load global roles config, dynamic prices, QRIS config & listen to Auth state
  useEffect(() => {
    // Safety timeout: never hang on loading screen for more than 1.2s under slow cellular connections
    const authSafetyTimer = setTimeout(() => {
      setAuthLoading(false);
    }, 1200);

    // Load remote roles, prices, and QRIS config from Firestore & bootstrap defaults if fresh
    const loadRemoteConfigs = async () => {
      try {
        const rolesSnap = await getDoc(doc(db, 'settings', 'roles_config'));
        if (rolesSnap.exists()) {
          const remoteRoles = rolesSnap.data() as RolesConfig;
          const mergedConfig: RolesConfig = {
            ...defaultRolesConfig,
            ...remoteRoles,
            adminEmails: Array.from(new Set([...defaultRolesConfig.adminEmails, ...(remoteRoles.adminEmails || [])])),
            resellerEmails: Array.from(new Set([...defaultRolesConfig.resellerEmails, ...(remoteRoles.resellerEmails || [])])),
          };
          setRolesConfig(mergedConfig);
          localStorage.setItem('zain_roles_config', JSON.stringify(mergedConfig));
        } else {
          // Initialize remote roles in Firestore
          await setDoc(doc(db, 'settings', 'roles_config'), defaultRolesConfig, { merge: true });
        }

        const pricesSnap = await getDoc(doc(db, 'settings', 'prices'));
        if (pricesSnap.exists()) {
          const remotePrices = pricesSnap.data() as CustomPricesConfig;
          const mergedPrices = { 
            ...defaultCustomPrices, 
            ...remotePrices,
            itemPrices: {
              ...defaultCustomPrices.itemPrices,
              ...(remotePrices.itemPrices || {}),
              'ref-1': (remotePrices.itemPrices?.['ref-1'] === 20000 || !remotePrices.itemPrices?.['ref-1']) ? 2000 : remotePrices.itemPrices['ref-1']
            },
            categoryPrices: {
              ...defaultCustomPrices.categoryPrices,
              ...(remotePrices.categoryPrices || {}),
              7: (remotePrices.categoryPrices?.[7] === 20000 || !remotePrices.categoryPrices?.[7]) ? 2000 : remotePrices.categoryPrices[7]
            }
          };
          setCustomPrices(mergedPrices);
          localStorage.setItem('zain_custom_prices', JSON.stringify(mergedPrices));
          // If remote had outdated 20000 price for ref-1 or category 7, sync new 2000 price to Firestore
          if (remotePrices.itemPrices?.['ref-1'] === 20000 || remotePrices.categoryPrices?.[7] === 20000) {
            await setDoc(doc(db, 'settings', 'prices'), mergedPrices, { merge: true });
          }
        } else {
          // Initialize remote prices in Firestore
          await setDoc(doc(db, 'settings', 'prices'), defaultCustomPrices, { merge: true });
        }

        const qrisSnap = await getDoc(doc(db, 'settings', 'qris_config'));
        if (qrisSnap.exists()) {
          const remoteQris = qrisSnap.data() as PaymentConfig;
          const mergedQris = { 
            ...defaultPaymentConfig, 
            ...remoteQris,
            enableUniqueCode: false,
            bankAccounts: (remoteQris.bankAccounts && remoteQris.bankAccounts.length > 0) ? remoteQris.bankAccounts : defaultPaymentConfig.bankAccounts,
            merchantName: defaultPaymentConfig.merchantName,
            nmid: defaultPaymentConfig.nmid,
            terminalId: defaultPaymentConfig.terminalId,
            printedBy: defaultPaymentConfig.printedBy,
            qrisString: defaultPaymentConfig.qrisString
          };
          setPaymentConfig(mergedQris);
          localStorage.setItem('zain_manual_qris_config', JSON.stringify(mergedQris));
          // Ensure enableUniqueCode is disabled in Firestore as requested
          if (remoteQris.enableUniqueCode !== false) {
            await setDoc(doc(db, 'settings', 'qris_config'), { enableUniqueCode: false }, { merge: true });
          }
        } else {
          // Initialize remote QRIS config in Firestore
          await setDoc(doc(db, 'settings', 'qris_config'), defaultPaymentConfig, { merge: true });
        }
      } catch (err) {
        console.warn('Could not load remote settings config:', err);
      }
    };
    loadRemoteConfigs();

    // Fetch Makalah posts on mount & handle direct URL paths (/makalah/slug, /blog/slug, ?view=blog, ?makalah=slug)
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const viewParam = params.get('view');
    
    let targetMakalahSlug = params.get('makalah') || params.get('post');
    if (!targetMakalahSlug) {
      if (pathname.startsWith('/makalah/')) {
        targetMakalahSlug = decodeURIComponent(pathname.replace('/makalah/', '').replace(/\/$/, ''));
      } else if (pathname.startsWith('/blog/')) {
        targetMakalahSlug = decodeURIComponent(pathname.replace('/blog/', '').replace(/\/$/, ''));
      }
    }

    if (viewParam === 'blog' || targetMakalahSlug || pathname === '/blog' || pathname.startsWith('/makalah')) {
      setCurrentView('blog');
    }

    if (targetMakalahSlug) {
      fetchMakalahBySlug(targetMakalahSlug).then(found => {
        if (found) {
          setSelectedMakalah(found);
        }
      }).catch(console.warn);
    }

    fetchMakalahPosts().then(posts => {
      if (posts && posts.length > 0) {
        setMakalahPosts(posts);

        if (targetMakalahSlug) {
          const cleanTarget = targetMakalahSlug.trim().toLowerCase();
          const found = posts.find(p => 
            (p.slug && p.slug.toLowerCase() === cleanTarget) || 
            (p.id && p.id.toLowerCase() === cleanTarget) ||
            (p.slug && p.slug.toLowerCase().includes(cleanTarget)) ||
            (cleanTarget.includes((p.slug || '').toLowerCase()) && (p.slug || '').length > 5) ||
            p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').includes(cleanTarget)
          );
          if (found) {
            setSelectedMakalah(found);
          }
        }
      }
    }).catch(console.warn);

    // Fetch AGC posts automatically
    fetchAgcPosts().then(posts => {
      if (posts && posts.length > 0) {
        setAgcPosts(posts);
      }
    }).catch(console.warn);

    // Browser navigation (Back / Forward buttons) support for Blog & Makalah posts
    const handlePopState = () => {
      const p = window.location.pathname;
      const s = new URLSearchParams(window.location.search);

      if (p.startsWith('/agc') || s.get('view') === 'agc' || s.get('view') === 'agc_blog') {
        setCurrentView('agc_blog');
        return;
      }

      let slug = s.get('makalah') || s.get('post');
      if (!slug) {
        if (p.startsWith('/makalah/')) {
          slug = decodeURIComponent(p.replace('/makalah/', '').replace(/\/$/, ''));
        } else if (p.startsWith('/blog/')) {
          slug = decodeURIComponent(p.replace('/blog/', '').replace(/\/$/, ''));
        }
      }

      if (p.startsWith('/makalah') || p.startsWith('/blog') || s.get('view') === 'blog' || slug) {
        setCurrentView('blog');
        if (slug) {
          fetchMakalahBySlug(slug).then(post => {
            if (post) setSelectedMakalah(post);
          }).catch(console.warn);
        } else {
          setSelectedMakalah(null);
        }
      } else if (p === '/' && !s.get('view')) {
        setCurrentView('tools');
        setSelectedMakalah(null);
      }
    };

    window.addEventListener('popstate', handlePopState);

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      clearTimeout(authSafetyTimer);
      setUser(currentUser);
      setAuthLoading(false);

      if (currentUser) {
        setIsGuest(false);
        setShowLoginModal(false);
        
        // Sync user profile to Firestore
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          await setDoc(userDocRef, {
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL,
            lastLoginAt: new Date().toISOString()
          }, { merge: true });

          // Load user favorites from Firestore
          const favsCol = collection(db, 'users', currentUser.uid, 'favorites');
          const favsSnap = await getDocs(favsCol);
          const favSet = new Set<string>();
          favsSnap.forEach((d) => favSet.add(d.id));
          setFavorites(favSet);

          // Load user documents from Firestore & migrate guest documents if any
          const docsCol = collection(db, 'users', currentUser.uid, 'documents');
          const docsSnap = await getDocs(docsCol);
          const userDocsList: UserDocumentItem[] = [];
          docsSnap.forEach((d) => {
            userDocsList.push(d.data() as UserDocumentItem);
          });

          // Check if user had drafted documents as guest
          const guestDocsRaw = localStorage.getItem('zain_user_documents');
          if (guestDocsRaw) {
            try {
              const guestDocs: UserDocumentItem[] = JSON.parse(guestDocsRaw);
              for (const gDoc of guestDocs) {
                if (!userDocsList.some((d) => d.id === gDoc.id)) {
                  const syncedDoc = { ...gDoc, userId: currentUser.uid };
                  userDocsList.push(syncedDoc);
                  await setDoc(doc(db, 'users', currentUser.uid, 'documents', syncedDoc.id), syncedDoc, { merge: true });
                }
              }
              localStorage.removeItem('zain_user_documents');
            } catch (e) {}
          }

          if (userDocsList.length > 0) {
            setDocuments(userDocsList);
            localStorage.setItem(`zain_docs_${currentUser.uid}`, JSON.stringify(userDocsList));
          }

          // Load user quotas from Firestore & sync local state if fresh
          const quotaDocRef = doc(db, 'users', currentUser.uid, 'data', 'quotas');
          const quotaSnap = await getDoc(quotaDocRef);
          let loadedQuotas: UserQuotas = {};

          if (quotaSnap.exists()) {
            loadedQuotas = (quotaSnap.data() as UserQuotas) || {};
          } else {
            // Fallback from localStorage
            const localQuotas = localStorage.getItem(`zain_quotas_${currentUser.uid}`);
            const guestQuotas = localStorage.getItem('zain_guest_quotas');
            const quotasToUse = localQuotas || guestQuotas;
            if (quotasToUse) {
              try {
                loadedQuotas = JSON.parse(quotasToUse);
                // Sync to Firestore immediately
                await setDoc(quotaDocRef, loadedQuotas, { merge: true });
                localStorage.removeItem('zain_guest_quotas');
              } catch (e) {}
            }
          }
          setUserQuotas(loadedQuotas);

          // Load user loyalty from Firestore
          const loyaltyDocRef = doc(db, 'users', currentUser.uid, 'data', 'loyalty');
          const loyaltySnap = await getDoc(loyaltyDocRef);
          let loadedLoyalty: UserLoyalty = defaultLoyalty;

          if (loyaltySnap.exists()) {
            loadedLoyalty = { ...defaultLoyalty, ...(loyaltySnap.data() as UserLoyalty) };
          } else {
            const localLoyalty = localStorage.getItem(`zain_loyalty_${currentUser.uid}`) || localStorage.getItem('zain_guest_loyalty');
            if (localLoyalty) {
              try {
                loadedLoyalty = { ...defaultLoyalty, ...JSON.parse(localLoyalty) };
                await setDoc(loyaltyDocRef, loadedLoyalty, { merge: true });
                localStorage.removeItem('zain_guest_loyalty');
              } catch (e) {}
            }
          }
          setLoyalty(loadedLoyalty);

          // Load reseller trials from Firestore
          const trialsDocRef = doc(db, 'users', currentUser.uid, 'data', 'reseller_trials');
          const trialsSnap = await getDoc(trialsDocRef);
          let loadedTrials: ResellerTrials = {};

          if (trialsSnap.exists()) {
            loadedTrials = (trialsSnap.data() as ResellerTrials) || {};
          } else {
            const localTrials = localStorage.getItem(`zain_reseller_trials_${currentUser.uid}`) || localStorage.getItem('zain_guest_reseller_trials');
            if (localTrials) {
              try {
                loadedTrials = JSON.parse(localTrials);
                await setDoc(trialsDocRef, loadedTrials, { merge: true });
                localStorage.removeItem('zain_guest_reseller_trials');
              } catch (e) {}
            }
          }
          setResellerTrials(loadedTrials);

          // Load user wallet balance from Firestore
          try {
            const walletDocRef = doc(db, 'users', currentUser.uid, 'data', 'wallet');
            const walletSnap = await getDoc(walletDocRef);
            if (walletSnap.exists()) {
              const wData = walletSnap.data();
              const bal = typeof wData.balance === 'number' ? wData.balance : 0;
              setUserWalletBalance(bal);
              localStorage.setItem(`zain_wallet_${currentUser.uid}`, bal.toString());
            } else {
              const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
              if (userSnap.exists() && typeof userSnap.data()?.walletBalance === 'number') {
                const bal = userSnap.data()?.walletBalance || 0;
                setUserWalletBalance(bal);
                localStorage.setItem(`zain_wallet_${currentUser.uid}`, bal.toString());
              } else {
                const localWallet = localStorage.getItem(`zain_wallet_${currentUser.uid}`);
                if (localWallet) {
                  setUserWalletBalance(Number(localWallet) || 0);
                }
              }
            }
          } catch (wErr) {
            console.warn('Could not load wallet from Firestore:', wErr);
          }

          // Load user purchases
          const purchCol = collection(db, 'users', currentUser.uid, 'purchases');
          const purchSnap = await getDocs(purchCol);
          const purchList: UserPurchase[] = [];

          purchSnap.forEach((d) => {
            const data = d.data() as UserPurchase;
            purchList.push(data);
          });

          // Sort latest first
          purchList.sort((a, b) => b.purchasedAt - a.purchasedAt);
          setPurchases(purchList);

          // Load all global transactions if admin
          try {
            const allTrxCol = collection(db, 'transactions');
            const allTrxSnap = await getDocs(allTrxCol);
            const globalPurchList: UserPurchase[] = [];
            allTrxSnap.forEach((d) => {
              globalPurchList.push(d.data() as UserPurchase);
            });
            if (globalPurchList.length > 0) {
              globalPurchList.sort((a, b) => b.purchasedAt - a.purchasedAt);
              setAllPurchasesForAdmin(globalPurchList);
            }
          } catch (e) {
            console.warn('Could not load global transactions:', e);
          }
        } catch (err) {
          console.warn('Could not sync data from Firestore:', err);
          // Fallback to local storage
          const localPurch = localStorage.getItem(`zain_purch_${currentUser.uid}`);
          if (localPurch) {
            try {
              setPurchases(JSON.parse(localPurch));
            } catch (e) {}
          }
          const localQuotas = localStorage.getItem(`zain_quotas_${currentUser.uid}`);
          if (localQuotas) {
            try {
              setUserQuotas(JSON.parse(localQuotas));
            } catch (e) {}
          }
          const localLoyalty = localStorage.getItem(`zain_loyalty_${currentUser.uid}`);
          if (localLoyalty) {
            try {
              setLoyalty({ ...defaultLoyalty, ...JSON.parse(localLoyalty) });
            } catch (e) {}
          }
          const localTrials = localStorage.getItem(`zain_reseller_trials_${currentUser.uid}`);
          if (localTrials) {
            try {
              setResellerTrials(JSON.parse(localTrials));
            } catch (e) {}
          }
        }
      } else {
        // Check if user is logged in via Custom Auth (PIN / Email Mandiri without Google)
        const savedCustom = localStorage.getItem('zain_custom_auth_user');
        if (savedCustom) {
          try {
            const parsedUser: AppUser = JSON.parse(savedCustom);
            setUser(parsedUser);
            setIsGuest(false);
            setShowLoginModal(false);

            // Load quotas, wallet, loyalty for custom user
            const localQuotas = localStorage.getItem(`zain_quotas_${parsedUser.uid}`);
            if (localQuotas) {
              try { setUserQuotas(JSON.parse(localQuotas)); } catch (e) {}
            }
            const localWallet = localStorage.getItem(`zain_wallet_${parsedUser.uid}`);
            if (localWallet) {
              setUserWalletBalance(Number(localWallet) || 0);
            }
            const localLoyalty = localStorage.getItem(`zain_loyalty_${parsedUser.uid}`);
            if (localLoyalty) {
              try { setLoyalty({ ...defaultLoyalty, ...JSON.parse(localLoyalty) }); } catch (e) {}
            }
            return;
          } catch (e) {}
        }

        // Guest mode fallback
        const guestPurch = localStorage.getItem('zain_guest_purch');
        if (guestPurch) {
          try {
            setPurchases(JSON.parse(guestPurch));
          } catch (e) {}
        }
        const guestQuotas = localStorage.getItem('zain_guest_quotas');
        if (guestQuotas) {
          try {
            setUserQuotas(JSON.parse(guestQuotas));
          } catch (e) {}
        }
        const guestLoyalty = localStorage.getItem('zain_guest_loyalty');
        if (guestLoyalty) {
          try {
            setLoyalty({ ...defaultLoyalty, ...JSON.parse(guestLoyalty) });
          } catch (e) {}
        }
        const guestTrials = localStorage.getItem('zain_guest_reseller_trials');
        if (guestTrials) {
          try {
            setResellerTrials(JSON.parse(guestTrials));
          } catch (e) {}
        }
      }
    });

    return () => {
      clearTimeout(authSafetyTimer);
      unsubscribe();
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Check Free Trial Eligibility (Exclusively for Reseller accounts; removed for general/public accounts)
  const checkFreeTrialEligibility = async () => {
    setIsCheckingTrialEligibility(true);
    try {
      const deviceInfo = await collectDeviceFingerprint();

      // Free Trial is ONLY for reseller accounts. For general/public accounts, trial is removed.
      if (userRole !== 'reseller') {
        setFreeTrialStatus({
          isEligible: false,
          deviceFingerprint: deviceInfo.deviceFingerprint,
          ipAddress: deviceInfo.ipAddress,
          osName: deviceInfo.osName,
          browserName: deviceInfo.browserName,
          gpuRenderer: deviceInfo.gpuRenderer,
          screenSpec: deviceInfo.screenSpec,
          cpuCores: deviceInfo.cpuCores,
          rejectionReason: 'Fasilitas Free Trial khusus untuk akun berstatus Mitra Reseller ZAIN.NET. Untuk akun umum, silakan lakukan pembelian sewa/kuota modul.'
        });
        return;
      }
      
      // 1. Check LocalStorage Hardware Marker
      const localClaimedRaw = localStorage.getItem('zain_device_trial_claimed');
      let localClaimed: DeviceTrialRecord | null = null;
      if (localClaimedRaw) {
        try {
          localClaimed = JSON.parse(localClaimedRaw);
        } catch (e) {}
      }

      // 2. Check Firestore device_trials collection by deviceFingerprint
      let firestoreClaimed: DeviceTrialRecord | null = null;
      try {
        const deviceDocRef = doc(db, 'device_trials', deviceInfo.deviceFingerprint);
        const deviceDocSnap = await getDoc(deviceDocRef);
        if (deviceDocSnap.exists()) {
          firestoreClaimed = { id: deviceDocSnap.id, ...(deviceDocSnap.data() as any) };
        }
      } catch (e) {
        console.warn('Firestore device_trials check notice:', e);
      }

      // 3. Check Firestore ip_trials collection by IP
      let ipClaimed: DeviceTrialRecord | null = null;
      if (deviceInfo.ipAddress && deviceInfo.ipAddress !== '127.0.0.1') {
        try {
          const safeIpKey = deviceInfo.ipAddress.replace(/[^a-zA-Z0-9]/g, '_');
          const ipDocRef = doc(db, 'ip_trials', safeIpKey);
          const ipDocSnap = await getDoc(ipDocRef);
          if (ipDocSnap.exists()) {
            ipClaimed = { id: ipDocSnap.id, ...(ipDocSnap.data() as any) };
          }
        } catch (e) {
          console.warn('Firestore ip_trials check notice:', e);
        }
      }

      // 4. Check Current User Account if logged in
      let accountClaimed: DeviceTrialRecord | null = null;
      if (user?.uid) {
        try {
          const userTrialSnap = await getDoc(doc(db, 'users', user.uid, 'data', 'free_trial'));
          if (userTrialSnap.exists()) {
            accountClaimed = { id: userTrialSnap.id, ...(userTrialSnap.data() as any) };
          }
        } catch (e) {}
      }

      const activeClaim = firestoreClaimed || ipClaimed || localClaimed || accountClaimed;

      if (activeClaim) {
        let reason = 'Batas 1x Free Trial telah digunakan pada perangkat atau jaringan ini.';
        if (firestoreClaimed) {
          reason = `Perangkat (${deviceInfo.osName}) ini telah menggunakan jatah 1x Free Trial pada akun (${firestoreClaimed.claimedByEmail}). Sesuai aturan anti-abuse ZAIN.NET, setiap unit laptop/perangkat fisik hanya berhak atas 1x uji coba meskipun membuat akun baru.`;
        } else if (ipClaimed) {
          reason = `Jaringan IP internet (${deviceInfo.ipAddress}) telah mencapai batas 1x Free Trial.`;
        } else if (accountClaimed) {
          reason = `Akun Anda (${user?.email}) telah mengklaim 1x Free Trial sebelumnya.`;
        } else if (localClaimed) {
          reason = `Perangkat ini telah tercatat menggunakan 1x Free Trial untuk modul (${localClaimed.toolTitle || 'Akademik'}).`;
        }

        setFreeTrialStatus({
          isEligible: false,
          deviceFingerprint: deviceInfo.deviceFingerprint,
          ipAddress: deviceInfo.ipAddress,
          osName: deviceInfo.osName,
          browserName: deviceInfo.browserName,
          gpuRenderer: deviceInfo.gpuRenderer,
          screenSpec: deviceInfo.screenSpec,
          cpuCores: deviceInfo.cpuCores,
          claimedRecord: activeClaim,
          rejectionReason: reason
        });
      } else {
        setFreeTrialStatus({
          isEligible: true,
          deviceFingerprint: deviceInfo.deviceFingerprint,
          ipAddress: deviceInfo.ipAddress,
          osName: deviceInfo.osName,
          browserName: deviceInfo.browserName,
          gpuRenderer: deviceInfo.gpuRenderer,
          screenSpec: deviceInfo.screenSpec,
          cpuCores: deviceInfo.cpuCores
        });
      }
    } catch (err) {
      console.error('Error checking free trial eligibility:', err);
      setFreeTrialStatus({
        isEligible: false,
        deviceFingerprint: 'fallback-seed',
        ipAddress: 'Unknown',
        osName: navigator.platform || 'Unknown OS',
        browserName: 'Web Browser',
        gpuRenderer: 'Standard GPU',
        screenSpec: `${window.innerWidth}x${window.innerHeight}`,
        cpuCores: navigator.hardwareConcurrency || 4,
        rejectionReason: 'Tidak dapat memverifikasi integritas sensor perangkat'
      });
    } finally {
      setIsCheckingTrialEligibility(false);
    }
  };

  // Run eligibility check on initial mount and when user / guest / role changes
  useEffect(() => {
    checkFreeTrialEligibility();
  }, [user?.uid, isGuest, userRole]);

  // Handle claiming Free Trial for a tool (Reseller only)
  const handleClaimFreeTrial = async (tool: ToolItem) => {
    if (userRole !== 'reseller') {
      alert('Penggunaan trial gratis hanya berlaku khusus untuk akun berstatus Reseller ZAIN.NET. Akun umum tidak memiliki akses trial gratis.');
      return;
    }

    if (!freeTrialStatus?.isEligible) {
      alert('Perangkat atau akun ini tidak memenuhi syarat untuk klaim Free Trial tambahan.');
      return;
    }

    const trialRecord: DeviceTrialRecord = {
      id: freeTrialStatus.deviceFingerprint,
      deviceFingerprint: freeTrialStatus.deviceFingerprint,
      osName: freeTrialStatus.osName,
      browserName: freeTrialStatus.browserName,
      gpuRenderer: freeTrialStatus.gpuRenderer,
      screenSpec: freeTrialStatus.screenSpec,
      cpuCores: freeTrialStatus.cpuCores,
      ipAddress: freeTrialStatus.ipAddress,
      claimedAt: Date.now(),
      claimedByUid: user?.uid || 'guest',
      claimedByEmail: user?.email || (isGuest ? 'Mode Tamu / Mahasiswa' : 'Pengguna Mahasiswa'),
      claimedByName: user?.displayName || (isGuest ? 'Mahasiswa Tamu' : 'Mahasiswa Penguji'),
      toolId: tool.id,
      toolTitle: tool.title,
      status: 'active'
    };

    try {
      // 1. Save to device_trials collection in Firestore
      await setDoc(doc(db, 'device_trials', freeTrialStatus.deviceFingerprint), trialRecord);

      // 2. Save to ip_trials collection in Firestore
      if (freeTrialStatus.ipAddress && freeTrialStatus.ipAddress !== '127.0.0.1') {
        const safeIpKey = freeTrialStatus.ipAddress.replace(/[^a-zA-Z0-9]/g, '_');
        await setDoc(doc(db, 'ip_trials', safeIpKey), trialRecord);
      }

      // 3. Save to User Document if logged in
      if (user?.uid) {
        await setDoc(doc(db, 'users', user.uid, 'data', 'free_trial'), trialRecord);
      }

      // 4. Save to LocalStorage
      localStorage.setItem('zain_device_trial_claimed', JSON.stringify(trialRecord));

      // 5. Grant +1 quota for this tool
      const currentQ = userQuotas[tool.id] || 0;
      const updatedQuotas = { ...userQuotas, [tool.id]: currentQ + 1 };
      setUserQuotas(updatedQuotas);

      if (user?.uid) {
        await setDoc(doc(db, 'users', user.uid, 'data', 'quotas'), updatedQuotas, { merge: true });
        localStorage.setItem(`zain_quotas_${user.uid}`, JSON.stringify(updatedQuotas));
      } else {
        localStorage.setItem('zain_guest_quotas', JSON.stringify(updatedQuotas));
      }

      // 6. Update local status so UI immediately locks further claims
      setFreeTrialStatus({
        ...freeTrialStatus,
        isEligible: false,
        claimedRecord: trialRecord,
        rejectionReason: `Free Trial 1x telah aktif dan dialokasikan untuk ${tool.title}.`
      });

      setShowFreeTrialModal(false);

      // 7. Directly open tool viewer modal
      setActiveTool(tool);
    } catch (err: any) {
      console.error('Error claiming free trial:', err);
      alert('Gagal mengklaim Free Trial: ' + (err?.message || 'Terjadi kesalahan'));
    }
  };

  // Helper to calculate remaining free trial for reseller (3x per item)
  const getResellerTrialRemaining = (toolId: string): number => {
    if (userRole !== 'reseller') return 0;
    const used = resellerTrials[toolId] || 0;
    return Math.max(0, RESELLER_MAX_FREE_TRIALS - used);
  };

  // Helper to get remaining quota for a tool (includes reseller trial)
  const getToolQuota = (tool: ToolItem): number => {
    if (userRole === 'admin') return 999;
    const paidQuota = userQuotas[tool.id] || 0;
    if (userRole === 'reseller') {
      const trialRemaining = getResellerTrialRemaining(tool.id);
      return paidQuota + trialRemaining;
    }
    return paidQuota;
  };

  // Total active quotas across all tools
  const totalQuotaCount = useMemo(() => {
    return Object.values(userQuotas).reduce<number>((acc, q) => acc + (typeof q === 'number' ? q : 0), 0);
  }, [userQuotas]);

  // Pending verification count for Admin
  const pendingVerificationCount = useMemo(() => {
    return (allPurchasesForAdmin || []).filter(p => !p.status || p.status === 'pending').length;
  }, [allPurchasesForAdmin]);

  // Save updated manual QRIS payment config
  const handleSavePaymentConfig = async (newConfig: PaymentConfig) => {
    setPaymentConfig(newConfig);
    localStorage.setItem('zain_manual_qris_config', JSON.stringify(newConfig));
    if (user) {
      try {
        await setDoc(doc(db, 'settings', 'qris_config'), newConfig, { merge: true });
      } catch (err) {
        console.warn('Error saving config to Firestore:', err);
      }
    }
  };

  // Save dynamic custom prices (Item & Category overrides)
  const handleSaveCustomPrices = async (newPrices: CustomPricesConfig) => {
    setCustomPrices(newPrices);
    localStorage.setItem('zain_custom_prices', JSON.stringify(newPrices));
    if (user) {
      try {
        await setDoc(doc(db, 'settings', 'prices'), newPrices, { merge: true });
      } catch (err) {
        console.warn('Error saving prices to Firestore:', err);
      }
    }
  };

  // Save / Update document in User Archive
  const handleSaveDocument = async (docItem: UserDocumentItem) => {
    const updatedDocs = [docItem, ...documents.filter((d) => d.id !== docItem.id)];
    setDocuments(updatedDocs);

    if (user) {
      try {
        const docRef = doc(db, 'users', user.uid, 'documents', docItem.id);
        await setDoc(docRef, docItem, { merge: true });
        localStorage.setItem(`zain_docs_${user.uid}`, JSON.stringify(updatedDocs));
      } catch (err) {
        console.warn('Error saving document to Firestore:', err);
        localStorage.setItem(`zain_docs_${user.uid}`, JSON.stringify(updatedDocs));
      }
    } else {
      localStorage.setItem('zain_user_documents', JSON.stringify(updatedDocs));
    }
  };

  // Delete document from User Archive
  const handleDeleteDocument = async (docId: string) => {
    const updatedDocs = documents.filter((d) => d.id !== docId);
    setDocuments(updatedDocs);

    if (user) {
      try {
        const docRef = doc(db, 'users', user.uid, 'documents', docId);
        await deleteDoc(docRef);
        localStorage.setItem(`zain_docs_${user.uid}`, JSON.stringify(updatedDocs));
      } catch (err) {
        console.warn('Error deleting document from Firestore:', err);
        localStorage.setItem(`zain_docs_${user.uid}`, JSON.stringify(updatedDocs));
      }
    } else {
      localStorage.setItem('zain_user_documents', JSON.stringify(updatedDocs));
    }
  };

  // Save updated roles config (Admin, Resellers, Discount %)
  const handleSaveRolesConfig = async (newConfig: RolesConfig) => {
    setRolesConfig(newConfig);
    localStorage.setItem('zain_roles_config', JSON.stringify(newConfig));
    try {
      await setDoc(doc(db, 'settings', 'roles_config'), newConfig, { merge: true });
    } catch (err) {
      console.warn('Error saving roles config to Firestore:', err);
    }
  };

  // Handle direct web login (Mahasiswa Registration, Email & Password, or Admin PIN)
  const handleCustomLogin = async (userOrEmail: string | AppUser, displayName?: string) => {
    let customUser: AppUser;

    if (typeof userOrEmail === 'object') {
      customUser = userOrEmail;
    } else {
      const normalizedEmail = userOrEmail.trim().toLowerCase();
      const isAdmin = rolesConfig.adminEmails.some(a => a.toLowerCase() === normalizedEmail);
      customUser = {
        uid: `custom_${normalizedEmail.replace(/[^a-zA-Z0-9]/g, '_')}`,
        email: normalizedEmail,
        displayName: displayName || (isAdmin ? 'Administrator ZAIN.NET' : 'Pengguna ZAIN.NET'),
        photoURL: null,
        isCustomAuth: true
      };
    }

    const isAdmin = rolesConfig.adminEmails.some(a => a.toLowerCase() === (customUser.email || '').toLowerCase());

    setUser(customUser);
    setIsGuest(false);
    setShowLoginModal(false);
    setShowPinLoginModal(false);
    localStorage.setItem('zain_custom_auth_user', JSON.stringify(customUser));

    try {
      const userDocRef = doc(db, 'users', customUser.uid);
      await setDoc(userDocRef, {
        uid: customUser.uid,
        email: customUser.email,
        displayName: customUser.displayName,
        university: customUser.university || '',
        major: customUser.major || '',
        whatsapp: customUser.whatsapp || '',
        lastLoginAt: new Date().toISOString(),
        authProvider: 'web_auth_native'
      }, { merge: true });

      // Load favorites
      const favsCol = collection(db, 'users', customUser.uid, 'favorites');
      const favsSnap = await getDocs(favsCol);
      const favSet = new Set<string>();
      favsSnap.forEach((d) => favSet.add(d.id));
      if (favSet.size > 0) setFavorites(favSet);

      // Load documents
      const docsCol = collection(db, 'users', customUser.uid, 'documents');
      const docsSnap = await getDocs(docsCol);
      const userDocsList: UserDocumentItem[] = [];
      docsSnap.forEach((d) => userDocsList.push(d.data() as UserDocumentItem));
      if (userDocsList.length > 0) {
        setDocuments(userDocsList);
        localStorage.setItem(`zain_docs_${customUser.uid}`, JSON.stringify(userDocsList));
      }

      // Load quotas
      const quotaDocRef = doc(db, 'users', customUser.uid, 'data', 'quotas');
      const quotaSnap = await getDoc(quotaDocRef);
      if (quotaSnap.exists()) {
        const qData = quotaSnap.data() as UserQuotas;
        setUserQuotas(qData);
        localStorage.setItem(`zain_quotas_${customUser.uid}`, JSON.stringify(qData));
      } else {
        const localQuotas = localStorage.getItem(`zain_quotas_${customUser.uid}`);
        if (localQuotas) {
          try {
            setUserQuotas(JSON.parse(localQuotas));
          } catch (e) {}
        }
      }

      // Load wallet balance
      const walletSnap = await getDoc(doc(db, 'users', customUser.uid, 'data', 'wallet'));
      if (walletSnap.exists()) {
        const bal = walletSnap.data()?.balance;
        if (typeof bal === 'number') {
          setUserWalletBalance(bal);
          localStorage.setItem(`zain_wallet_${customUser.uid}`, bal.toString());
        }
      }

      // If admin, load global transactions
      if (isAdmin) {
        try {
          const allTrxCol = collection(db, 'transactions');
          const allTrxSnap = await getDocs(allTrxCol);
          const globalPurchList: UserPurchase[] = [];
          allTrxSnap.forEach((d) => {
            globalPurchList.push(d.data() as UserPurchase);
          });
          if (globalPurchList.length > 0) {
            globalPurchList.sort((a, b) => b.purchasedAt - a.purchasedAt);
            setAllPurchasesForAdmin(globalPurchList);
          }
        } catch (e) {}
      }
    } catch (err) {
      console.warn('Custom login Firestore sync warning:', err);
    }
  };

  // Quick correction for abnormal quota (e.g. if previous loop inflated quota to 384x)
  const handleCorrectToolQuota = async (toolId: string, targetQuota: number = 1) => {
    const updated = {
      ...userQuotas,
      [toolId]: Math.max(0, targetQuota)
    };
    setUserQuotas(updated);

    // Normalize loyalty to 1 purchase if it was inflated
    const normalizedLoyalty = {
      ...loyalty,
      purchaseCount: 1,
      freeRewardsAvailable: 0,
      totalFreeEarned: 0,
      totalFreeClaimed: 0
    };
    setLoyalty(normalizedLoyalty);

    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid, 'data', 'quotas'), updated);
        await setDoc(doc(db, 'users', user.uid, 'data', 'loyalty'), normalizedLoyalty, { merge: true });
        localStorage.setItem(`zain_quotas_${user.uid}`, JSON.stringify(updated));
        localStorage.setItem(`zain_loyalty_${user.uid}`, JSON.stringify(normalizedLoyalty));
      } catch (e) {
        console.warn('Error saving corrected quota to Firestore:', e);
      }
    } else {
      localStorage.setItem('zain_guest_quotas', JSON.stringify(updated));
      localStorage.setItem('zain_guest_loyalty', JSON.stringify(normalizedLoyalty));
    }
  };

  // Handle successful purchase: Grant +1 quota for tool or all tools in category
  const handlePaymentSuccess = async (purchase: UserPurchase) => {
    // Strictly guard against duplicate execution for the same purchase
    if (processedPurchaseIdsRef.current.has(purchase.id)) {
      console.log('Purchase already processed, skipping duplicate:', purchase.id);
      return;
    }
    processedPurchaseIdsRef.current.add(purchase.id);

    const updatedQuotas = { ...userQuotas };

    if (purchase.itemType === 'tool') {
      const toolId = purchase.itemId.replace('tool:', '');
      updatedQuotas[toolId] = (updatedQuotas[toolId] || 0) + (purchase.quotaGranted || 1);
    } else if (purchase.itemType === 'category') {
      const categoryId = Number(purchase.itemId.replace('category:', ''));
      const foundCategory = categories.find((c) => c.id === categoryId);
      if (foundCategory && Array.isArray(foundCategory.tools)) {
        foundCategory.tools.forEach((t) => {
          if (t && t.id) {
            updatedQuotas[t.id] = (updatedQuotas[t.id] || 0) + 1;
          }
        });
      }
    }

    setUserQuotas(updatedQuotas);

    const updatedPurchases = [purchase, ...purchases];
    setPurchases(updatedPurchases);

    // Calculate Loyalty: Every 3 purchases get 1 free all item
    let updatedLoyalty = { ...loyalty };
    const nextCount = loyalty.purchaseCount + 1;
    const earnedFree = nextCount % 3 === 0;

    updatedLoyalty = {
      purchaseCount: nextCount,
      freeRewardsAvailable: earnedFree ? loyalty.freeRewardsAvailable + 1 : loyalty.freeRewardsAvailable,
      totalFreeEarned: earnedFree ? loyalty.totalFreeEarned + 1 : loyalty.totalFreeEarned,
      totalFreeClaimed: loyalty.totalFreeClaimed
    };
    setLoyalty(updatedLoyalty);

    if (earnedFree) {
      setShowRewardCelebration(true);
    }

    // Save to Firestore if user logged in
    if (user) {
      try {
        const purchRef = doc(db, 'users', user.uid, 'purchases', purchase.id);
        await setDoc(purchRef, purchase);
        const quotaDocRef = doc(db, 'users', user.uid, 'data', 'quotas');
        await setDoc(quotaDocRef, updatedQuotas);
        const loyaltyDocRef = doc(db, 'users', user.uid, 'data', 'loyalty');
        await setDoc(loyaltyDocRef, updatedLoyalty);

        // Also save to global transactions collection for admin analytics
        try {
          await setDoc(doc(db, 'transactions', purchase.id), purchase);
        } catch (trxErr) {
          console.warn('Error recording global transaction in Firestore:', trxErr);
        }

        localStorage.setItem(`zain_purch_${user.uid}`, JSON.stringify(updatedPurchases));
        localStorage.setItem(`zain_quotas_${user.uid}`, JSON.stringify(updatedQuotas));
        localStorage.setItem(`zain_loyalty_${user.uid}`, JSON.stringify(updatedLoyalty));
      } catch (err) {
        console.warn('Error recording purchase/quotas in Firestore:', err);
        localStorage.setItem(`zain_purch_${user.uid}`, JSON.stringify(updatedPurchases));
        localStorage.setItem(`zain_quotas_${user.uid}`, JSON.stringify(updatedQuotas));
        localStorage.setItem(`zain_loyalty_${user.uid}`, JSON.stringify(updatedLoyalty));
      }
    } else {
      // Guest purchase also record to global transactions if possible
      try {
        await setDoc(doc(db, 'transactions', purchase.id), purchase);
      } catch (e) {}
      localStorage.setItem('zain_guest_purch', JSON.stringify(updatedPurchases));
      localStorage.setItem('zain_guest_quotas', JSON.stringify(updatedQuotas));
      localStorage.setItem('zain_guest_loyalty', JSON.stringify(updatedLoyalty));
    }

    setAllPurchasesForAdmin((prev) => [purchase, ...prev.filter((p) => p.id !== purchase.id)]);

    setCheckoutTarget(null);

    // If purchase was for a single tool, auto-open it immediately
    if (purchase.itemType === 'tool') {
      const toolId = purchase.itemId.replace('tool:', '');
      for (const cat of categoriesData) {
        const found = cat.tools.find((t) => t.id === toolId);
        if (found) {
          setActiveTool(found);
          break;
        }
      }
    }
  };

  // Claim 1 Free Creation Quota using Loyalty Reward (Beli 3x Gratis 1x)
  const handleClaimLoyaltyReward = async (tool: ToolItem) => {
    if (loyalty.freeRewardsAvailable <= 0) return;

    const newFreeAvailable = Math.max(0, loyalty.freeRewardsAvailable - 1);
    const newTotalClaimed = loyalty.totalFreeClaimed + 1;
    const updatedLoyalty: UserLoyalty = {
      ...loyalty,
      freeRewardsAvailable: newFreeAvailable,
      totalFreeClaimed: newTotalClaimed
    };
    setLoyalty(updatedLoyalty);

    const updatedQuotas = {
      ...userQuotas,
      [tool.id]: (userQuotas[tool.id] || 0) + 1
    };
    setUserQuotas(updatedQuotas);

    const rewardPurchase: UserPurchase = {
      id: `reward-${Date.now()}`,
      userId: user?.uid || 'guest',
      userEmail: user?.email || 'guest@zain.net',
      itemId: `tool:${tool.id}`,
      itemType: 'tool',
      itemTitle: `Klaim Promo Beli 3x Gratis 1x: ${tool.title}`,
      amountPaid: 0,
      purchasedAt: Date.now(),
      method: 'loyalty_reward_3x',
      quotaGranted: 1,
      status: 'settlement'
    };

    const updatedPurchases = [rewardPurchase, ...purchases];
    setPurchases(updatedPurchases);

    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid, 'data', 'loyalty'), updatedLoyalty);
        await setDoc(doc(db, 'users', user.uid, 'data', 'quotas'), updatedQuotas);
        await setDoc(doc(db, 'users', user.uid, 'purchases', rewardPurchase.id), rewardPurchase);
        try {
          await setDoc(doc(db, 'transactions', rewardPurchase.id), rewardPurchase);
        } catch (e) {}
        localStorage.setItem(`zain_loyalty_${user.uid}`, JSON.stringify(updatedLoyalty));
        localStorage.setItem(`zain_quotas_${user.uid}`, JSON.stringify(updatedQuotas));
        localStorage.setItem(`zain_purch_${user.uid}`, JSON.stringify(updatedPurchases));
      } catch (err) {
        console.warn('Error saving claimed reward to Firestore:', err);
      }
    } else {
      try {
        await setDoc(doc(db, 'transactions', rewardPurchase.id), rewardPurchase);
      } catch (e) {}
      localStorage.setItem('zain_guest_loyalty', JSON.stringify(updatedLoyalty));
      localStorage.setItem('zain_guest_quotas', JSON.stringify(updatedQuotas));
      localStorage.setItem('zain_guest_purch', JSON.stringify(updatedPurchases));
    }

    setAllPurchasesForAdmin((prev) => [rewardPurchase, ...prev.filter((p) => p.id !== rewardPurchase.id)]);

    // Open the claimed tool immediately
    setActiveTool(tool);
  };

  // Redeem free reward directly from the checkout modal
  const handleUseFreeRewardFromCheckout = async (target: CheckoutTarget) => {
    if (loyalty.freeRewardsAvailable <= 0) return;

    if (target.type === 'tool') {
      for (const cat of categoriesData) {
        const found = cat.tools.find((t) => t.id === target.id);
        if (found) {
          setCheckoutTarget(null);
          await handleClaimLoyaltyReward(found);
          return;
        }
      }
    } else if (target.type === 'category') {
      const categoryId = Number(target.id);
      const foundCategory = categoriesData.find((c) => c.id === categoryId);
      if (foundCategory && foundCategory.tools.length > 0) {
        setCheckoutTarget(null);
        // Claim the first tool in this category
        await handleClaimLoyaltyReward(foundCategory.tools[0]);
        return;
      }
    }
  };

  // Launch tool directly using Reseller Free Trial from checkout modal
  const handleUseResellerTrialFromCheckout = (target: CheckoutTarget) => {
    if (userRole !== 'reseller') return;
    if (target.type === 'tool') {
      for (const cat of categoriesData) {
        const found = cat.tools.find((t) => t.id === target.id);
        if (found) {
          setCheckoutTarget(null);
          setActiveTool(found);
          return;
        }
      }
    }
  };

  // Consume 1 creation quota when session finishes (Admin has unlimited free sessions)
  const handleConsumeQuota = async (tool: ToolItem, details?: string) => {
    if (userRole === 'admin') {
      return; // Admins have unlimited free access
    }

    // Auto-record generated document archive item
    const autoDoc: UserDocumentItem = {
      id: `doc-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      userId: user?.uid || 'guest',
      title: `${tool.title} — Hasil Pembuatan`,
      categoryTitle: categoriesData.find((c) => c.id === tool.categoryId)?.title || 'Dokumen Akademik',
      toolId: tool.id,
      toolTitle: tool.title,
      content: `Dokumen berhasil disusun dan diunduh melalui modul ${tool.title}.\nStatus: Selesai otomatis oleh Sistem ZAIN.NET\nWaktu: ${new Date().toLocaleString('id-ID')}\nDetail: ${details || 'Unduhan berkas terdeteksi'}`,
      notes: details || 'Unduhan berhasil direkam oleh sistem otomatis',
      fileType: 'docx',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    handleSaveDocument(autoDoc);

    // Check reseller free trial first
    if (userRole === 'reseller') {
      const trialRemaining = getResellerTrialRemaining(tool.id);
      if (trialRemaining > 0) {
        const usedCount = (resellerTrials[tool.id] || 0) + 1;
        const updatedTrials: ResellerTrials = {
          ...resellerTrials,
          [tool.id]: usedCount
        };
        setResellerTrials(updatedTrials);

        if (user) {
          try {
            const trialDocRef = doc(db, 'users', user.uid, 'data', 'reseller_trials');
            await setDoc(trialDocRef, updatedTrials);
            localStorage.setItem(`zain_reseller_trials_${user.uid}`, JSON.stringify(updatedTrials));
          } catch (err) {
            console.warn('Error updating reseller trials in Firestore:', err);
            localStorage.setItem(`zain_reseller_trials_${user.uid}`, JSON.stringify(updatedTrials));
          }
        } else {
          localStorage.setItem('zain_guest_reseller_trials', JSON.stringify(updatedTrials));
        }
        return;
      }
    }

    setUserQuotas((prevQuotas) => {
      const currentQuota = prevQuotas[tool.id] ?? (userQuotas[tool.id] || 0);
      if (currentQuota <= 0) return prevQuotas;

      const newQuotas = {
        ...prevQuotas,
        [tool.id]: Math.max(0, currentQuota - 1)
      };

      if (user) {
        localStorage.setItem(`zain_quotas_${user.uid}`, JSON.stringify(newQuotas));
        const quotaDocRef = doc(db, 'users', user.uid, 'data', 'quotas');
        setDoc(quotaDocRef, newQuotas, { merge: true }).catch((err) => {
          console.warn('Error updating quota in Firestore:', err);
        });
      } else {
        localStorage.setItem('zain_guest_quotas', JSON.stringify(newQuotas));
      }

      return newQuotas;
    });

    // Free Trial usage completion check: mark status as 'used'
    try {
      const rawClaim = localStorage.getItem('zain_device_trial_claimed');
      const parsedClaim: DeviceTrialRecord | null = rawClaim ? JSON.parse(rawClaim) : null;
      const recordToUpdate = freeTrialStatus?.claimedRecord || parsedClaim;
      if (recordToUpdate && recordToUpdate.toolId === tool.id && recordToUpdate.status === 'active') {
        const updatedRecord: DeviceTrialRecord = {
          ...recordToUpdate,
          status: 'used',
          completedAt: Date.now()
        };
        // Update Firestore
        await setDoc(doc(db, 'device_trials', updatedRecord.deviceFingerprint), updatedRecord, { merge: true });
        if (updatedRecord.ipAddress && updatedRecord.ipAddress !== '127.0.0.1') {
          const safeIpKey = updatedRecord.ipAddress.replace(/[^a-zA-Z0-9]/g, '_');
          await setDoc(doc(db, 'ip_trials', safeIpKey), updatedRecord, { merge: true });
        }
        if (user?.uid) {
          await setDoc(doc(db, 'users', user.uid, 'data', 'free_trial'), updatedRecord, { merge: true });
        }
        localStorage.setItem('zain_device_trial_claimed', JSON.stringify(updatedRecord));
        setFreeTrialStatus((prev) => prev ? { ...prev, claimedRecord: updatedRecord } : null);
      }
    } catch (trialErr) {
      console.warn('Error marking device trial as used:', trialErr);
    }
  };

  // Toggle favorite
  const handleToggleFavorite = async (toolId: string) => {
    const newFavorites = new Set(favorites);
    const isAdding = !newFavorites.has(toolId);

    if (isAdding) {
      newFavorites.add(toolId);
    } else {
      newFavorites.delete(toolId);
    }
    setFavorites(newFavorites);

    if (user) {
      try {
        const favDocRef = doc(db, 'users', user.uid, 'favorites', toolId);
        if (isAdding) {
          await setDoc(favDocRef, { toolId, addedAt: Date.now() });
        } else {
          await deleteDoc(favDocRef);
        }
        localStorage.setItem(`zain_favs_${user.uid}`, JSON.stringify(Array.from(newFavorites)));
      } catch (err) {
        console.warn('Error updating favorite in Firestore:', err);
        localStorage.setItem(`zain_favs_${user.uid}`, JSON.stringify(Array.from(newFavorites)));
      }
    } else {
      localStorage.setItem('zain_guest_favs', JSON.stringify(Array.from(newFavorites)));
    }
  };

  // Pay directly with dashboard balance / wallet
  const handlePayWithWallet = async (target: CheckoutTarget, quantity: number, totalCost: number) => {
    if (!user) {
      setShowLoginModal(true);
      return;
    }
    if (userWalletBalance < totalCost) {
      setShowTopUpModal(true);
      return;
    }

    const orderId = `PAY-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
    const newBalance = userWalletBalance - totalCost;

    // Update local and firestore wallet
    setUserWalletBalance(newBalance);
    localStorage.setItem(`zain_wallet_${user.uid}`, newBalance.toString());

    try {
      await setDoc(doc(db, 'users', user.uid, 'data', 'wallet'), {
        balance: newBalance,
        lastUpdated: Date.now()
      }, { merge: true });

      await setDoc(doc(db, 'users', user.uid), {
        walletBalance: newBalance,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      console.warn('Error updating wallet balance in Firestore:', err);
    }

    const purchaseData: UserPurchase = {
      id: orderId,
      userId: user.uid,
      userEmail: user.email || 'user@zain.net',
      itemId: target.type === 'tool' ? `tool:${target.id}` : `category:${target.id}`,
      itemType: target.type === 'tool' ? 'tool' : 'category',
      itemTitle: `${target.title} (${quantity}x)`,
      amountPaid: totalCost,
      originalAmount: totalCost,
      purchasedAt: Date.now(),
      quotaGranted: quantity,
      paymentType: 'wallet_balance',
      method: 'wallet_balance',
      status: 'completed',
      senderName: user.displayName || 'Pengguna Saldo',
      senderBank: 'Saldo Akun (Wallet)',
      transferNotes: `Pembayaran instan potong saldo akun (Sisa saldo: Rp ${newBalance.toLocaleString('id-ID')})`,
      verifiedAt: Date.now(),
      verifiedBy: 'Sistem Saldo ZAIN.NET'
    };

    await handlePaymentSuccess(purchaseData);
  };

  const handleToggleSection = (id: number) => {
    setOpenSectionId((prev) => (prev === id ? null : id));
  };

  const handleSignOut = async () => {
    try {
      localStorage.removeItem('zain_custom_auth_user');
      localStorage.removeItem('zain_guest_session');
      await logoutUser();
      setUser(null);
      setUserWalletBalance(0);
      setIsGuest(false);
      setShowProfileModal(false);
      setShowPinLoginModal(false);
      setShowRoleManagementModal(false);
      setShowSettingsModal(false);
      setShowTopUpModal(false);
      setActiveTool(null);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Re-fetch all global transactions for admin analytics
  const handleRefreshAdminAnalytics = async () => {
    try {
      const allTrxCol = collection(db, 'transactions');
      const allTrxSnap = await getDocs(allTrxCol);
      const globalPurchList: UserPurchase[] = [];
      allTrxSnap.forEach((d) => {
        globalPurchList.push(d.data() as UserPurchase);
      });
      if (globalPurchList.length > 0) {
        globalPurchList.sort((a, b) => b.purchasedAt - a.purchasedAt);
        setAllPurchasesForAdmin(globalPurchList);
      }
    } catch (e) {
      console.warn('Could not refresh global transactions:', e);
    }
  };

  const totalToolsCount = useMemo(() => {
    return categories.reduce((acc, cat) => acc + cat.tools.length, 0);
  }, [categories]);

  // Filtered categories and tools
  const filteredCategories = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return categories
      .map((category) => {
        let tools = category.tools;

        if (filterFavoritesOnly || selectedCategoryTab === 'favorites') {
          tools = tools.filter((t) => favorites.has(t.id));
        }

        if (query) {
          tools = tools.filter(
            (t) =>
              t.title.toLowerCase().includes(query) ||
              t.domain.toLowerCase().includes(query) ||
              category.title.toLowerCase().includes(query) ||
              (t.description && t.description.toLowerCase().includes(query)) ||
              (t.badge && t.badge.toLowerCase().includes(query))
          );
        }

        return {
          ...category,
          tools
        };
      })
      .filter((category) => {
        if (selectedCategoryTab !== 'all' && selectedCategoryTab !== 'favorites') {
          if (category.id !== selectedCategoryTab) return false;
        }
        if (query || filterFavoritesOnly || selectedCategoryTab === 'favorites') {
          return category.tools.length > 0;
        }
        return true;
      });
  }, [categories, searchQuery, filterFavoritesOnly, selectedCategoryTab, favorites]);

  // Check if visitor is accessing the blog or a specific post
  const isBlogOrPostRoute = 
    currentView === 'blog' || 
    (typeof window !== 'undefined' && (
      window.location.pathname.startsWith('/makalah') || 
      window.location.pathname.startsWith('/blog') || 
      searchParams.get('view') === 'blog' || 
      searchParams.has('makalah') || 
      searchParams.has('post')
    ));

  // Loading state (only blocks access to private AI tools hub; never blocks public blog readers)
  if (authLoading && !isBlogOrPostRoute) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 px-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-violet-600 flex items-center justify-center font-extrabold text-2xl text-white shadow-xl shadow-blue-500/25 animate-pulse mb-4">
          Z
        </div>
        <p className="text-base font-bold text-slate-200">Menghubungkan ke ZAIN.NET...</p>
        <p className="text-xs text-slate-400 mt-1 mb-6 max-w-xs leading-relaxed">
          Memverifikasi sesi & modul akademik. Jika koneksi lambat, Anda dapat langsung masuk di bawah.
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setAuthLoading(false);
              setIsGuest(true);
              localStorage.setItem('zain_guest_session', 'true');
            }}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
          >
            Buka Aplikasi Langsung (Mode Tamu)
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthLoading(false);
            }}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition-all cursor-pointer"
          >
            Halaman Login
          </button>
        </div>
      </div>
    );
  }

  // Not logged in and not in guest preview -> only show login screen if trying to use AI tools
  if (!user && !isGuest && !isBlogOrPostRoute) {
    return (
      <>
        <LoginView 
          rolesConfig={rolesConfig}
          onLoginSuccess={handleCustomLogin}
          onGuestLogin={() => {
            setIsGuest(true);
            localStorage.setItem('zain_guest_session', 'true');
          }} 
          onNavigateToBlog={() => {
            setCurrentView('blog');
            if (typeof window !== 'undefined' && window.history.pushState) {
              window.history.pushState({}, '', '/blog');
            }
          }}
        />
        {showPinLoginModal && (
          <AdminPinModal
            rolesConfig={rolesConfig}
            onClose={() => setShowPinLoginModal(false)}
            onSuccessLogin={handleCustomLogin}
          />
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100 flex flex-col selection:bg-blue-600 selection:text-white">
      
      {/* Top Navbar */}
      <Navbar
        user={user}
        isGuest={isGuest}
        userRole={userRole}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filterFavorites={filterFavoritesOnly}
        onToggleFilterFavorites={() => setFilterFavoritesOnly((prev) => !prev)}
        favoritesCount={favorites.size}
        documentsCount={documents.length}
        totalQuota={totalQuotaCount}
        totalToolsCount={totalToolsCount}
        pendingVerificationCount={pendingVerificationCount}
        walletBalance={userWalletBalance}
        todayTraffic={userRole === 'admin' ? todayTraffic : null}
        currentView={currentView}
        onNavigateView={(v) => {
          setCurrentView(v);
          if (typeof window !== 'undefined' && window.history.pushState) {
            if (v === 'template_jurnal') window.history.pushState({}, '', '/template');
            else if (v === 'agc_blog') window.history.pushState({}, '', '/agc');
            else if (v === 'blog') window.history.pushState({}, '', '/blog');
            else window.history.pushState({}, '', '/');
          }
        }}
        onOpenBatchUpload={() => {
          if (userRole === 'admin') setShowBatchUploadModal(true);
        }}
        makalahCount={makalahPosts.length}
        agcPostsCount={agcPosts.length}
        onOpenAgcAutoPost={() => setShowAgcAutoPostModal(true)}
        onOpenTopUp={() => setShowTopUpModal(true)}
        onSignOut={handleSignOut}
        onOpenLogin={() => setIsGuest(false)}
        onOpenPinLogin={() => setShowPinLoginModal(true)}
        onOpenProfile={() => setShowProfileModal(true)}
        onOpenSettings={() => setShowSettingsModal(true)}
        onOpenRoleManagement={() => setShowRoleManagementModal(true)}
        onOpenAnalytics={() => setShowAnalyticsModal(true)}
        onOpenPriceManagement={() => setShowPriceManagementModal(true)}
        onOpenDocumentArchive={() => setShowDocumentArchiveModal(true)}
        onOpenVerification={() => setShowVerificationModal(true)}
        onOpenTrafficStats={userRole === 'admin' ? () => setShowTrafficStatsModal(true) : undefined}
      />

      {/* Guest Mode Banner */}
      {isGuest && !user && (
        <div className="bg-gradient-to-r from-blue-900/60 via-indigo-900/60 to-purple-900/60 border-b border-blue-500/30 px-4 py-2 text-center text-xs text-blue-200 flex flex-wrap items-center justify-center gap-2">
          <span>Anda sedang dalam <strong>Mode Tamu</strong>. Masuk atau daftarkan akun Mahasiswa untuk menyimpan kuota & riwayat naskah Anda.</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowPinLoginModal(true)}
              className="px-2.5 py-1 bg-amber-500 text-slate-950 rounded-lg font-black hover:bg-amber-400 transition-colors cursor-pointer text-[11px] flex items-center gap-1 shadow-sm"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Masuk PIN Admin</span>
            </button>
            <button
              onClick={() => setIsGuest(false)}
              className="px-2.5 py-1 bg-gradient-to-r from-indigo-500 to-emerald-500 hover:from-indigo-400 hover:to-emerald-400 text-white rounded-lg font-bold transition-all cursor-pointer text-[11px] shadow-sm"
            >
              Masuk / Daftar Akun
            </button>
          </div>
        </div>
      )}

      {/* Role Tier Status Banner (For Admin & Reseller) */}
      {user && userRole === 'admin' && (
        <div className="bg-gradient-to-r from-amber-950/90 via-amber-900/80 to-yellow-950/90 border-b border-amber-500/40 px-4 py-2 text-center text-xs text-amber-200 flex flex-wrap items-center justify-center gap-2">
          <Crown className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            Selamat Datang, <strong>Administrator ({user.email})</strong>. Akses <strong>100% Bebas</strong> untuk seluruh modul.
          </span>
          <button
            onClick={() => setShowRoleManagementModal(true)}
            className="px-2 py-0.5 rounded bg-amber-500/30 hover:bg-amber-500/40 text-amber-200 font-bold border border-amber-500/50 cursor-pointer text-[11px]"
          >
            Kelola Role Email
          </button>
          <button
            onClick={handleSignOut}
            title="Keluar dari Akun"
            className="px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/35 text-red-300 font-semibold border border-red-500/40 cursor-pointer text-[11px]"
          >
            Keluar Akun
          </button>
        </div>
      )}

      {user && userRole === 'reseller' && (
        <div className="bg-gradient-to-r from-blue-950/90 via-indigo-900/80 to-purple-950/90 border-b border-blue-500/40 px-4 py-2 text-center text-xs text-blue-200 flex flex-wrap items-center justify-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
          <span>
            Selamat Datang, Partner <strong>Reseller ({user.email})</strong>. Anda memiliki <strong>Free Trial 3x Per Item</strong> & Tarif Khusus <strong>Diskon {rolesConfig.resellerDiscountPercentage}% All Item</strong>.
          </span>
          <button
            onClick={() => setShowProfileModal(true)}
            className="px-2 py-0.5 rounded bg-blue-500/30 hover:bg-blue-500/45 text-cyan-200 font-bold border border-blue-500/50 cursor-pointer text-[11px]"
          >
            Info Akun Reseller
          </button>
          <button
            onClick={handleSignOut}
            title="Keluar dari Akun"
            className="px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/35 text-red-300 font-semibold border border-red-500/40 cursor-pointer text-[11px]"
          >
            Keluar Akun
          </button>
        </div>
      )}

      {/* Role Tier Status Banner (For Regular / Public Users) */}
      {user && userRole !== 'admin' && userRole !== 'reseller' && (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950/80 to-slate-900 border-b border-indigo-500/30 px-4 py-2 text-center text-xs text-slate-300 flex flex-wrap items-center justify-center gap-2">
          <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            Masuk sebagai: <strong className="text-white font-semibold">{user.email}</strong>
          </span>
          {userWalletBalance > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-bold text-[11px]">
              Saldo: Rp {userWalletBalance.toLocaleString('id-ID')}
            </span>
          )}
          <button
            onClick={() => setShowProfileModal(true)}
            className="px-2 py-0.5 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 font-bold border border-indigo-500/40 cursor-pointer text-[11px] transition-colors"
          >
            Status & Kuota
          </button>
          <button
            onClick={handleSignOut}
            title="Keluar dari Akun"
            className="px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/35 text-red-300 hover:text-red-100 font-bold border border-red-500/40 cursor-pointer text-[11px] flex items-center gap-1 transition-colors"
          >
            <LogOut className="w-3 h-3 text-red-400" />
            <span>Keluar Akun</span>
          </button>
        </div>
      )}

      {/* Abnormal Quota Detection & 1-Click Fix Banner */}
      {((userQuotas['art-1'] && userQuotas['art-1'] > 10) || Object.values(userQuotas).some((q) => typeof q === 'number' && q > 10)) && (
        <div className="bg-gradient-to-r from-amber-950 via-red-950 to-amber-950 border-b border-amber-500/50 px-4 py-2.5 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 animate-bounce" />
            <span>
              <strong>Perhatian Kuota:</strong> Terdeteksi kuota Generator Artikel berlebih ({userQuotas['art-1'] || Object.values(userQuotas).find(q => typeof q === 'number' && q > 10)}x Buat) akibat verifikasi berulang.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleCorrectToolQuota('art-1', 1)}
              className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-colors cursor-pointer shadow active:scale-95 whitespace-nowrap"
            >
              Koreksi Langsung Menjadi 1x Buat
            </button>
            {userRole === 'admin' && (
              <button
                onClick={() => setShowVerificationModal(true)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-colors cursor-pointer whitespace-nowrap"
              >
                Panel Kuota Admin
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Content: Template Jurnal Manager OR Blog AGC View OR Blog Makalah View OR Tools Hub */}
      {currentView === 'template_jurnal' ? (
        <TemplateJurnalManager
          userRole={userRole}
          userEmail={user?.email}
          onBackToHome={() => {
            setCurrentView('tools');
            if (typeof window !== 'undefined' && window.history.pushState) {
              window.history.pushState({}, '', '/');
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      ) : currentView === 'agc_blog' ? (
        <AgcBlogView
          posts={agcPosts}
          userRole={userRole}
          user={user}
          onRefreshPosts={async () => {
            const fresh = await fetchAgcPosts();
            setAgcPosts(fresh);
          }}
          onBackToTools={() => {
            setCurrentView('tools');
            if (typeof window !== 'undefined' && window.history.pushState) {
              window.history.pushState({}, '', '/');
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onNavigateToMakalahBlog={() => {
            setCurrentView('blog');
            if (typeof window !== 'undefined' && window.history.pushState) {
              window.history.pushState({}, '', '/blog');
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      ) : currentView === 'blog' ? (
        <MakalahBlogView
          posts={makalahPosts}
          userRole={userRole}
          user={user}
          selectedPost={selectedMakalah}
          initialShowAdminPanel={showMakalahAdmin}
          onOpenBatchUpload={() => {
            if (userRole === 'admin') setShowBatchUploadModal(true);
          }}
          onSelectPost={(post) => {
            setSelectedMakalah(post);
            if (typeof window !== 'undefined' && window.history.pushState) {
              window.history.pushState({}, '', `/makalah/${encodeURIComponent(post.slug || post.id)}`);
            }
          }}
          onClearSelectedPost={() => {
            setSelectedMakalah(null);
            if (typeof window !== 'undefined' && window.history.pushState) {
              window.history.pushState({}, '', '/blog');
            }
          }}
          onOpenLoginModal={() => {
            setIsGuest(false);
          }}
          onDeletePost={async (postId) => {
            await deleteMakalahPost(postId);
            setMakalahPosts(prev => prev.filter(p => p.id !== postId));
          }}
          onBackToTools={() => {
            setCurrentView('tools');
            if (typeof window !== 'undefined' && window.history.pushState) {
              window.history.pushState({}, '', '/');
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      ) : (
        <main className="max-w-6xl mx-auto px-4 py-6 space-y-6 w-full flex-1">
          {/* Quick Banner to Blog Makalah & Blog AGC */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/80 via-indigo-950/70 to-slate-900 border border-blue-500/30 flex flex-col lg:flex-row items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400 flex items-center justify-center shrink-0 shadow-inner">
                <Flame className="w-5 h-5 text-amber-400 fill-current" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-white">Repositori Blog Makalah & Blog AGC Otomatis</h3>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-black flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                    AGC VIRAL AKTIF
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Publikasi otomatis artikel viral & berita trending setiap hari tanpa perlu buat manual, plus repositori naskah makalah.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full lg:w-auto shrink-0 flex-wrap justify-end">
              {userRole === 'admin' && (
                <>
                  <button
                    onClick={() => {
                      setShowMakalahAdmin(true);
                      setCurrentView('blog');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="px-3 py-2 rounded-xl bg-amber-950/90 hover:bg-amber-900 border border-amber-500/40 text-amber-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                    title="Buka Panel Admin Blogspot"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Panel Blogspot</span>
                  </button>
                  <button
                    onClick={() => setShowBatchUploadModal(true)}
                    className="px-3 py-2 rounded-xl bg-blue-950/90 hover:bg-blue-900 border border-blue-500/40 text-blue-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>+ Batch Post Word</span>
                  </button>
                  <button
                    onClick={() => setShowAgcAutoPostModal(true)}
                    className="px-3 py-2 rounded-xl bg-gradient-to-r from-amber-600/90 to-orange-600/90 hover:from-amber-500 hover:to-orange-500 text-slate-950 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                    title="Generate & Post Berita Viral Hari Ini Otomatis"
                  >
                    <Zap className="w-3.5 h-3.5 text-slate-950 fill-current" />
                    <span>⚡ Auto Post AGC</span>
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  setCurrentView('agc_blog');
                  if (typeof window !== 'undefined' && window.history.pushState) {
                    window.history.pushState({}, '', '/agc');
                  }
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs shadow-md shadow-orange-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Flame className="w-3.5 h-3.5 fill-current text-slate-950" />
                <span>Blog AGC ({agcPosts.length})</span>
              </button>
              <button
                onClick={() => {
                  setCurrentView('template_jurnal');
                  if (typeof window !== 'undefined' && window.history.pushState) {
                    window.history.pushState({}, '', '/template');
                  }
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <FileCheck className="w-3.5 h-3.5" />
                <span>Template Artikel</span>
              </button>
              <button
                onClick={() => {
                  setShowMakalahAdmin(false);
                  setCurrentView('blog');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs shadow-md border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <span>Blog Makalah ({makalahPosts.length})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Hero Section */}
          <HeroSection 
            onExploreModules={() => {
              const el = document.getElementById('semua-modul');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            totalToolsCount={totalToolsCount}
          />

        {/* Live Web Traffic Stats Bar (Page Views & User Views per Day + 30-Day Recap) - Khusus Admin */}
        {userRole === 'admin' && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900/90 via-blue-950/40 to-slate-900/90 border border-blue-500/30 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl backdrop-blur-sm">
            <div className="flex items-center gap-3.5 w-full sm:w-auto">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400 flex items-center justify-center shrink-0 shadow-inner">
                <BarChart3 className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white tracking-wide">
                    Statistik Kunjungan & Pengunjung Web
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Live Hari Ini (Khusus Admin)
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  <strong className="text-blue-300 font-bold">{todayTraffic?.pageViews || 0}x Dibuka</strong> (Page Views) • <strong className="text-emerald-300 font-bold">{todayTraffic?.uniqueUsersCount || 0} Pengunjung</strong> (User Views)
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowTrafficStatsModal(true)}
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0 shadow-md shadow-blue-600/20 active:scale-95"
            >
              <BarChart3 className="w-4 h-4" />
              <span>Lihat Rekap 1 Bulan</span>
            </button>
          </div>
        )}

        {/* Fitur Isi Saldo Akun di Halaman Utama */}
        <WalletHomeBanner
          user={user}
          walletBalance={userWalletBalance}
          onOpenTopUp={(preset) => {
            setTopUpPresetAmount(preset);
            setShowTopUpModal(true);
          }}
          onOpenLogin={() => setIsGuest(false)}
        />

        {/* Loyalty Program Stamp Banner (Beli 3x Gratis 1x) */}
        {userRole === 'public' && (
          <LoyaltyBanner
            loyalty={loyalty}
            isLoggedIn={!!user}
            onOpenLogin={() => setIsGuest(false)}
            onOpenProfile={() => setShowProfileModal(true)}
          />
        )}

        {/* Classic Accordion Category List Section */}
        <section id="semua-modul" className="space-y-3.5">
          {filteredCategories.length > 0 ? (
            filteredCategories.map((category) => (
              <CategorySection
                key={category.id}
                category={category}
                isOpen={openSectionId === category.id}
                onToggle={handleToggleSection}
                favorites={favorites}
                getToolQuota={getToolQuota}
                getResellerTrialRemaining={getResellerTrialRemaining}
                userRole={userRole}
                discountPercentage={rolesConfig.resellerDiscountPercentage}
                freeRewardsAvailable={userRole === 'public' ? loyalty.freeRewardsAvailable : 0}
                isFreeTrialEligible={false}
                userId={user?.uid}
                onOpenTool={(tool) => setActiveTool(tool)}
                onToggleFavorite={handleToggleFavorite}
                onCheckoutRequest={(target) => setCheckoutTarget(target)}
                onClaimReward={handleClaimLoyaltyReward}
              />
            ))
          ) : (
            <div className="p-8 text-center rounded-3xl bg-[#141c2e] border border-gray-800 text-gray-400">
              <p className="font-semibold text-white">Tidak ada modul yang cocok dengan pencarian</p>
              <p className="text-xs mt-1">Coba gunakan kata kunci lain</p>
            </div>
          )}
        </section>

        {/* Trust Badges */}
        <TrustBadges />
      </main>
      )}

      {/* Footer */}
      <Footer />


      {/* Floating WhatsApp Support Widget */}
      <WhatsAppSupportWidget user={user} />

      {/* Fullscreen In-App Viewer Modal */}
      <ToolViewerModal
        tool={activeTool}
        quota={activeTool ? getToolQuota(activeTool) : 0}
        userRole={userRole}
        resellerTrialRemaining={activeTool ? getResellerTrialRemaining(activeTool.id) : 0}
        userId={user?.uid}
        onClose={() => setActiveTool(null)}
        onFinishCreation={handleConsumeQuota}
      />

      {/* 1x Free Trial Anti-Abuse Claim & Diagnostics Modal */}
      <FreeTrialClaimModal
        isOpen={showFreeTrialModal}
        tool={freeTrialTargetTool}
        status={freeTrialStatus}
        freeTrialStatus={freeTrialStatus}
        user={user}
        isChecking={isCheckingTrialEligibility}
        onClose={() => setShowFreeTrialModal(false)}
        onClaimTrial={handleClaimFreeTrial}
        onClaim={handleClaimFreeTrial}
        onRefreshStatus={checkFreeTrialEligibility}
        onOpenCheckout={(tool) => {
          setCheckoutTarget({
            type: 'tool',
            id: tool.id,
            title: `1x Pembuatan: ${tool.title}`,
            subtitle: `Pembayaran & kuota khusus untuk link ini (${tool.title}) — Dihitung per tiap link`,
            priceRp: tool.priceRp,
            badge: tool.badge
          });
        }}
      />

      {/* Manual QRIS & Bank Transfer Checkout Modal */}
      <ManualQrisPaymentModal
        target={checkoutTarget}
        user={user}
        userRole={userRole}
        discountPercentage={rolesConfig.resellerDiscountPercentage}
        paymentConfig={paymentConfig}
        loyalty={loyalty}
        resellerTrialRemaining={checkoutTarget && checkoutTarget.type === 'tool' ? getResellerTrialRemaining(checkoutTarget.id) : 0}
        userWalletBalance={userWalletBalance}
        onOpenTopUp={() => setShowTopUpModal(true)}
        onPayWithWallet={handlePayWithWallet}
        onClose={() => setCheckoutTarget(null)}
        onPaymentSuccess={handlePaymentSuccess}
        onUseFreeReward={handleUseFreeRewardFromCheckout}
        onUseResellerTrial={handleUseResellerTrialFromCheckout}
      />

      {/* User Profile Modal */}
      {showProfileModal && (
        <UserProfileModal
          user={user}
          userRole={userRole}
          discountPercentage={rolesConfig.resellerDiscountPercentage}
          favoritesCount={favorites.size}
          documentsCount={documents.length}
          quotas={userQuotas}
          purchases={purchases}
          loyalty={loyalty}
          resellerTrials={resellerTrials}
          walletBalance={userWalletBalance}
          onOpenTopUp={() => setShowTopUpModal(true)}
          onClose={() => setShowProfileModal(false)}
          onSignOut={handleSignOut}
          onOpenDocumentArchive={() => {
            setShowProfileModal(false);
            setShowDocumentArchiveModal(true);
          }}
        />
      )}

      {/* Admin Analytics Dashboard Modal */}
      <AdminAnalyticsModal
        purchases={allPurchasesForAdmin.length > 0 ? allPurchasesForAdmin : purchases}
        categories={categories}
        rolesConfig={rolesConfig}
        isOpen={showAnalyticsModal}
        onClose={() => setShowAnalyticsModal(false)}
        onRefresh={handleRefreshAdminAnalytics}
      />

      {/* Admin Manual Transfer & QRIS Verification Modal */}
      <AdminVerificationModal
        isOpen={showVerificationModal}
        onClose={() => setShowVerificationModal(false)}
        purchases={allPurchasesForAdmin}
        categories={categories}
        rolesConfig={rolesConfig}
        currentUserEmail={user?.email}
        currentUserId={user?.uid}
        currentQuotas={userQuotas}
        onUpdateCurrentQuotas={(newQuotas) => {
          setUserQuotas(newQuotas);
          if (user?.uid) {
            localStorage.setItem(`zain_quotas_${user.uid}`, JSON.stringify(newQuotas));
          } else {
            localStorage.setItem('zain_guest_quotas', JSON.stringify(newQuotas));
          }
        }}
        onRefresh={handleRefreshAdminAnalytics}
        onApproveSuccess={() => {
          handleRefreshAdminAnalytics();
        }}
        onSaveRolesConfig={handleSaveRolesConfig}
        onOpenTrafficStats={() => setShowTrafficStatsModal(true)}
      />

      {/* 30-Day Web Traffic & Visitor Analytics Modal (Khusus Admin) */}
      <TrafficStatsModal
        isOpen={showTrafficStatsModal && userRole === 'admin'}
        onClose={() => setShowTrafficStatsModal(false)}
        currentUser={user}
        isAdmin={userRole === 'admin'}
        userRole={userRole}
      />

      {/* Dynamic Price Management Modal (Admin) */}
      <PriceManagementModal
        categories={categories}
        currentPrices={customPrices}
        isOpen={showPriceManagementModal}
        onClose={() => setShowPriceManagementModal(false)}
        onSavePrices={handleSaveCustomPrices}
      />

      {/* User Document & Work History Archive Modal */}
      <DocumentArchiveModal
        documents={documents}
        isOpen={showDocumentArchiveModal}
        onClose={() => setShowDocumentArchiveModal(false)}
        onSaveDocument={handleSaveDocument}
        onDeleteDocument={handleDeleteDocument}
      />

      {/* Reward Celebration Modal (When 3rd purchase completed) */}
      <RewardCelebrationModal
        isOpen={showRewardCelebration}
        totalFreeEarned={loyalty.totalFreeEarned}
        onClose={() => setShowRewardCelebration(false)}
      />

      {/* Manual QRIS & Bank Account Settings Modal */}
      {showSettingsModal && (
        <ManualQrisSettingsModal
          config={paymentConfig}
          onClose={() => setShowSettingsModal(false)}
          onSaveConfig={handleSavePaymentConfig}
        />
      )}

      {/* Admin Role Management Modal */}
      {showRoleManagementModal && (
        <RoleManagementModal
          currentConfig={rolesConfig}
          currentUserEmail={user?.email}
          onClose={() => setShowRoleManagementModal(false)}
          onSaveConfig={handleSaveRolesConfig}
        />
      )}

      {/* Top Up Saldo Akun Modal */}
      <TopUpModal
        isOpen={showTopUpModal}
        onClose={() => {
          setShowTopUpModal(false);
          setTopUpPresetAmount(undefined);
        }}
        user={user}
        currentBalance={userWalletBalance}
        paymentConfig={paymentConfig}
        initialAmount={topUpPresetAmount}
        onTopUpSuccess={(newBal) => {
          setUserWalletBalance(newBal);
        }}
        onOpenLogin={() => setIsGuest(false)}
      />

      {/* Admin PIN & Custom Auth Modal */}
      {showPinLoginModal && (
        <AdminPinModal
          rolesConfig={rolesConfig}
          onClose={() => setShowPinLoginModal(false)}
          onSuccessLogin={handleCustomLogin}
        />
      )}

      {/* Makalah Batch Word Upload Modal (AI Auto-Extraction & Generation) - Admin Only */}
      {userRole === 'admin' && (
        <MakalahBatchUploadModal
          isOpen={showBatchUploadModal}
          userRole={userRole}
          existingPosts={makalahPosts}
          onClose={() => setShowBatchUploadModal(false)}
          onSuccessPublished={async () => {
            const fresh = await fetchMakalahPosts();
            setMakalahPosts(fresh);
            setCurrentView('blog');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}

      {/* Auto Post AGC Controller Modal */}
      <AgcAutoPostModal
        isOpen={showAgcAutoPostModal}
        onClose={() => setShowAgcAutoPostModal(false)}
        onPostsGenerated={(newPosts) => {
          setAgcPosts(prev => [...newPosts, ...prev.filter(p => !newPosts.some(n => n.id === p.id))]);
        }}
        onNavigateToAgcBlog={() => {
          setShowAgcAutoPostModal(false);
          setCurrentView('agc_blog');
          if (typeof window !== 'undefined' && window.history.pushState) {
            window.history.pushState({}, '', '/agc');
          }
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        totalAgcPostsCount={agcPosts.length}
      />

    </div>
  );
}
