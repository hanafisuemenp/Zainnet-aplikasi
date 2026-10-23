import * as pdfjsLib from 'pdfjs-dist';
import { PageTextInfo } from '../types';

// Set up worker for pdfjs
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

/**
 * Extract text from every page of a PDF ArrayBuffer or Uint8Array.
 * If text extraction yields < 15 chars on a page, attempts Tesseract OCR if available.
 */
export async function extractPdfText(
  pdfBuffer: ArrayBuffer,
  onProgress?: (current: number, total: number) => void
): Promise<{ pages: PageTextInfo[]; pdfDoc: pdfjsLib.PDFDocumentProxy }> {
  // Use a sliced copy to prevent pdfjs web worker from detaching the master ArrayBuffer
  const bufferCopy = pdfBuffer.slice(0);
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bufferCopy) });
  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;
  const pages: PageTextInfo[] = [];

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    let text = textContent.items
      .map((item: any) => item.str)
      .join(' ')
      .trim();

    let isOcr = false;

    // If text is extremely short (scanned PDF page)
    if (text.length < 15) {
      try {
        // Attempt fast OCR with Tesseract if window.Tesseract is loaded or import
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
          const { createWorker } = await import('tesseract.js');
          const worker = await createWorker('ind');
          const ret = await worker.recognize(canvas.toDataURL('image/png'));
          await worker.terminate();
          if (ret.data.text && ret.data.text.trim().length > text.length) {
            text = ret.data.text.trim();
            isOcr = true;
          }
        }
      } catch (ocrErr) {
        console.warn(`OCR fallback skipped on page ${i}:`, ocrErr);
      }
    }

    pages.push({
      pageNumber: i,
      text,
      isOcr,
    });

    if (onProgress) {
      onProgress(i, totalPages);
    }
  }

  return { pages, pdfDoc };
}

/**
 * Force High-Precision OCR re-scan on all pages of a PDF buffer using Tesseract.js.
 * High scale (2.0) renders crisp canvas images for maximum OCR accuracy on old scanned PDFs.
 */
export async function forceHighPrecisionOcr(
  pdfBuffer: ArrayBuffer,
  onProgress?: (current: number, total: number) => void
): Promise<PageTextInfo[]> {
  const bufferCopy = pdfBuffer.slice(0);
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bufferCopy) });
  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;
  const pages: PageTextInfo[] = [];

  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('ind');

  try {
    for (let i = 1; i <= totalPages; i++) {
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 }); // 2.0 scale for crisp OCR
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      let ocrText = '';
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
        
        const dataUrl = canvas.toDataURL('image/png');
        const ret = await worker.recognize(dataUrl);
        if (ret.data.text) {
          ocrText = ret.data.text.trim();
        }
      }

      pages.push({
        pageNumber: i,
        text: ocrText,
        isOcr: true,
      });

      if (onProgress) {
        onProgress(i, totalPages);
      }
    }
  } finally {
    await worker.terminate();
  }

  return pages;
}

/**
 * Determine scan quality status of extracted pages
 */
export function getScanQualityStatus(pages: PageTextInfo[], isDocx = false, isImage = false): {
  status: 'digital_pdf' | 'scanned_pdf' | 'docx_word' | 'image_file';
  label: string;
  description: string;
  ocrPageCount: number;
} {
  if (isDocx) {
    return {
      status: 'docx_word',
      label: 'Naskah Word (.docx)',
      description: 'Struktur teks digital 100% presisi sempurna.',
      ocrPageCount: 0,
    };
  }

  if (isImage) {
    return {
      status: 'image_file',
      label: 'Dokumen Gambar (JPG/PNG)',
      description: 'Diolah via Full High-Precision OCR Tesseract.',
      ocrPageCount: pages.length,
    };
  }

  const ocrPages = pages.filter(p => p.isOcr || (p.text && p.text.length < 30));
  const ocrCount = ocrPages.length;

  if (ocrCount > 0 || pages.length === 0) {
    return {
      status: 'scanned_pdf',
      label: 'PDF Hasil Scan / Gambar OCR',
      description: `${ocrCount} dari ${pages.length} halaman terdeteksi hasil scan/fotokopi.`,
      ocrPageCount: ocrCount,
    };
  }

  return {
    status: 'digital_pdf',
    label: 'PDF Digital Native',
    description: 'Teks digital jernih. Presisi deteksi bab sangat tinggi.',
    ocrPageCount: 0,
  };
}

/**
 * Render a page to an image Data URL for thumbnails
 */
export async function renderPageToDataUrl(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  scale = 0.5
): Promise<string> {
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
  return canvas.toDataURL('image/jpeg', 0.8);
}
