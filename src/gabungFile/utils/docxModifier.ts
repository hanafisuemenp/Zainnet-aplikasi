/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import JSZip from 'jszip';
import { DocxAnalysis, ProcessingOptions, ScanFile, TargetDocument } from '../types/skripsi';

export interface ModifierResult {
  docxBlob: Blob;
  logs: string[];
}

// Section helpers.
// IMPORTANT: a <w:sectPr> placed in a paragraph defines the section that starts
// AFTER that paragraph. We therefore create a temporary section for each scan
// page and explicitly restore the exact section properties that existed before
// the scan was inserted.
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

  // Keep the original page size, headers/footers, columns, line numbering, etc.
  // Only replace the page margins when requested.
  const top = margins?.top ?? TWO_CM_TWIPS;
  const right = margins?.right ?? TWO_CM_TWIPS;
  const bottom = margins?.bottom ?? TWO_CM_TWIPS;
  const left = margins?.left ?? TWO_CM_TWIPS;

  if (/<w:pgMar\b[^>]*\/>/.test(sectPr)) {
    // Change ONLY top/right/bottom/left. Header/footer/gutter values from the
    // original document must survive untouched.
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

function generateCaptionXml(title: string): string {
  return `<w:p><w:pPr><w:spacing w:before="160" w:after="100" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>${escapeXml(title)}</w:t></w:r></w:p>`;
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
  const suffix = docXml.substring(bodyEnd);

  const elements = [...analysis.elements];

  // Return the section properties that were in effect at a given element.
  // The final <w:sectPr> in <w:body> is the document's fallback section.
  // For an element, the nearest preceding paragraph containing sectPr defines
  // the section it belongs to. This lets us restore the user's real margins
  // instead of assuming every document uses 4-3-4-3 cm.
  const getOriginalSectPrBefore = (elementIndex: number): string => {
    for (let i = Math.min(elementIndex - 1, elements.length - 1); i >= 0; i--) {
      const match = elements[i].rawXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/);
      if (match) return match[0];
    }

    const bodySectPr = suffix.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/);
    if (bodySectPr) return bodySectPr[0];

    // Extremely defensive fallback for malformed/legacy documents.
    return '<w:sectPr><w:pgSz w:w="11906" w:h="16838" w:code="9"/><w:pgMar w:top="2268" w:right="1701" w:bottom="1701" w:left="2268" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';
  };

  // A rendered page boundary is more reliable than a heading/endElementIndex.
  // In Word files exported from templates, the heading can appear in the TOC,
  // while the real page heading contains <w:lastRenderedPageBreak/>. The parser
  // records both as hasPageBreak=true. We therefore use the actual page range
  // for the two signed pages.
  const findPageEnd = (startIndex: number): number => {
    const maxSearch = Math.min(startIndex + 35, elements.length - 1);
    for (let i = startIndex + 1; i <= maxSearch; i++) {
      if (elements[i].hasPageBreak || elements[i].hasSectPr) return i - 1;
      const u = elements[i].text.toUpperCase();
      if (
        elements[i].isHeading ||
        u.startsWith('HALAMAN ') ||
        u.startsWith('BAB ') ||
        u.startsWith('LAMPIRAN ') ||
        u === 'ABSTRAK' ||
        u === 'KATA PENGANTAR' ||
        u.startsWith('DAFTAR ')
      ) {
        return i - 1;
      }
    }
    return Math.min(startIndex + 15, elements.length - 1);
  };

  const sectionStart = (elementIndex: number) =>
    generateSectionBreakXml(getOriginalSectPrBefore(elementIndex), {
      top: TWO_CM_TWIPS,
      right: TWO_CM_TWIPS,
      bottom: TWO_CM_TWIPS,
      left: TWO_CM_TWIPS,
    });

  const sectionRestore = (elementIndex: number) =>
    generateSectionBreakXml(getOriginalSectPrBefore(elementIndex));

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
  const calculateDimensions2CmMargins = (
    scan: ScanFile,
    mode: 'full_page' | 'half_page'
  ): { cx: number; cy: number } => {
    const targetCx = 5600000; // ~15.8 cm width for 2 cm margin
    const ratio = scan.aspectRatio || (scan.width && scan.height ? scan.width / scan.height : 0.707);

    if (mode === 'half_page') {
      const maxCy = 3900000; // ~11.0 cm height for 2 cards per page
      let cy = Math.round(targetCx / ratio);
      let cx = targetCx;
      if (cy > maxCy) {
        cy = maxCy;
        cx = Math.round(maxCy * ratio);
      }
      return { cx, cy };
    } else {
      const maxCy = 8200000; // ~23.1 cm height for full page scan
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
  // Margin 2 cm hanya berlaku pada dua halaman nyata yang ditemukan dari
  // page-break/rendered-page-break. Halaman sebelum dan sesudahnya tidak diganti.
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

    logs.push(`✓ Halaman Persetujuan & Pengesahan diganti foto asli (Margin 2 cm khusus)`);
    logs.push(`✓ Halaman setelah lembar tanda tangan dikembalikan ke section/margin asli dokumen`);

    const dimSetuju = calculateDimensions2CmMargins(scanPersetujuan, 'full_page');
    const dimSah = calculateDimensions2CmMargins(scanPengesahan, 'full_page');

    let repCombined = sectionStart(persetujuanIdx);
    repCombined += generateDrawingXml(rIdSetuju, nextDocPrId++, dimSetuju.cx, dimSetuju.cy, 'Halaman Persetujuan');
    repCombined += generatePageBreakXml();
    repCombined += generateDrawingXml(rIdSah, nextDocPrId++, dimSah.cx, dimSah.cy, 'Halaman Pengesahan');
    repCombined += sectionRestore(pengesahanIdx);

    const persetujuanStart = persetujuanIdx;
    const pengesahanEnd = findPageEnd(pengesahanIdx);

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

    let rep = sectionStart(persetujuanIdx);
    rep += generateDrawingXml(rId, nextDocPrId++, dim.cx, dim.cy, 'Halaman Persetujuan');
    rep += sectionRestore(persetujuanIdx);

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

    let rep = sectionStart(pengesahanIdx);
    rep += generateDrawingXml(rId, nextDocPrId++, dim.cx, dim.cy, 'Halaman Pengesahan');
    rep += sectionRestore(pengesahanIdx);

    replacements.push({
      startIndex: pengesahanIdx,
      endIndex: findPageEnd(pengesahanIdx),
      replacementXml: rep,
    });
  }

  // =========================================================================
  // 2. PROSES SURAT PERNYATAAN KEASLIAN TULISAN
  // Posisi: Setelah Daftar Pustaka / Daftar Rujukan berakhir pada halaman baru.
  // Auto-replace halaman teks pernyataan keaslian jika sudah ada di Word.
  // Margin 2 cm pada halaman ini.
  // =========================================================================
  const keaslianTarget = targets.find((t) => t.id === 'keaslian');

  if (keaslianTarget?.assignedScanId) {
    const scan = scanMap.get(keaslianTarget.assignedScanId);
    if (scan) {
      const { rId } = await registerImage(scan, 'keaslian');
      logs.push(`✓ Surat Pernyataan Keaslian Tulisan diproses setelah Daftar Pustaka (Margin 2 cm diterapkan)`);
      const dim = calculateDimensions2CmMargins(scan, 'full_page');

      let rep = sectionStart(keaslianTarget.elementIndex ?? 0);
      rep += generateDrawingXml(rId, nextDocPrId++, dim.cx, dim.cy, 'Surat Pernyataan Keaslian Tulisan');
      rep += generatePageBreakXml();
      rep += sectionRestore(keaslianTarget.elementIndex ?? 0);

      if (keaslianTarget.elementIndex !== undefined && keaslianTarget.elementIndex >= 0) {
        replacements.push({
          startIndex: keaslianTarget.elementIndex,
          endIndex: keaslianTarget.endElementIndex || keaslianTarget.elementIndex,
          replacementXml: rep,
        });
      }
    }
  }

  // =========================================================================
  // 3. PROSES 5 LAMPIRAN UTAMA (Margin 2 cm Khusus)
  // Surat Tugas Pembimbing, Kartu Bimbingan, Izin, Telah Meneliti, Bebas Plagiasi
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

  if (anchorMatch && options.useAnchorFor5Attachments && hasAnchorAttachments) {
    logs.push(`✓ Titik penempatan 5 Lampiran aktif pada kata kunci anchor (Margin 2 cm diterapkan)`);

    let combined5Xml = sectionStart(anchorMatch.index);

    // 1. Surat Tugas Pembimbing
    if (targetSuratTugas?.assignedScanId) {
      const scan = scanMap.get(targetSuratTugas.assignedScanId);
      if (scan) {
        const { rId } = await registerImage(scan, 'surat_tugas');
        logs.push('✓ Keterangan & foto Surat Tugas Pembimbing ditempatkan (Margin 2 cm)');
        const dim = calculateDimensions2CmMargins(scan, 'full_page');
        combined5Xml += generateCaptionXml('Surat Tugas Pembimbing');
        combined5Xml += generateSpacingXml();
        combined5Xml += generateDrawingXml(rId, nextDocPrId++, dim.cx, dim.cy, 'Surat Tugas Pembimbing');
        combined5Xml += generatePageBreakXml();
      }
    }

    // 2. Kartu Bimbingan
    if (targetKbDepan?.assignedScanId) {
      const scanDepan = scanMap.get(targetKbDepan.assignedScanId);
      const scanBelakang = targetKbBelakang?.assignedScanId ? scanMap.get(targetKbBelakang.assignedScanId) : null;

      if (scanDepan) {
        const { rId: rIdDepan } = await registerImage(scanDepan, 'kb_depan');
        logs.push('✓ Keterangan & foto Kartu Bimbingan Bagian Atas (Identitas) ditempatkan');

        let rIdBelakang: string | null = null;
        if (scanBelakang) {
          const res = await registerImage(scanBelakang, 'kb_belakang');
          rIdBelakang = res.rId;
          logs.push('✓ Foto Kartu Bimbingan Bagian Bawah (Catatan Konsultasi) ditempatkan');
        }

        combined5Xml += generateCaptionXml('Kartu Bimbingan');
        combined5Xml += generateSpacingXml();

        if (options.kartuBimbinganLayout === 'single_page' && rIdBelakang && scanBelakang) {
          const dimDepan = calculateDimensions2CmMargins(scanDepan, 'half_page');
          const dimBelakang = calculateDimensions2CmMargins(scanBelakang, 'half_page');
          combined5Xml += generateDrawingXml(rIdDepan, nextDocPrId++, dimDepan.cx, dimDepan.cy, 'Kartu Bimbingan Depan');
          combined5Xml += generateSpacingXml();
          combined5Xml += generateDrawingXml(rIdBelakang, nextDocPrId++, dimBelakang.cx, dimBelakang.cy, 'Kartu Bimbingan Belakang');
          combined5Xml += generatePageBreakXml();
        } else {
          const dimDepan = calculateDimensions2CmMargins(scanDepan, 'full_page');
          combined5Xml += generateDrawingXml(rIdDepan, nextDocPrId++, dimDepan.cx, dimDepan.cy, 'Kartu Bimbingan Depan');
          if (rIdBelakang && scanBelakang) {
            combined5Xml += generatePageBreakXml();
            combined5Xml += generateCaptionXml('Kartu Bimbingan (Lanjutan)');
            combined5Xml += generateSpacingXml();
            const dimBelakang = calculateDimensions2CmMargins(scanBelakang, 'full_page');
            combined5Xml += generateDrawingXml(rIdBelakang, nextDocPrId++, dimBelakang.cx, dimBelakang.cy, 'Kartu Bimbingan Belakang');
          }
          combined5Xml += generatePageBreakXml();
        }
      }
    }

    // 3. Surat Permohonan Izin Penelitian
    if (targetIzin?.assignedScanId) {
      const scan = scanMap.get(targetIzin.assignedScanId);
      if (scan) {
        const { rId } = await registerImage(scan, 'izin_penelitian');
        logs.push('✓ Keterangan & foto Surat Permohonan Izin Penelitian ditempatkan');
        const dim = calculateDimensions2CmMargins(scan, 'full_page');
        combined5Xml += generateCaptionXml('Surat Permohonan Izin Penelitian');
        combined5Xml += generateSpacingXml();
        combined5Xml += generateDrawingXml(rId, nextDocPrId++, dim.cx, dim.cy, 'Surat Permohonan Izin Penelitian');
        combined5Xml += generatePageBreakXml();
      }
    }

    // 4. Surat Keterangan Telah Meneliti
    if (targetTelahMeneliti?.assignedScanId) {
      const scan = scanMap.get(targetTelahMeneliti.assignedScanId);
      if (scan) {
        const { rId } = await registerImage(scan, 'telah_meneliti');
        logs.push('✓ Keterangan & foto Surat Keterangan Telah Meneliti ditempatkan');
        const dim = calculateDimensions2CmMargins(scan, 'full_page');
        combined5Xml += generateCaptionXml('Surat Keterangan Telah Meneliti');
        combined5Xml += generateSpacingXml();
        combined5Xml += generateDrawingXml(rId, nextDocPrId++, dim.cx, dim.cy, 'Surat Keterangan Telah Meneliti');
        combined5Xml += generatePageBreakXml();
      }
    }

    // 5. Surat Keterangan Bebas Plagiasi
    if (targetBebasPlagiasi?.assignedScanId) {
      const scan = scanMap.get(targetBebasPlagiasi.assignedScanId);
      if (scan) {
        const { rId } = await registerImage(scan, 'bebas_plagiasi');
        logs.push('✓ Keterangan & foto Surat Keterangan Bebas Plagiasi ditempatkan');
        const dim = calculateDimensions2CmMargins(scan, 'full_page');
        combined5Xml += generateCaptionXml('Surat Keterangan Bebas Plagiasi');
        combined5Xml += generateSpacingXml();
        combined5Xml += generateDrawingXml(rId, nextDocPrId++, dim.cx, dim.cy, 'Surat Keterangan Bebas Plagiasi');
      }
    }

    // End the temporary 2 cm section so the rest of the document keeps its
    // exact original section/page setup.
    combined5Xml += sectionRestore(anchorMatch.index);

    if (combined5Xml.length > 0) {
      replacements.push({
        startIndex: anchorMatch.index,
        endIndex: anchorMatch.index,
        replacementXml: combined5Xml,
      });
    }
  } else {
    // Individual fallback placements with 2 cm margin
    const processedLampiranIds = new Set<string>();

    if (targetSuratTugas?.assignedScanId && targetSuratTugas.elementIndex !== undefined) {
      const scan = scanMap.get(targetSuratTugas.assignedScanId);
      if (scan) {
        const { rId } = await registerImage(scan, 'surat_tugas');
        logs.push('✓ Keterangan & foto Surat Tugas Pembimbing ditempatkan (Margin 2 cm diterapkan)');
        const dim = calculateDimensions2CmMargins(scan, 'full_page');
        const headingXml = elements[targetSuratTugas.elementIndex].rawXml;
        let rep = sectionStart(targetSuratTugas.elementIndex) + headingXml + generateSpacingXml();
        rep += generateDrawingXml(rId, nextDocPrId++, dim.cx, dim.cy, 'Surat Tugas Pembimbing');
        rep += sectionRestore(targetSuratTugas.elementIndex);
        replacements.push({
          startIndex: targetSuratTugas.elementIndex,
          endIndex: targetSuratTugas.endElementIndex || targetSuratTugas.elementIndex,
          replacementXml: rep,
        });
        processedLampiranIds.add('surat_tugas');
      }
    }

    if (targetKbDepan?.assignedScanId && targetKbDepan.elementIndex !== undefined) {
      const scanDepan = scanMap.get(targetKbDepan.assignedScanId);
      const scanBelakang = targetKbBelakang?.assignedScanId ? scanMap.get(targetKbBelakang.assignedScanId) : null;

      if (scanDepan) {
        const { rId: rIdDepan } = await registerImage(scanDepan, 'kb_depan');
        logs.push('✓ Keterangan & foto Kartu Bimbingan Bagian Atas ditempatkan');
        let rIdBelakang: string | null = null;
        if (scanBelakang) {
          const res = await registerImage(scanBelakang, 'kb_belakang');
          rIdBelakang = res.rId;
          logs.push('✓ Foto Kartu Bimbingan Bagian Bawah ditempatkan');
        }

        const headingXml = elements[targetKbDepan.elementIndex].rawXml;
        let rep = sectionStart(targetKbDepan.elementIndex) + headingXml + generateSpacingXml();

        if (options.kartuBimbinganLayout === 'single_page' && rIdBelakang && scanBelakang) {
          const dimDepan = calculateDimensions2CmMargins(scanDepan, 'half_page');
          const dimBelakang = calculateDimensions2CmMargins(scanBelakang, 'half_page');
          rep += generateDrawingXml(rIdDepan, nextDocPrId++, dimDepan.cx, dimDepan.cy, 'Kartu Bimbingan Depan');
          rep += generateSpacingXml();
          rep += generateDrawingXml(rIdBelakang, nextDocPrId++, dimBelakang.cx, dimBelakang.cy, 'Kartu Bimbingan Belakang');
        } else {
          const dimDepan = calculateDimensions2CmMargins(scanDepan, 'full_page');
          rep += generateDrawingXml(rIdDepan, nextDocPrId++, dimDepan.cx, dimDepan.cy, 'Kartu Bimbingan Depan');
          if (rIdBelakang && scanBelakang) {
            rep += generatePageBreakXml();
            const dimBelakang = calculateDimensions2CmMargins(scanBelakang, 'full_page');
            rep += generateDrawingXml(rIdBelakang, nextDocPrId++, dimBelakang.cx, dimBelakang.cy, 'Kartu Bimbingan Belakang');
          }
        }

        rep += sectionRestore(targetKbDepan.elementIndex);

        replacements.push({
          startIndex: targetKbDepan.elementIndex,
          endIndex: targetKbDepan.endElementIndex || targetKbDepan.elementIndex,
          replacementXml: rep,
        });
        processedLampiranIds.add('kartu_bimbingan_depan');
        processedLampiranIds.add('kartu_bimbingan_belakang');
      }
    }

    if (targetIzin?.assignedScanId && targetIzin.elementIndex !== undefined) {
      const scan = scanMap.get(targetIzin.assignedScanId);
      if (scan) {
        const { rId } = await registerImage(scan, 'izin_penelitian');
        logs.push('✓ Surat Permohonan Izin Penelitian ditempatkan');
        const dim = calculateDimensions2CmMargins(scan, 'full_page');
        const headingXml = elements[targetIzin.elementIndex].rawXml;
        let rep = sectionStart(targetIzin.elementIndex) + headingXml + generateSpacingXml();
        rep += generateDrawingXml(rId, nextDocPrId++, dim.cx, dim.cy, 'Surat Permohonan Izin Penelitian');
        rep += sectionRestore(targetIzin.elementIndex);
        replacements.push({
          startIndex: targetIzin.elementIndex,
          endIndex: targetIzin.endElementIndex || targetIzin.elementIndex,
          replacementXml: rep,
        });
        processedLampiranIds.add('izin_penelitian');
      }
    }

    if (targetTelahMeneliti?.assignedScanId && targetTelahMeneliti.elementIndex !== undefined) {
      const scan = scanMap.get(targetTelahMeneliti.assignedScanId);
      if (scan) {
        const { rId } = await registerImage(scan, 'telah_meneliti');
        logs.push('✓ Surat Keterangan Telah Meneliti ditempatkan');
        const dim = calculateDimensions2CmMargins(scan, 'full_page');
        const headingXml = elements[targetTelahMeneliti.elementIndex].rawXml;
        let rep = sectionStart(targetTelahMeneliti.elementIndex) + headingXml + generateSpacingXml();
        rep += generateDrawingXml(rId, nextDocPrId++, dim.cx, dim.cy, 'Surat Keterangan Telah Meneliti');
        rep += sectionRestore(targetTelahMeneliti.elementIndex);
        replacements.push({
          startIndex: targetTelahMeneliti.elementIndex,
          endIndex: targetTelahMeneliti.endElementIndex || targetTelahMeneliti.elementIndex,
          replacementXml: rep,
        });
        processedLampiranIds.add('telah_meneliti');
      }
    }

    if (targetBebasPlagiasi?.assignedScanId && targetBebasPlagiasi.elementIndex !== undefined) {
      const scan = scanMap.get(targetBebasPlagiasi.assignedScanId);
      if (scan) {
        const { rId } = await registerImage(scan, 'bebas_plagiasi');
        logs.push('✓ Surat Keterangan Bebas Plagiasi ditempatkan');
        const dim = calculateDimensions2CmMargins(scan, 'full_page');
        const headingXml = elements[targetBebasPlagiasi.elementIndex].rawXml;
        let rep = sectionStart(targetBebasPlagiasi.elementIndex) + headingXml + generateSpacingXml();
        rep += generateDrawingXml(rId, nextDocPrId++, dim.cx, dim.cy, 'Surat Keterangan Bebas Plagiasi');
        rep += sectionRestore(targetBebasPlagiasi.elementIndex);
        replacements.push({
          startIndex: targetBebasPlagiasi.elementIndex,
          endIndex: targetBebasPlagiasi.endElementIndex || targetBebasPlagiasi.elementIndex,
          replacementXml: rep,
        });
        processedLampiranIds.add('bebas_plagiasi');
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
