export interface FootnoteItem {
  id: string;
  number: number;
  text: string;
  sectionId?: string;
  anchorWord?: string;
}

export interface JournalMetadata {
  judul: string;
  judulEnglish?: string;
  nama: string;
  nim?: string;
  bulanTahun?: string;
  prodi: string;
  email: string;
  instansi?: string;
}

export interface JournalAbstract {
  abstrakIndo: string;
  keywordsIndo: string[];
  abstrakEnglish: string;
  keywordsEnglish: string[];
}

export interface JournalArticle {
  extractive?: boolean;
  id: string;
  createdAt: string;
  metadata: JournalMetadata;
  abstract: JournalAbstract;
  pendahuluan: string;
  metode: string;
  hasil: string;
  pembahasan: string;
  kesimpulan: string;
  daftarPustaka: string[];
  footnotes: FootnoteItem[];
}

export interface SkripsiInput {
  rawText: string;
  sourceFootnotes?: Record<string, string>;
  fileName?: string;
  fileSize?: number;
  metadata: JournalMetadata;
  targetLengthPages?: number;
  footnoteStyle: 'chicago' | 'apa' | 'custom_footnote';
  selectedModel?: string;
}
