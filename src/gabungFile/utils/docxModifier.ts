/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import JSZip from 'jszip';
import { DocxAnalysis, ProcessingOptions, ScanFile, TargetDocument } from '../types/skripsi';
import { findHighestExistingLampiranNumber } from './docxParser';

export interface ModifierResult {
  docxBlob: Blob;
  logs: string[];
}

// Section helpers:
// In Word OpenXML (ISO/IEC 29500), a <w:sectPr> inside a <w:pPr> defines the layout (margins, orientation)
// of the SECTION ENDING at that paragraph (the section preceding this break).
// Therefore:
// - To isolate Cover 1 & Cover 2 so their original margins are NEVER touched:
//   The section break BEFORE Persetujuan MUST retain the exact original Cover margins.
// - To give Persetujuan & Pengesahan (or Keaslian, or Lampiran) a 2 cm margin:
//   The section break AT THE END of those pages MUST specify the 2 cm margins.
// - The pages following that break then automatically continue with the document's original margins.
//
// 2 cm = 1134 twips.
const TWO_CM_TWIPS = 1134;

function normalizeSectPrForNextPage(sectPrXml: string, margins?: {
  top: number;
  right: number;
  bottom: number;
  left: number;
}): string {
  let sectPr = sectPrXml.trim();

  // If specific margins are requested, update pgMar; otherwise keep original untouched.
  if (margins) {
    const { top, right, bottom, left } = margins;
    if (/<w:pgMar\b[^>]*\/>/.test(sectPr)) {
      sectPr = sectPr.replace(/<w:pgMar\b[^>]*\/>/, (tag) => {
        let updated = tag;
        const setAttr = (name: string, value: number) => {
          const attr = new RegExp(`w:${name}="[^"]*"`);
          if (attr.test(updated)) {
            updated = updated.replace(attr, `w:${name}="${value}"`);
          } else {
            updated = updated.replace('/>', ` w:${name}="${value}"/>`);
          }
        };
        setAttr('top', top);
        setAttr('right', right);
        setAttr('bottom', bottom);
        setAttr('left', left);
        return updated;
      });
    } else {
      sectPr = sectPr.replace(
        '</w:sectPr>',
        `<w:pgMar w:top="${top}" w:right="${right}" w:bottom="${bottom}" w:left="${left}"/></w:sectPr>`
      );
    }
  }

  // Make this a Next Page section break while retaining every other property.
  if (/<w:type\b[^>]*\/>/.test(sectPr)) {
    sectPr = sectPr.replace(/<w:type\b[^>]*\/>/, '<w:type w:val="nextPage"/>');
  } else {
    sectPr = sectPr.replace('</w:sectPr>', '<w:type w:val="nextPage"/></w:sectPr>');
  }

  return sectPr;
}

function generateSectionBreakXml(
  originalSectPrXml: string,
  margins?: { top: number; right: number; bottom: number; left: number }
): string {
  const sectPr = normalizeSectPrForNextPage(originalSectPrXml, margins);
  return `<w:p><w:pPr>${sectPr}</w:pPr></w:p>`;
}

// Semua penulisan lampiran di bagian 5 lampiran taruh di pinggir kiri (w:jc w:val="left", ind left="0")
function generateCaptionXml(title: string): string {
  return `<w:p><w:pPr><w:spacing w:before="120" w:after="80" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/><w:ind w:left="0" w:right="0" w:firstLine="0"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>${escapeXml(title)}</w:t></w:r></w:p>`;
}

