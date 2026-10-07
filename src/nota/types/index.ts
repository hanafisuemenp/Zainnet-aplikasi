export interface FacultyData {
  id: string;
  name: string;
  code: string;
  defaultCoverColor: string;
  prodis: string[];
}

export type DurationKey = '1_day' | '2_day' | '3_day';

export interface DurationOption {
  key: DurationKey;
  label: string;
  days: number;
  pricePerCover: number;
  tag: string;
  description: string;
}

export interface ExtraServiceOption {
  id: string;
  label: string;
  price: number;
  requiresFile: boolean;
  description: string;
  badge?: string;
  promoTag?: string;
  // Specific prodi filters
  allowedProdiKeywords?: string[];
  specialProdiNote?: string;
}

export interface UploadedFileInfo {
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
  serviceCategory: string;
  dataUrl?: string;
}

export type TransactionStatus = 'Bayar Sekarang' | 'DP' | 'LUNAS' | 'Bayar Nanti';

export type CoverType = 'hard_cover' | 'soft_cover';

export interface OrderRecord {
  orderId: string;
  studentName: string;
  university?: string;
  isCustomUniversity?: boolean;
  fakultas: string;
  isCustomFaculty?: boolean;
  prodi: string;
  isCustomProdi?: boolean;
  coverColor: string;
  isCustomCoverColor?: boolean;
  coverHex?: string;
  whatsapp: string;
  coverType?: CoverType;
  coverCount: number;
  durationKey: DurationKey;
  durationLabel: string;
  durationDays: number;
  pricePerCover: number;
  coversSubtotal: number;
  isCompletePackage?: boolean;
  extraCoversAdded?: number;
  selectedServices: string[];
  servicesBreakdown: Array<{
    id: string;
    label: string;
    price: number;
  }>;
  servicesSubtotal: number;
  printCost?: number;
  totalCost: number;
  fileDeliveryMethod?: 'upload_server' | 'whatsapp_only';
  orderDate: string; // YYYY-MM-DD HH:mm
  pickupDate: string; // YYYY-MM-DD HH:mm
  uploadedFiles: UploadedFileInfo[];
  status: 'Menunggu' | 'Proses Jilid' | 'Siap Diambil' | 'Selesai';
  // Receipt Image (PNG) for WhatsApp sharing & offline check
  receiptImageUrl?: string;
  receiptImageFullUrl?: string;
  receiptPngGeneratedAt?: string;
  // Transaction and Payment specifications
  transactionStatus: TransactionStatus;
  paymentChannel?: 'Cash' | 'Transfer';
  dpAmount: number;
  remainingAmount: number;
  adminConfirmed: boolean;
  adminConfirmedAt?: string;
  adminConfirmedBy?: string;
  createdAt: number;
}

// =========================================================================
// AGC SEO & BLOG TYPES
// =========================================================================
export type AgcSearchIntent =
  | 'Informational'
  | 'Commercial'
  | 'Commercial Investigation'
  | 'Transactional'
  | 'Navigational'
  | 'Tutorial / How-to'
  | string;

export interface AgcTableOfContentsItem {
  id: string;
  title: string;
  level: number;
}

export interface AgcFaqItem {
  question: string;
  answer: string;
}

export interface AgcQualityGate {
  contentDepthScore: number;
  searchIntentScore: number;
  readabilityScore: number;
  originalityScore: number;
  topicCoverageScore: number;
  overallQuality: 'EXEMPLARY' | 'PASSED_HIGH_STANDARD' | 'OPTIMIZED' | string;
  verifiedHumanReadable: boolean;
  passedRulesCount: number;
}

export interface AgcPost {
  id: string;
  title: string;
  slug: string;
  category: string;
  metaTitle: string;
  metaDescription: string;
  searchIntent: AgcSearchIntent;
  excerpt: string;
  coverImageUrl: string;
  imageAltText?: string;
  author: string;
  readingTimeMinutes?: number;
  wordCount?: number;
  isTrendingToday?: boolean;
  trendScore?: number;
  status?: string;
  views?: number;
  viewsCount?: number;
  publishedDate?: string;
  contentHtml?: string;
  tableOfContents?: AgcTableOfContentsItem[];
  faqs?: AgcFaqItem[];
  faqList?: AgcFaqItem[];
  qualityGate?: AgcQualityGate;
  tags?: string[];
  sourceReference?: string;
  publishedAt?: string | number;
  createdAt?: string | number;
  updatedAt?: string | number;
  featured?: boolean;
  [key: string]: any;
}
