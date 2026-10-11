export interface ConvertedPdfPage {
  dataUrl: string;
  blob: Blob;
  file: File;
  width: number;
  height: number;
  pageNumber: number;
  fileName: string;
  originalFileName: string;
  extractedText?: string;
  isStnk?: boolean;
  isKtp?: boolean;
}

const PDFJS_CDNS = [
  {
    lib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  },
  {
    lib: 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js',
    worker: 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
  },
  {
    lib: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
    worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
  },
];

async function loadPdfJsLibrary(): Promise<any> {
  const win = window as any;
  if (win.pdfjsLib) return win.pdfjsLib;

  let lastError: Error | null = null;
  for (const cdn of PDFJS_CDNS) {
    try {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = cdn.lib;
        script.crossOrigin = 'anonymous';
        script.onload = () => {
          if (win.pdfjsLib) {
            win.pdfjsLib.GlobalWorkerOptions.workerSrc = cdn.worker;
            resolve();
          } else {
            reject(new Error('pdfjsLib is undefined'));
          }
        };
        script.onerror = () => reject(new Error(`Failed to load ${cdn.lib}`));
        document.head.appendChild(script);
      });
      return win.pdfjsLib;
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error('Semua sumber CDN PDF.js gagal dimuat');
}

/**
 * Deteksi pintar dokumen STNK / TBPKP / Pajak Kendaraan Bermotor
 * Berdasarkan nama berkas, teks OCR / teks PDF, serta rasio aspek dokumen asli
 */
export function detectIsStnk(fileName = '', text = '', width = 0, height = 0): boolean {
  const name = fileName.toLowerCase();
  const upperText = (text || '').toUpperCase();

  // 1. Cek nama berkas (seperti ETBPKP_M_5957_AX_2027.pdf, STNK.pdf, scan_tbpkp.jpg, pajak_stnk.pdf, dll.)
  const namePatterns = [
    'stnk',
    'etbpkp',
    'tbpkp',
    'pkb',
    'samsat',
    'pajak_motor',
    'pajak_mobil',
    'pajak_kendaraan',
    'swdkllj',
    'pnbp_stnk',
    'pembayaran_pajak',
    'kendaraan',
    'surat_tanda_nomor',
    'tanda_nomor_kendaraan',
    'bpkb',
    'pajak',
    'plat',
    'motor',
    'mobil',
  ];
  if (namePatterns.some((pattern) => name.includes(pattern))) {
    return true;
  }

  // 2. Cek teks dokumen di dalam PDF / OCR
  const textKeywords = [
    'SURAT TANDA NOMOR KENDARAAN',
    'PELUNASAN KEWAJIBAN PEMBAYARAN',
    'TANDA BUKTI PELUNASAN',
    'SURAT KETETAPAN PAJAK DAERAH',
    'SKPD',
    'SWDKLLJ',
    'BBNKB',
    'PNBP STNK',
    'SAMSAT',
    'NOMOR REGISTER',
    'NO. KOHIR',
    'JUMLAH BAYAR',
    'BIAYA PNBP',
    'TNKB',
    'OPSEN PKB',
    'NOMOR POLISI',
    'NO. POLISI',
    'NOMOR RANGKA',
    'NOMOR MESIN',
    'MEREK / TYPE',
    'MEREK/TYPE',
    'JENIS / MODEL',
    'TAHUN PEMBUATAN',
    'WARNA TNKB',
    'BAHAN BAKAR',
    'KEPOLISIAN DAERAH',
    'KORLANTAS',
    'DITLANTAS',
    'SUBDIT REGIDENT',
  ];
  if (textKeywords.some((kw) => upperText.includes(kw))) {
    return true;
  }

  // 3. Cek rasio aspek (dokumen STNK lembaran biasanya rasio lebar:tinggi ~2.2 s/d ~3.4)
  if (width > 0 && height > 0) {
    const ratio = Math.max(width, height) / Math.min(width, height);
    if (ratio >= 2.0 && ratio <= 3.5) {
      return true;
    }
  }

  return false;
}

/**
 * Deteksi dokumen KTP Republik Indonesia
 */
export function detectIsKtp(fileName = '', text = '', width = 0, height = 0): boolean {
  const name = fileName.toLowerCase();
  const upperText = (text || '').toUpperCase();

  if (name.includes('ktp') || name.includes('nik') || name.includes('e-ktp')) {
    return true;
  }

  const ktpKeywords = [
    'KARTU TANDA PENDUDUK',
    'REPUBLIK INDONESIA',
    'PROVINSI',
    'NIK',
    'GOL. DARAH',
    'AGAMA',
    'STATUS PERKAWINAN',
    'KEWARGANEGARAAN',
  ];
  if (ktpKeywords.some((kw) => upperText.includes(kw))) {
    return true;
  }

  if (width > 0 && height > 0) {
    const ratio = Math.max(width, height) / Math.min(width, height);
    // KTP aspect ratio 85.6 / 54 ≈ 1.585
    if (ratio >= 1.45 && ratio <= 1.75 && (name.includes('identitas') || name.includes('card') || name.includes('kartu'))) {
      return true;
    }
  }

  return false;
}

export async function convertPdfToJpgPages(
  file: File,
  quality = 0.94,
  scale = 2.5,
  onProgress?: (msg: string) => void
): Promise<ConvertedPdfPage[]> {
  try {
    if (typeof window === 'undefined') return [];

    onProgress?.(`Menyiapkan mesin pembaca PDF untuk "${file.name}"...`);
    const pdfjsLib = await loadPdfJsLibrary();

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages: ConvertedPdfPage[] = [];
    const baseName = file.name.replace(/\.pdf$/i, '').trim();

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      onProgress?.(`Membaca teks & mengonversi halaman ${pageNum} dari ${pdf.numPages} ke JPG...`);
      const page = await pdf.getPage(pageNum);

      // Extract text content from the page for automatic document detection (STNK, KTP, etc.)
      let extractedText = '';
      try {
        const textContent = await page.getTextContent();
        extractedText = textContent.items.map((it: any) => it.str || '').join(' ');
      } catch (e) {
        console.warn('Gagal mengekstrak teks PDF:', e);
      }

      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      // Solid white background to prevent dark or transparent rendering
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport }).promise;

      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const blob = await new Promise<Blob>((res) => {
        canvas.toBlob((b) => res(b || new Blob()), 'image/jpeg', quality);
      });

      const jpgFileName = pdf.numPages === 1 
        ? `${baseName}.jpg` 
        : `${baseName}_hal_${pageNum}.jpg`;
      const jpgFile = new File([blob], jpgFileName, { type: 'image/jpeg' });

      const isStnk = detectIsStnk(file.name, extractedText, canvas.width, canvas.height);
      const isKtp = detectIsKtp(file.name, extractedText, canvas.width, canvas.height);

      pages.push({
        dataUrl,
        blob,
        file: jpgFile,
        width: canvas.width,
        height: canvas.height,
        pageNumber: pageNum,
        fileName: jpgFileName,
        originalFileName: file.name,
        extractedText,
        isStnk,
        isKtp,
      });
    }

    return pages;
  } catch (error) {
    console.warn('PDF to JPG conversion error:', error);
    return [];
  }
}