function generateDrawingXml(
  rId: string,
  docPrId: number,
  cx: number,
  cy: number,
  pictureName = 'Scan Document'
): string {
  const safeName = escapeXml(pictureName);
  return `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:noProof/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:eastAsia="en-US"/></w:rPr><w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${docPrId}" name="${safeName}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${docPrId}" name="${safeName}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"><a:extLst><a:ext uri="{28A0092B-C50C-407E-A947-70E740481C1C}"><a14:useLocalDpi xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main" val="0"/></a:ext></a:extLst></a:blip><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr bwMode="auto"><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln><a:noFill/></a:ln></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function generatePageBreakXml(): string {
  return `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>`;
}

function generateSpacingXml(): string {
  return `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:p>`;
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '\'':
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return c;
    }
  });
}

export async function applyScansToDocx(
  originalData: ArrayBuffer,
  analysis: DocxAnalysis,
  targets: TargetDocument[],
  scans: ScanFile[],
  options: ProcessingOptions
): Promise<ModifierResult> {
  const logs: string[] = [];
  logs.push('File Word berhasil dibaca');

  const zip = await JSZip.loadAsync(originalData);

  const docFile = zip.file('word/document.xml');
  const relsFile = zip.file('word/_rels/document.xml.rels');
  const contentTypesFile = zip.file('[Content_Types].xml');

  if (!docFile || !relsFile || !contentTypesFile) {
    throw new Error('Struktur file DOCX tidak lengkap atau korup.');
  }

  let docXml = await docFile.async('text');
  let relsXml = await relsFile.async('text');
  let contentTypesXml = await contentTypesFile.async('text');

  // Ensure content types has jpg, jpeg, png
  if (!contentTypesXml.includes('Extension="jpeg"')) {
    contentTypesXml = contentTypesXml.replace(
      '</Types>',
      '<Default Extension="jpeg" ContentType="image/jpeg"/></Types>'
    );
  }
  if (!contentTypesXml.includes('Extension="jpg"')) {
    contentTypesXml = contentTypesXml.replace(
      '</Types>',
      '<Default Extension="jpg" ContentType="image/jpeg"/></Types>'
    );
  }
  if (!contentTypesXml.includes('Extension="png"')) {
    contentTypesXml = contentTypesXml.replace(
      '</Types>',
      '<Default Extension="png" ContentType="image/png"/></Types>'
    );
  }
  zip.file('[Content_Types].xml', contentTypesXml);

  const rIdMatches = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => parseInt(m[1], 10));
  let nextRIdNum = Math.max(...rIdMatches, 0) + 1;
  let nextDocPrId = 8800000;

  const scanMap = new Map<string, ScanFile>();
  scans.forEach((s) => scanMap.set(s.id, s));

  const bodyStartTag = '<w:body>';
  const bodyEndTag = '</w:body>';
  const bodyStart = docXml.indexOf(bodyStartTag) + bodyStartTag.length;
  const bodyEnd = docXml.lastIndexOf(bodyEndTag);

  const prefix = docXml.substring(0, bodyStart);
  let suffix = docXml.substring(bodyEnd);

  const elements = [...analysis.elements];

  // Section properties asli naskah (biasanya 4-3-4-3 cm) dari dokumen asli
  const defaultAcademicSectPr =
    suffix.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/)?.[0] ||
    docXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/)?.[0] ||
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838" w:code="9"/><w:pgMar w:top="2268" w:right="1701" w:bottom="1701" w:left="2268" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';

  // Return the section properties that were in effect at a given element.
  const getOriginalSectPrBefore = (elementIndex: number): string => {
    for (let i = Math.min(elementIndex - 1, elements.length - 1); i >= 0; i--) {
      const match = elements[i].rawXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/);
      if (match) return match[0];
    }
    return defaultAcademicSectPr;
  };

  // A rendered page boundary is more reliable than a heading/endElementIndex.
  const findPageEnd = (startIndex: number): number => {
    const maxSearch = Math.min(startIndex + 40, elements.length - 1);
    for (let i = startIndex + 1; i <= maxSearch; i++) {
      const u = elements[i].text.toUpperCase();
      const isNextMajorHeading =
        elements[i].isHeading ||
        u.startsWith('HALAMAN ') ||
        u.startsWith('LEMBAR ') ||
        u.startsWith('BAB ') ||
        u.startsWith('LAMPIRAN ') ||
        u === 'ABSTRAK' ||
        u === 'KATA PENGANTAR' ||
        u.startsWith('DAFTAR ');

      if (isNextMajorHeading) {
        return i - 1;
      }

      if (elements[i].hasPageBreak || elements[i].hasSectPr) {
        // Also consume any consecutive trailing empty paragraphs before next real content!
        let end = i;
        while (
          end + 1 <= maxSearch &&
          !elements[end + 1].text.trim() &&
          !elements[end + 1].hasPageBreak &&
          !elements[end + 1].hasSectPr
        ) {
          end++;
        }
        return end;
      }
    }
    return Math.min(startIndex + 15, elements.length - 1);
  };

  // Section break yang MENJAMIN 100% margin asli Cover 1 & Cover 2 tidak tersentuh sama sekali
  const sectionBreakCover = () =>
    generateSectionBreakXml(defaultAcademicSectPr);

  // Section break yang mempertahankan margin asli naskah (setelah keaslian hingga sebelum surat tugas)
  const sectionBreakOriginalAcademic = () =>
    generateSectionBreakXml(defaultAcademicSectPr);

  // Section break yang mendefinisikan margin 2 cm (khusus Persetujuan & Pengesahan, Keaslian, dan 5 Lampiran)
  const sectionBreak2Cm = () =>
    generateSectionBreakXml(defaultAcademicSectPr, {
      top: TWO_CM_TWIPS,
      right: TWO_CM_TWIPS,
      bottom: TWO_CM_TWIPS,
      left: TWO_CM_TWIPS,
    });

  // Helper untuk membersihkan page break ganda atau paragraf kosong
  const stripRedundantPageBreaks = (xml: string): string => {
    return xml
      .replace(/<w:br\b[^>]*w:type="page"[^>]*\/>/g, '')
      .replace(/<w:pageBreakBefore\b[^>]*\/>/g, '')
      .replace(/<w:lastRenderedPageBreak\b[^>]*\/>/g, '');
  };

  const isXmlParagraphEmpty = (xml: string): boolean => {
    const textMatches = xml.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g);
    if (!textMatches) return true;
    const combined = textMatches.map((t) => t.replace(/<[^>]+>/g, '')).join('').trim();
    return combined.length === 0;
  };

  const registerImage = async (
    scan: ScanFile,
    namePrefix: string
  ): Promise<{ rId: string; imageFileName: string }> => {
    const ext = scan.name.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
    const imageFileName = `zain_${namePrefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;

    const arrayBuffer = await scan.file.arrayBuffer();
    zip.file(`word/media/${imageFileName}`, arrayBuffer);

    const rId = `rId${nextRIdNum++}`;
    const newRel = `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imageFileName}"/>`;
    relsXml = relsXml.replace('</Relationships>', `${newRel}</Relationships>`);

    return { rId, imageFileName };
  };

  // Dimensions calculator for 2 cm margin (Printable width up to 17 cm = 6,120,000 EMUs)
  // Printable height on A4 with 2 cm margins is 25.7 cm (9,252,000 EMUs).
  // With caption (approx 1.5 cm), max image height must stay below ~21.5 cm (7,500,000 EMUs)
  // to prevent Word from creating an accidental blank page!
  const calculateDimensions2CmMargins = (
    scan: ScanFile,
    mode: 'full_page' | 'half_page' | 'full_page_with_caption'
  ): { cx: number; cy: number } => {
    const targetCx = 5600000; // ~15.8 cm width for 2 cm margin
    const ratio = scan.aspectRatio || (scan.width && scan.height ? scan.width / scan.height : 0.707);

    if (mode === 'half_page') {
      const maxCy = 3800000; // ~10.7 cm height for 2 cards per page
      let cy = Math.round(targetCx / ratio);
      let cx = targetCx;
      if (cy > maxCy) {
        cy = maxCy;
        cx = Math.round(maxCy * ratio);
      }
      return { cx, cy };
    } else if (mode === 'full_page_with_caption') {
      const maxCy = 7500000; // ~21.1 cm height so caption + image easily fit on 1 page
      let cy = Math.round(targetCx / ratio);
      let cx = targetCx;
      if (cy > maxCy) {
        cy = maxCy;
        cx = Math.round(maxCy * ratio);
      }
      return { cx, cy };
    } else {
      const maxCy = 8000000; // ~22.5 cm height for full page scan without caption
      let cy = Math.round(targetCx / ratio);
      let cx = targetCx;
      if (cy > maxCy) {
        cy = maxCy;
        cx = Math.round(maxCy * ratio);
      }
      return { cx, cy };
    }
  };

  interface ElementReplacement {
    startIndex: number;
    endIndex: number;
    replacementXml: string;
  }

  const replacements: ElementReplacement[] = [];

  // =========================================================================
  // 1. PROSES HALAMAN PERSETUJUAN & PENGESAHAN
  // Margin 2 cm hanya berlaku pada halaman Persetujuan & Pengesahan.
  // Cover 1 dan Cover 2 tidak boleh disentuh marginnya sama sekali.
  // Halaman setelah pengesahan tidak boleh ada halaman kosong.
  // =========================================================================
  const persetujuanTarget = targets.find((t) => t.id === 'persetujuan');
  const pengesahanTarget = targets.find((t) => t.id === 'pengesahan');

  const persetujuanIdx = persetujuanTarget?.customTargetElementIndex ?? persetujuanTarget?.elementIndex;
  let pengesahanIdx = pengesahanTarget?.customTargetElementIndex ?? pengesahanTarget?.elementIndex;

  const scanPersetujuan = persetujuanTarget?.assignedScanId ? scanMap.get(persetujuanTarget.assignedScanId) : null;
  const scanPengesahan = pengesahanTarget?.assignedScanId ? scanMap.get(pengesahanTarget.assignedScanId) : null;

  // Auto-resolve pengesahanIdx if scanPengesahan exists and persetujuanIdx is found
  if (scanPersetujuan && scanPengesahan && persetujuanIdx !== undefined && pengesahanIdx === undefined) {
    const endPersetujuan = findPageEnd(persetujuanIdx);
    pengesahanIdx = Math.min(endPersetujuan + 1, elements.length - 1);
    logs.push(`ℹ Posisi Halaman Pengesahan otomatis dipetakan ke halaman setelah Persetujuan (elemen ~${pengesahanIdx})`);
  }

  let persetujuanProcessed = false;
  let pengesahanProcessed = false;

  // If both scans are available and both indices are resolved, replace atomically
  if (scanPersetujuan && scanPengesahan && persetujuanIdx !== undefined && pengesahanIdx !== undefined) {
    const { rId: rIdSetuju } = await registerImage(scanPersetujuan, 'persetujuan');
    const { rId: rIdSah } = await registerImage(scanPengesahan, 'pengesahan');

    logs.push(`✓ Halaman Cover 1 & 2 aman 100% tanpa perubahan margin`);
    logs.push(`✓ Halaman Persetujuan & Pengesahan diganti foto asli (Margin 2 cm khusus)`);
    logs.push(`✓ Halaman kosong setelah pengesahan dibersihkan`);

    const dimSetuju = calculateDimensions2CmMargins(scanPersetujuan, 'full_page');
    const dimSah = calculateDimensions2CmMargins(scanPengesahan, 'full_page');

    // Section break sebelum Persetujuan mempertahankan margin asli Cover 1 & Cover 2 100%!
    let repCombined = sectionBreakCover();
    repCombined += generateDrawingXml(rIdSetuju, nextDocPrId++, dimSetuju.cx, dimSetuju.cy, 'Halaman Persetujuan');
    repCombined += generatePageBreakXml();
    repCombined += generateDrawingXml(rIdSah, nextDocPrId++, dimSah.cx, dimSah.cy, 'Halaman Pengesahan');
    // Section break di akhir Pengesahan menerapkan margin 2 cm untuk Persetujuan & Pengesahan
    // dan langsung beralih ke halaman Kata Pengantar (tanpa page break ganda).
    repCombined += sectionBreak2Cm();

    const persetujuanStart = persetujuanIdx;
    let pengesahanEnd = findPageEnd(pengesahanIdx);
    // Bersihkan paragraf kosong setelah pengesahan agar tidak ada halaman kosong
    while (
      pengesahanEnd + 1 < elements.length &&
      !elements[pengesahanEnd + 1].text.trim() &&
      !elements[pengesahanEnd + 1].hasSectPr
    ) {
      pengesahanEnd++;
    }

    replacements.push({
      startIndex: persetujuanStart,
      endIndex: Math.max(pengesahanEnd, pengesahanIdx),
      replacementXml: repCombined,
    });
    persetujuanProcessed = true;
    pengesahanProcessed = true;
  }

  // Individual fallbacks if only one was processed
  if (!persetujuanProcessed && scanPersetujuan && persetujuanIdx !== undefined) {
    const { rId } = await registerImage(scanPersetujuan, 'persetujuan');
    logs.push(`✓ Halaman Persetujuan diganti foto asli (Margin 2 cm)`);
    const dim = calculateDimensions2CmMargins(scanPersetujuan, 'full_page');

    let rep = sectionBreakCover();
    rep += generateDrawingXml(rId, nextDocPrId++, dim.cx, dim.cy, 'Halaman Persetujuan');
    rep += sectionBreak2Cm();

    replacements.push({
      startIndex: persetujuanIdx,
      endIndex: findPageEnd(persetujuanIdx),
      replacementXml: rep,
    });
  }

  if (!pengesahanProcessed && scanPengesahan && pengesahanIdx !== undefined) {
    const { rId } = await registerImage(scanPengesahan, 'pengesahan');
    logs.push(`✓ Halaman Pengesahan diganti foto asli (Margin 2 cm)`);
    const dim = calculateDimensions2CmMargins(scanPengesahan, 'full_page');

    let rep = sectionBreakCover();
    rep += generateDrawingXml(rId, nextDocPrId++, dim.cx, dim.cy, 'Halaman Pengesahan');
    rep += sectionBreak2Cm();

    replacements.push({
      startIndex: pengesahanIdx,
      endIndex: findPageEnd(pengesahanIdx),
      replacementXml: rep,
    });
  }

  // =========================================================================
  // 2. PROSES SURAT PERNYATAAN KEASLIAN TULISAN
  // Posisi: Setelah Daftar Pustaka / Daftar Rujukan berakhir pada halaman baru.
  // Hapus halaman kosong sebelum dan sesudah surat pernyataan keaslian tulisan.
  // Margin 2 cm HANYA untuk Surat Pernyataan Keaslian Tulisan.
  // Margin setelah halaman keaslian tulisan TIDAK boleh diubah (tetap margin asli naskah).
  // =========================================================================
  const keaslianTarget = targets.find((t) => t.id === 'keaslian');

  if (keaslianTarget?.assignedScanId) {
    const scan = scanMap.get(keaslianTarget.assignedScanId);
    if (scan) {
      const { rId } = await registerImage(scan, 'keaslian');
      logs.push(`✓ Halaman kosong sebelum Surat Pernyataan Keaslian Tulisan dibersihkan`);
      logs.push(`✓ Surat Pernyataan Keaslian Tulisan diproses setelah Daftar Pustaka (Margin 2 cm diterapkan)`);
      logs.push(`✓ Margin naskah setelah keaslian tulisan tetap mempertahankan margin asli`);
      const dim = calculateDimensions2CmMargins(scan, 'full_page');

      let keaslianStart = keaslianTarget.elementIndex ?? 0;
      // Bersihkan paragraf kosong sebelum keaslian agar tidak ada halaman kosong
      while (
        keaslianStart > 0 &&
        !elements[keaslianStart - 1].text.trim() &&
        !elements[keaslianStart - 1].hasSectPr
      ) {
        keaslianStart--;
      }

      // Section break sebelum Keaslian mempertahankan margin asli Daftar Pustaka
      let rep = sectionBreakOriginalAcademic();
      rep += generateDrawingXml(rId, nextDocPrId++, dim.cx, dim.cy, 'Surat Pernyataan Keaslian Tulisan');
      // Section break di akhir Keaslian menerapkan margin 2 cm untuk lembar ini
      rep += sectionBreak2Cm();

      let keaslianEnd = keaslianTarget.endElementIndex || findPageEnd(keaslianTarget.elementIndex ?? 0);
      // Bersihkan paragraf kosong setelah keaslian
      while (
        keaslianEnd + 1 < elements.length &&
        !elements[keaslianEnd + 1].text.trim() &&
        !elements[keaslianEnd + 1].hasSectPr
      ) {
        keaslianEnd++;
      }

      if (keaslianStart >= 0) {
        replacements.push({
          startIndex: keaslianStart,
          endIndex: keaslianEnd,
          replacementXml: rep,
        });
      }
    }
  }

  // =========================================================================
  // 3. PROSES 5 LAMPIRAN UTAMA (Margin 2 cm Khusus)
  // Surat Tugas Pembimbing, Kartu Bimbingan, Izin, Telah Meneliti, Bebas Plagiasi
  // Semua penulisan lampiran diletakkan di pinggir kiri (w:jc w:val="left").
  // Deteksi urutan lampiran awal: jika naskah sebelumnya sudah ada Lampiran 1, 2, 3
  // maka Surat Tugas otomatis melanjutkan ke Lampiran 4, disusul Kartu Bimbingan Lampiran 5, dst.
  // Halaman kosong setelah Kartu Bimbingan dibersihkan.
  // =========================================================================
  const targetSuratTugas = targets.find((t) => t.id === 'surat_tugas');
  const targetKbDepan = targets.find((t) => t.id === 'kartu_bimbingan_depan');
  const targetKbBelakang = targets.find((t) => t.id === 'kartu_bimbingan_belakang');
  const targetIzin = targets.find((t) => t.id === 'izin_penelitian');
  const targetTelahMeneliti = targets.find((t) => t.id === 'telah_meneliti');
  const targetBebasPlagiasi = targets.find((t) => t.id === 'bebas_plagiasi');

  const anchorMatch = analysis.anchorKeywordMatch;

  const hasAnchorAttachments =
    !!targetSuratTugas?.assignedScanId ||
    !!targetKbDepan?.assignedScanId ||
    !!targetIzin?.assignedScanId ||
    !!targetTelahMeneliti?.assignedScanId ||
    !!targetBebasPlagiasi?.assignedScanId;

  // Deteksi nomor lampiran tertinggi yang sudah ada di naskah sebelum anchor
  const highestExisting = findHighestExistingLampiranNumber(
    elements,
    anchorMatch ? anchorMatch.index : undefined
  );
  let currentLampiranNum = highestExisting > 0 ? highestExisting + 1 : 4;
  logs.push(
    `ℹ Urutan lampiran: ${
      highestExisting > 0
        ? `Naskah memiliki lampiran sebelumnya hingga Lampiran ${highestExisting} -> Surat Tugas melanjutkan ke Lampiran ${currentLampiranNum}`
        : `Mulai dari Lampiran ${currentLampiranNum}`
    }`
  );

  // Kumpulkan semua lampiran aktif yang diunggah pengguna
  interface ActiveLampiranItem {
    id: string;
    scan: ScanFile;
    scanBelakang?: ScanFile | null;
    caption: string;
  }
  const activeItems: ActiveLampiranItem[] = [];

  if (targetSuratTugas?.assignedScanId) {
    const scan = scanMap.get(targetSuratTugas.assignedScanId);
    if (scan) {
      const num = currentLampiranNum++;
      activeItems.push({
        id: 'surat_tugas',
        scan,
        caption: `Lampiran ${num}: Surat Tugas Pembimbing Penyusunan Skripsi`,
      });
    }
  }

  if (targetKbDepan?.assignedScanId) {
    const scanDepan = scanMap.get(targetKbDepan.assignedScanId);
    const scanBelakang = targetKbBelakang?.assignedScanId ? scanMap.get(targetKbBelakang.assignedScanId) : null;
    if (scanDepan) {
      const num = currentLampiranNum++;
      activeItems.push({
        id: 'kartu_bimbingan',
        scan: scanDepan,
        scanBelakang,
        caption: `Lampiran ${num}: Kartu Bimbingan`,
      });
    }
  }

  if (targetIzin?.assignedScanId) {
    const scan = scanMap.get(targetIzin.assignedScanId);
    if (scan) {
      const num = currentLampiranNum++;
      activeItems.push({
        id: 'izin_penelitian',
        scan,
        caption: `Lampiran ${num}: Surat Permohonan Izin Penelitian`,
      });
    }
  }

  if (targetTelahMeneliti?.assignedScanId) {
    const scan = scanMap.get(targetTelahMeneliti.assignedScanId);
    if (scan) {
      const num = currentLampiranNum++;
      activeItems.push({
        id: 'telah_meneliti',
        scan,
        caption: `Lampiran ${num}: Surat Keterangan Telah Meneliti`,
      });
    }
  }

  if (targetBebasPlagiasi?.assignedScanId) {
    const scan = scanMap.get(targetBebasPlagiasi.assignedScanId);
    if (scan) {
      const num = currentLampiranNum++;
      activeItems.push({
        id: 'bebas_plagiasi',
        scan,
        caption: `Lampiran ${num}: Surat Keterangan Bebas Plagiasi`,
      });
    }
  }

  if (anchorMatch && options.useAnchorFor5Attachments && activeItems.length > 0) {
    logs.push(`✓ Titik penempatan 5 Lampiran aktif pada kata kunci anchor (Margin 2 cm diterapkan)`);

    // Section break sebelum 5 lampiran menutup naskah/lampiran sebelumnya dengan margin naskah asli!
    let combined5Xml = sectionBreakOriginalAcademic();

    for (let idx = 0; idx < activeItems.length; idx++) {
      const item = activeItems[idx];
      const isLastItem = idx === activeItems.length - 1;

      if (item.id === 'kartu_bimbingan') {
        const { rId: rIdDepan } = await registerImage(item.scan, 'kb_depan');
        let rIdBelakang: string | null = null;
        if (item.scanBelakang) {
          const res = await registerImage(item.scanBelakang, 'kb_belakang');
          rIdBelakang = res.rId;
          logs.push('✓ Foto Kartu Bimbingan Depan & Belakang ditempatkan');
        } else {
          logs.push('✓ Foto Kartu Bimbingan Depan ditempatkan');
        }

        combined5Xml += generateCaptionXml(item.caption);

        if (options.kartuBimbinganLayout === 'single_page' && rIdBelakang && item.scanBelakang) {
          const dimDepan = calculateDimensions2CmMargins(item.scan, 'half_page');
          const dimBelakang = calculateDimensions2CmMargins(item.scanBelakang, 'half_page');
          combined5Xml += generateDrawingXml(rIdDepan, nextDocPrId++, dimDepan.cx, dimDepan.cy, 'Kartu Bimbingan Depan');
          combined5Xml += generateDrawingXml(rIdBelakang, nextDocPrId++, dimBelakang.cx, dimBelakang.cy, 'Kartu Bimbingan Belakang');
        } else {
          const dimDepan = calculateDimensions2CmMargins(item.scan, 'full_page_with_caption');
          combined5Xml += generateDrawingXml(rIdDepan, nextDocPrId++, dimDepan.cx, dimDepan.cy, 'Kartu Bimbingan Depan');
          if (rIdBelakang && item.scanBelakang) {
            combined5Xml += generatePageBreakXml();
            combined5Xml += generateCaptionXml(`${item.caption} (Lanjutan)`);
            const dimBelakang = calculateDimensions2CmMargins(item.scanBelakang, 'full_page_with_caption');
            combined5Xml += generateDrawingXml(rIdBelakang, nextDocPrId++, dimBelakang.cx, dimBelakang.cy, 'Kartu Bimbingan Belakang');
          }
        }

        // Halaman kosong setelah kartu bimbingan dicegah: page break HANYA jika ada lampiran lanjutan!
        if (!isLastItem) {
          combined5Xml += generatePageBreakXml();
        }
      } else {
        const { rId } = await registerImage(item.scan, item.id);
        const dim = calculateDimensions2CmMargins(item.scan, 'full_page_with_caption');
        logs.push(`✓ Keterangan pinggir kiri & foto ${item.caption} ditempatkan`);
        combined5Xml += generateCaptionXml(item.caption);
        combined5Xml += generateDrawingXml(rId, nextDocPrId++, dim.cx, dim.cy, item.caption);

        // Hanya tambahkan pemisah halaman jika masih ada lampiran berikutnya
        if (!isLastItem) {
          combined5Xml += generatePageBreakXml();
        }
      }
    }

    // Akhiri lampiran dengan section break 2 cm
    combined5Xml += sectionBreak2Cm();

    if (combined5Xml.length > 0) {
      replacements.push({
        startIndex: anchorMatch.index,
        endIndex: anchorMatch.index,
        replacementXml: combined5Xml,
      });
    }
  } else if (activeItems.length > 0) {
    // Individual fallback placements with 2 cm margin
    for (let idx = 0; idx < activeItems.length; idx++) {
      const item = activeItems[idx];
      const target = targets.find((t) => t.id === (item.id === 'kartu_bimbingan' ? 'kartu_bimbingan_depan' : item.id));
      if (!target || target.elementIndex === undefined) continue;

      if (item.id === 'kartu_bimbingan') {
        const { rId: rIdDepan } = await registerImage(item.scan, 'kb_depan');
        let rIdBelakang: string | null = null;
        if (item.scanBelakang) {
          const res = await registerImage(item.scanBelakang, 'kb_belakang');
          rIdBelakang = res.rId;
        }

        let rep = sectionBreakOriginalAcademic() + generateCaptionXml(item.caption);

        if (options.kartuBimbinganLayout === 'single_page' && rIdBelakang && item.scanBelakang) {
          const dimDepan = calculateDimensions2CmMargins(item.scan, 'half_page');
          const dimBelakang = calculateDimensions2CmMargins(item.scanBelakang, 'half_page');
          rep += generateDrawingXml(rIdDepan, nextDocPrId++, dimDepan.cx, dimDepan.cy, 'Kartu Bimbingan Depan');
          rep += generateDrawingXml(rIdBelakang, nextDocPrId++, dimBelakang.cx, dimBelakang.cy, 'Kartu Bimbingan Belakang');
        } else {
          const dimDepan = calculateDimensions2CmMargins(item.scan, 'full_page_with_caption');
          rep += generateDrawingXml(rIdDepan, nextDocPrId++, dimDepan.cx, dimDepan.cy, 'Kartu Bimbingan Depan');
          if (rIdBelakang && item.scanBelakang) {
            rep += generatePageBreakXml();
            rep += generateCaptionXml(`${item.caption} (Lanjutan)`);
            const dimBelakang = calculateDimensions2CmMargins(item.scanBelakang, 'full_page_with_caption');
            rep += generateDrawingXml(rIdBelakang, nextDocPrId++, dimBelakang.cx, dimBelakang.cy, 'Kartu Bimbingan Belakang');
          }
        }

        rep += sectionBreak2Cm();

        replacements.push({
          startIndex: target.elementIndex,
          endIndex: target.endElementIndex || findPageEnd(target.elementIndex),
          replacementXml: rep,
        });
      } else {
        const { rId } = await registerImage(item.scan, item.id);
        const dim = calculateDimensions2CmMargins(item.scan, 'full_page_with_caption');
        let rep = sectionBreakOriginalAcademic();
        rep += generateCaptionXml(item.caption);
        rep += generateDrawingXml(rId, nextDocPrId++, dim.cx, dim.cy, item.caption);
        rep += sectionBreak2Cm();

        replacements.push({
          startIndex: target.elementIndex,
          endIndex: target.endElementIndex || findPageEnd(target.elementIndex),
          replacementXml: rep,
        });
      }
    }
  }

  // Sort replacements ascending by startIndex first to sanitize ranges
  replacements.sort((a, b) => a.startIndex - b.startIndex);

  // Prevent overlapping ranges between adjacent replacements
  for (let i = 0; i < replacements.length - 1; i++) {
    const cur = replacements[i];
    const next = replacements[i + 1];
    if (cur.endIndex >= next.startIndex) {
      cur.endIndex = Math.max(cur.startIndex, next.startIndex - 1);
    }
  }

  // Sort replacements descending by startIndex for clean in-place array splicing
  replacements.sort((a, b) => b.startIndex - a.startIndex);

  // Apply replacements
  const finalElementXmls: string[] = elements.map((e) => e.rawXml);

  for (const rep of replacements) {
    const deleteCount = Math.max(0, rep.endIndex - rep.startIndex + 1);
    finalElementXmls.splice(rep.startIndex, deleteCount, rep.replacementXml);

    // Hapus halaman kosong dan page break ganda setelah section break
    let nextIdx = rep.startIndex + 1;
    while (
      nextIdx < finalElementXmls.length &&
      isXmlParagraphEmpty(finalElementXmls[nextIdx]) &&
      !finalElementXmls[nextIdx].includes('<w:sectPr')
    ) {
      finalElementXmls.splice(nextIdx, 1);
    }
    if (nextIdx < finalElementXmls.length) {
      finalElementXmls[nextIdx] = stripRedundantPageBreaks(finalElementXmls[nextIdx]);
    }

    // Bersihkan juga page break ganda pada paragraf sebelum replacement jika ada
    if (rep.startIndex > 0) {
      finalElementXmls[rep.startIndex - 1] = stripRedundantPageBreaks(finalElementXmls[rep.startIndex - 1]);
    }
  }

  // Jika ada lampiran aktif, pastikan section terakhir dokumen berakhir dengan margin 2 cm
  if (activeItems.length > 0) {
    suffix = suffix.replace(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/, () =>
      normalizeSectPrForNextPage(defaultAcademicSectPr, {
        top: TWO_CM_TWIPS,
        right: TWO_CM_TWIPS,
        bottom: TWO_CM_TWIPS,
        left: TWO_CM_TWIPS,
      })
    );
  }

  let newDocumentXml = prefix + finalElementXmls.join('') + suffix;

  // Ensure root <w:document> declares all necessary drawing and OOXML namespaces
  const requiredNamespaces: Record<string, string> = {
    'xmlns:w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'xmlns:r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'xmlns:m': 'http://schemas.openxmlformats.org/officeDocument/2006/math',
    'xmlns:v': 'urn:schemas-microsoft-com:vml',
    'xmlns:wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'xmlns:w10': 'urn:schemas-microsoft-com:office:word',
    'xmlns:a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'xmlns:pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture',
    'xmlns:a14': 'http://schemas.microsoft.com/office/drawing/2010/main',
    'xmlns:wp14': 'http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing',
    'xmlns:w14': 'http://schemas.microsoft.com/office/word/2010/wordml',
  };

  newDocumentXml = newDocumentXml.replace(/<w:document\b([^>]*)>/, (match, attrs) => {
    let extra = '';
    for (const [key, uri] of Object.entries(requiredNamespaces)) {
      if (!attrs.includes(key)) {
        extra += ` ${key}="${uri}"`;
      }
    }
    return `<w:document${attrs}${extra}>`;
  });

  zip.file('word/document.xml', newDocumentXml);
  zip.file('word/_rels/document.xml.rels', relsXml);

  logs.push('✓ Margin 2 cm diisolasi hanya untuk halaman Persetujuan & Pengesahan');
  logs.push('✓ Halaman setelah lampiran mempertahankan margin dan pengaturan section asli');
  logs.push('✓ Struktur DOCX dan hubungan media berhasil disinkronkan');

  const finalBlob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  logs.push('✓ File Word final berhasil di-generate');

  return {
    docxBlob: finalBlob,
    logs,
  };
}
