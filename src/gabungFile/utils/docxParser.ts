/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import JSZip from 'jszip';
import { DocxAnalysis, DocxElement, TargetDocument, AnchorKeywordMatch } from '../types/skripsi';

export const STANDARD_SIGNED_PAGES = [
  {
    id: 'persetujuan',
    title: 'Halaman Persetujuan',
    captionTitle: 'Halaman Persetujuan',
    category: 'signed_page' as const,
    standardOrder: 1,
    keywords: [
      'HALAMAN PERSETUJUAN',
      'LEMBAR PERSETUJUAN',
      'PERSETUJUAN PEMBIMBING',
      'PERSETUJUAN SKRIPSI',
      'HALAMAN PERSETUJUAN SKRIPSI',
      'LEMBAR PERSETUJUAN SKRIPSI',
      'TANDA PERSETUJUAN',
      'TANDA PERSETUJUAN SKRIPSI',
      'PERSETUJUAN',
    ],
  },
  {
    id: 'pengesahan',
    title: 'Halaman Pengesahan',
    captionTitle: 'Halaman Pengesahan',
    category: 'signed_page' as const,
    standardOrder: 2,
    keywords: [
      'HALAMAN PENGESAHAN',
      'LEMBAR PENGESAHAN',
      'PENGESAHAN TIM PENGUJI',
      'PENGESAHAN DEWAN PENGUJI',
      'PENGESAHAN MAJELIS PENGUJI',
      'PENGESAHAN PANITIA UJIAN',
      'PENGESAHAN UJIAN SKRIPSI',
      'PENGESAHAN SKRIPSI',
      'HALAMAN PENGESAHAN SKRIPSI',
      'LEMBAR PENGESAHAN SKRIPSI',
      'TANDA PENGESAHAN',
      'TANDA PENGESAHAN SKRIPSI',
      'SURAT PENGESAHAN',
      'DEWAN PENGUJI',
      'TIM PENGUJI',
      'PANITIA PENGUJI',
      'MAJELIS PENGUJI',
      'TELAH DIPERTAHANKAN DI DEPAN',
      'PENGESAHAN KELULUSAN',
      'LEMBAR PERSETUJUAN DAN PENGESAHAN',
      'PENGESAHAN',
    ],
  },
  {
    id: 'keaslian',
    title: 'Surat Pernyataan Keaslian Tulisan',
    captionTitle: 'Surat Pernyataan Keaslian Tulisan',
    category: 'signed_page' as const,
    standardOrder: 3,
    keywords: [
      'PERNYATAAN KEASLIAN TULISAN',
      'SURAT PERNYATAAN KEASLIAN',
      'PERNYATAAN KEASLIAN',
      'SURAT PERNYATAAN BUKAN PLAGIAT',
      'KEASLIAN TULISAN',
      'SURAT PERNYATAAN KEASLIAN TULISAN',
    ],
  },
];

export const STANDARD_5_ATTACHMENTS = [
  {
    id: 'surat_tugas',
    title: 'Surat Tugas Pembimbing',
    captionTitle: 'Surat Tugas Pembimbing',
    category: 'attachment_5' as const,
    standardOrder: 4,
    keywords: [
      'SURAT TUGAS PEMBIMBING',
      'SURAT TUGAS BIMBINGAN',
      'TUGAS PEMBIMBING',
      'SURAT TUGAS',
      'SK PEMBIMBING',
      'LAMPIRAN 4 SURAT TUGAS',
      'LAMPIRAN 4',
      'SURAT PENUGASAN PEMBIMBING',
      'PENUGASAN PEMBIMBING',
    ],
  },
  {
    id: 'kartu_bimbingan_depan',
    title: 'Kartu Bimbingan Halaman Depan',
    captionTitle: 'Kartu Bimbingan - Halaman Depan (Nama, NIM, Fakultas, Prodi)',
    category: 'attachment_5' as const,
    standardOrder: 5,
    keywords: ['KARTU BIMBINGAN', 'KARTU KONSULTASI BIMBINGAN', 'LEMBAR BIMBINGAN', 'LAMPIRAN 5'],
  },
  {
    id: 'kartu_bimbingan_belakang',
    title: 'Kartu Bimbingan Halaman Belakang',
    captionTitle: 'Kartu Bimbingan - Halaman Belakang (Catatan Konsultasi & Paraf)',
    category: 'attachment_5' as const,
    standardOrder: 6,
    keywords: ['KARTU BIMBINGAN HALAMAN BELAKANG', 'KARTU BIMBINGAN BELAKANG', 'KARTU BIMBINGAN HALAMAN 2'],
  },
  {
    id: 'izin_penelitian',
    title: 'Surat Permohonan Izin Penelitian',
    captionTitle: 'Surat Permohonan Izin Penelitian',
    category: 'attachment_5' as const,
    standardOrder: 7,
    keywords: [
      'SURAT PERMOHONAN IZIN PENELITIAN',
      'SURAT IZIN PENELITIAN',
      'PERMOHONAN IZIN PENELITIAN',
      'IZIN PENELITIAN',
      'LAMPIRAN 6',
    ],
  },
  {
    id: 'telah_meneliti',
    title: 'Surat Keterangan Telah Meneliti',
    captionTitle: 'Surat Keterangan Telah Meneliti',
    category: 'attachment_5' as const,
    standardOrder: 8,
    keywords: [
      'SURAT KETERANGAN TELAH MENELITI',
      'KETERANGAN TELAH MENELITI',
      'TELAH SELESAI MENELITI',
      'SURAT SELESAI PENELITIAN',
      'LAMPIRAN 7',
    ],
  },
  {
    id: 'bebas_plagiasi',
    title: 'Surat Keterangan Bebas Plagiasi',
    captionTitle: 'Surat Keterangan Bebas Plagiasi',
    category: 'attachment_5' as const,
    standardOrder: 9,
    keywords: [
      'SURAT KETERANGAN BEBAS PLAGIASI',
      'BEBAS PLAGIARISME',
      'BEBAS PLAGIASI',
      'HASIL CEK PLAGIASI',
      'SURAT BEBAS PLAGIASI',
      'LAMPIRAN 8',
    ],
  },
];

