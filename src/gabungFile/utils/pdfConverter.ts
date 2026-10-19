/**
 * Utility for converting uploaded PDF documents to high-resolution JPG images
 * Used for merging PDF attachments (Surat Tugas, Surat Izin, Surat Keaslian, etc.) into Word documents
 */

export interface ConvertedPdfPageResult {
  file: File;
  dataUrl: string;
  width: number;
  height: number;
  pageNumber: number;
  totalPdfPages: number;
  originalPdfName: string;
}

export function isPdfFile(file: File): boolean {
  if (!file) return false;
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

const PDFJS_CDNS = [
  {
    lib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
  },
  {
    lib: 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js',
    worker: 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
  },
  {
    lib: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
    worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
  }
];

async function loadPdfJsLibrary(): Promise<any> {
  const win = window as any;
  if (win.pdfjsLib) return win.pdfjsLib;

  let lastError: Error | null = null;
  for (const cdn of PDFJS_CDNS) {
    try {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        const timeout = setTimeout(() => {
          script.onerror = null;
          script.onload = null;
          reject(new Error(`Timeout loading ${cdn.lib}`));
        }, 3500);

        script.src = cdn.lib;
        script.crossOrigin = 'anonymous';
        script.onload = () => {
          clearTimeout(timeout);
          if (win.pdfjsLib) {
            win.pdfjsLib.GlobalWorkerOptions.workerSrc = cdn.worker;
            resolve();
          } else {
            reject(new Error('pdfjsLib is undefined'));
          }
        };
        script.onerror = () => {
          clearTimeout(timeout);
          reject(new Error(`Failed to load ${cdn.lib}`));
        };
        document.head.appendChild(script);
      });
      return win.pdfjsLib;
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error('Semua sumber CDN PDF.js gagal dimuat');
}

export async function convertPdfToJpgPages(
  file: File,
  options?: {
    quality?: number;
    scale?: number;
    onProgress?: (status: string) => void;
  }
): Promise<ConvertedPdfPageResult[]> {
  const quality = options?.quality ?? 0.94;
  const scale = options?.scale ?? 2.4; // 2.4x scale produces ~200-300 DPI clarity for printed A4 documents
  const onProgress = options?.onProgress;

  if (typeof window === 'undefined') return [];

  onProgress?.(`Menyiapkan pembaca PDF untuk "${file.name}"...`);
  const pdfjsLib = await loadPdfJsLibrary();

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  const results: ConvertedPdfPageResult[] = [];
  const baseName = file.name.replace(/\.pdf$/i, '').trim();

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.(`Mengonversi halaman ${pageNum} dari ${totalPages} pada "${file.name}" ke JPG...`);
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Gagal membuat context canvas untuk render PDF');
    }

    // Render with white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport: viewport,
    }).promise;

    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', quality);
    });

    // Meaningful naming: single page preserves original base name, multi-page appends page index
    const jpgFileName = totalPages === 1 
      ? `${baseName}.jpg` 
      : `${baseName}_hal_${pageNum}.jpg`;

    const jpgFile = new File([blob], jpgFileName, {
      type: 'image/jpeg',
      lastModified: Date.now()
    });

    results.push({
      file: jpgFile,
      dataUrl,
      width: canvas.width,
      height: canvas.height,
      pageNumber: pageNum,
      totalPdfPages: totalPages,
      originalPdfName: file.name
    });
  }

  return results;
}