export const ALL_STANDARD_SPECS = [...STANDARD_SIGNED_PAGES, ...STANDARD_5_ATTACHMENTS];

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function extractTextFromXml(xml: string): string {
  const textMatches = xml.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g) || [];
  const text = textMatches
    .map((m) => {
      const inside = m.replace(/<[^>]+>/g, '');
      return decodeXmlEntities(inside);
    })
    .join('');
  return text.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
}

export function matchesKeywords(text: string, keywords: string[]): boolean {
  const upper = text.toUpperCase().replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
  const unspaced = upper.replace(/[^A-Z0-9]/g, '');

  return keywords.some((kw) => {
    const kwUpper = kw.toUpperCase().replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
    if (upper.includes(kwUpper)) return true;
    const kwUnspaced = kwUpper.replace(/[^A-Z0-9]/g, '');
    if (kwUnspaced.length >= 4 && unspaced.includes(kwUnspaced)) return true;
    return false;
  });
}

export function checkAnchorKeyword(text: string, customKeyword?: string): boolean {
  const clean = text.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

  if (customKeyword) {
    const cleanCustom = customKeyword.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanCustom.length > 3 && clean.includes(cleanCustom)) {
      return true;
    }
  }

  if (
    clean.includes('taruh disini mulai dari sini') ||
    clean.includes('taruh di sini mulai dari sini') ||
    clean.includes('lampiran taruh disini') ||
    clean.includes('lampiran taruh di sini') ||
    (clean.includes('lampiran') && clean.includes('mulai dari sini'))
  ) {
    return true;
  }

  return false;
}

export async function parseDocx(
  fileData: ArrayBuffer | Uint8Array,
  fileName = 'dokumen.docx',
  customAnchorKeyword?: string
): Promise<DocxAnalysis> {
  const zip = await JSZip.loadAsync(fileData);

  const docFile = zip.file('word/document.xml');
  if (!docFile) {
    throw new Error('File tidak valid: word/document.xml tidak ditemukan di dalam paket DOCX.');
  }

  const docXml = await docFile.async('text');

  let existingMediaCount = 0;
  zip.folder('word/media')?.forEach(() => {
    existingMediaCount++;
  });

  const bodyStartTag = '<w:body>';
  const bodyEndTag = '</w:body>';
  const startIdx = docXml.indexOf(bodyStartTag);
  const endIdx = docXml.lastIndexOf(bodyEndTag);

  if (startIdx === -1 || endIdx === -1) {
    throw new Error('Format DOCX tidak valid: tag <w:body> tidak ditemukan.');
  }

  const bodyContent = docXml.substring(startIdx + bodyStartTag.length, endIdx);
  const tagRegex = /(?:<(w:p|w:tbl|w:sectPr|w:sdt)\b[\s\S]*?<\/\1>|<(w:p|w:tbl|w:sectPr|w:sdt)\b[^>]*\/>)/g;

  const elements: DocxElement[] = [];
  const headingsList: { index: number; text: string; page: number }[] = [];
  let anchorKeywordMatch: AnchorKeywordMatch | null = null;

  let match: RegExpExecArray | null;
  let elementIndex = 0;
  let currentPage = 1;
  let pageCharAccumulator = 0;

  let bab1ElementIndex = -1;
  let daftarRujukanElementIndex = -1;

  while ((match = tagRegex.exec(bodyContent)) !== null) {
    const rawXml = match[0];
    const tag = (match[1] || match[2]) as 'w:p' | 'w:tbl' | 'w:sectPr' | 'w:sdt';
    const text = extractTextFromXml(rawXml);

    const hasDrawing = rawXml.includes('<w:drawing>') || rawXml.includes('<w:pict>');
    const hasPageBreak =
      rawXml.includes('w:type="page"') ||
      rawXml.includes('<w:br w:type="page"/>') ||
      rawXml.includes('<w:lastRenderedPageBreak/>');
    const hasSectPr = rawXml.includes('<w:sectPr');

    if (hasPageBreak || hasSectPr) {
      currentPage++;
      pageCharAccumulator = 0;
    } else {
      pageCharAccumulator += text.length;
      if (pageCharAccumulator > 3200) {
        currentPage++;
        pageCharAccumulator = 0;
      }
    }

    const upperText = text.toUpperCase();
    const isTocLine = /(?:\.{2,}|\.\s+\.|\t+\d+|\t+[ivxlcdm]+)/i.test(text);

    if (bab1ElementIndex === -1 && !isTocLine && (upperText.startsWith('BAB I ') || upperText === 'BAB I' || upperText.startsWith('BAB 1 '))) {
      bab1ElementIndex = elementIndex;
    }
    if (daftarRujukanElementIndex === -1 && !isTocLine && (upperText.includes('DAFTAR RUJUKAN') || upperText.includes('DAFTAR PUSTAKA'))) {
      daftarRujukanElementIndex = elementIndex;
    }

    const isHeading =
      rawXml.includes('<w:pStyle w:val="Heading') ||
      upperText.startsWith('BAB ') ||
      upperText.startsWith('HALAMAN ') ||
      upperText.startsWith('LEMBAR ') ||
      upperText.startsWith('PERNYATAAN ') ||
      upperText.startsWith('DAFTAR ') ||
      upperText.startsWith('LAMPIRAN ') ||
      upperText === 'ABSTRAK' ||
      upperText === 'KATA PENGANTAR';

    if (isHeading && text.length > 2 && text.length < 150) {
      headingsList.push({
        index: elementIndex,
        text,
        page: currentPage,
      });
    }

    if (!anchorKeywordMatch && checkAnchorKeyword(text, customAnchorKeyword)) {
      anchorKeywordMatch = {
        index: elementIndex,
        page: currentPage,
        text,
        matchedKeyword: text,
      };
    }

    elements.push({
      index: elementIndex,
      tag,
      rawXml,
      text,
      hasDrawing,
      hasPageBreak,
      hasSectPr,
      isHeading,
      headingText: isHeading ? text : undefined,
      estimatedPage: currentPage,
    });

    elementIndex++;
  }

  // Detect Targets
  const detectedTargets: TargetDocument[] = [];

  for (const spec of ALL_STANDARD_SPECS) {
    let foundIndex = -1;
    let foundPage = 1;
    let hasExistingDrawing = false;
    let endIndex = -1;

    // Special handling for KEASLIAN TULISAN:
    if (spec.id === 'keaslian') {
      const searchStart = daftarRujukanElementIndex !== -1 ? daftarRujukanElementIndex : 0;
      for (let i = searchStart; i < elements.length; i++) {
        const u = elements[i].text.toUpperCase();
        if (elements[i].text.includes('.....') || elements[i].text.includes('. . .')) continue;

        if (matchesKeywords(u, spec.keywords)) {
          foundIndex = i;
          foundPage = elements[i].estimatedPage;
          break;
        }
      }

      // If not found after Daftar Rujukan, fallback to after Daftar Rujukan + 1 (new page)
      if (foundIndex === -1 && daftarRujukanElementIndex !== -1) {
        foundIndex = Math.min(daftarRujukanElementIndex + 40, elements.length - 1);
        foundPage = elements[foundIndex].estimatedPage + 1;
      }
    } else if (spec.category === 'signed_page') {
      // Persetujuan & Pengesahan (in front matter before BAB I or up to first 300 elements)
      const searchLimit = bab1ElementIndex !== -1 ? Math.max(bab1ElementIndex, 100) : Math.min(elements.length, 300);
      for (let i = 0; i < searchLimit; i++) {
        const el = elements[i];
        // Never treat real page headings as TOC unless real leader dots exist
        const looksLikeTocEntry = /(?:\.{2,}|\.\s+\.|\t+\d+|\t+[ivxlcdm]+)/i.test(el.text);
        if (looksLikeTocEntry) continue;

        if (matchesKeywords(el.text, spec.keywords)) {
          if (el.hasPageBreak || el.hasSectPr || foundIndex === -1) {
            foundIndex = i;
            foundPage = el.estimatedPage;
            if (el.hasPageBreak || el.hasSectPr) break;
          }
        }
      }

      // Fallback: If Pengesahan was not detected by keyword, check the page immediately after Persetujuan!
      if (spec.id === 'pengesahan' && foundIndex === -1) {
        const persetujuanFound = detectedTargets.find((t) => t.id === 'persetujuan' && t.elementIndex !== undefined);
        if (persetujuanFound && persetujuanFound.elementIndex !== undefined) {
          const pStart = persetujuanFound.elementIndex;
          for (let k = pStart + 1; k < Math.min(pStart + 45, elements.length); k++) {
            const el = elements[k];
            if (matchesKeywords(el.text, ['PENGESAHAN', 'PENGUJI', 'DEWAN PENGUJI', 'TIM PENGUJI', 'PANITIA UJIAN', 'DISAHKAN', 'DEKAN'])) {
              foundIndex = k;
              foundPage = el.estimatedPage;
              break;
            }
            if (foundIndex === -1 && (el.hasPageBreak || el.hasSectPr) && k + 1 < elements.length) {
              foundIndex = k + 1;
              foundPage = elements[k + 1].estimatedPage;
            }
          }
        }
      }
    } else {
      // 5 Lampiran (Surat Tugas, Kartu Bimbingan, Izin, Telah Meneliti, Bebas Plagiasi)
      // Prioritize searching after DAFTAR RUJUKAN / BAB V, strictly skipping DAFTAR LAMPIRAN (TOC)
      const searchStart = daftarRujukanElementIndex !== -1 ? daftarRujukanElementIndex : (bab1ElementIndex !== -1 ? bab1ElementIndex : 0);

      for (let i = searchStart; i < elements.length; i++) {
        const el = elements[i];
        if (el.text.includes('.....') || el.text.includes('. . .')) continue;

        if (matchesKeywords(el.text, spec.keywords)) {
          foundIndex = i;
          foundPage = el.estimatedPage;
          break;
        }
      }
    }

    if (foundIndex !== -1) {
      if (spec.category === 'signed_page') {
        endIndex = foundIndex;
        const maxSignedSearch = Math.min(foundIndex + 40, elements.length);
        for (let j = foundIndex + 1; j < maxSignedSearch; j++) {
          const nextEl = elements[j];
          if (nextEl.hasDrawing) {
            hasExistingDrawing = true;
          }
          if (
            nextEl.isHeading ||
            nextEl.hasPageBreak ||
            nextEl.hasSectPr ||
            nextEl.text.toUpperCase().startsWith('HALAMAN ') ||
            nextEl.text.toUpperCase().startsWith('LAMPIRAN ') ||
            nextEl.text.toUpperCase().startsWith('BAB ') ||
            nextEl.text.toUpperCase() === 'ABSTRAK' ||
            nextEl.text.toUpperCase() === 'KATA PENGANTAR' ||
            nextEl.text.toUpperCase().startsWith('DAFTAR ')
          ) {
            endIndex = j - 1;
            break;
          }
          endIndex = j;
        }
      } else {
        endIndex = foundIndex;
        for (let j = foundIndex + 1; j < Math.min(foundIndex + 25, elements.length); j++) {
          const nextEl = elements[j];
          if (nextEl.hasDrawing) {
            hasExistingDrawing = true;
          }
          if (nextEl.isHeading || nextEl.text.toUpperCase().startsWith('LAMPIRAN ')) {
            endIndex = j - 1;
            break;
          }
          endIndex = j;
        }
      }
    }

    let status: TargetDocument['status'] = 'missing_scan';
    if (foundIndex === -1) {
      status = 'unassigned';
    } else if (hasExistingDrawing) {
      status = 'already_attached';
    }

    detectedTargets.push({
      id: spec.id,
      title: spec.title,
      captionTitle: spec.captionTitle,
      category: spec.category,
      standardOrder: spec.standardOrder,
      elementIndex: foundIndex !== -1 ? foundIndex : undefined,
      endElementIndex: endIndex !== -1 ? endIndex : undefined,
      estimatedPage: foundIndex !== -1 ? foundPage : undefined,
      hasExistingDrawing,
      status,
      notes: foundIndex !== -1
        ? (hasExistingDrawing
            ? 'Sudah memiliki scan/gambar di dokumen asli'
            : spec.category === 'signed_page'
            ? 'Ditemukan (halaman teks bertanda tangan, siap auto-replace)'
            : 'Heading lampiran ditemukan di Word')
        : 'Belum ditemukan di Word (posisi otomatis di anchor / manual)',
    });
  }

  return {
    fileName,
    fileSize: fileData.byteLength,
    totalElements: elements.length,
    totalPagesEstimate: currentPage,
    elements,
    detectedTargets,
    existingMediaCount,
    headingsList,
    anchorKeywordMatch,
  };
}
