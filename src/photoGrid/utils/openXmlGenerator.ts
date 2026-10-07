import JSZip from 'jszip';
import {
  cmToEmu,
  cmToTwips,
  PAPER_PRESETS,
} from './conversions';
import {
  CalculatedLayout,
  GridConfig,
  PhotoItem,
  ResolvedRowLayout,
} from '../types';
import { processImageToBlob } from './imageProcessor';

export function getPhotoSlotKey(photoId: string, widthCm: number, heightCm: number): string {
  return `${photoId}_${widthCm.toFixed(2)}x${heightCm.toFixed(2)}`;
}

export function calculateLayout(
  photos: PhotoItem[],
  config: GridConfig
): CalculatedLayout {
  // Determine paper dimensions
  let pW: number;
  let pH: number;

  if (config.paperType === 'Custom') {
    pW = config.customPaperWidthCm;
    pH = config.customPaperHeightCm;
  } else {
    const preset = PAPER_PRESETS[config.paperType] || PAPER_PRESETS.A4;
    pW = preset.widthCm;
    pH = preset.heightCm;
  }

  // Adjust for orientation
  const pageWidthCm = config.orientation === 'landscape' ? Math.max(pW, pH) : Math.min(pW, pH);
  const pageHeightCm = config.orientation === 'landscape' ? Math.min(pW, pH) : Math.max(pW, pH);

  // Margins
  const m = config.margins;
  const printableWidthCm = Math.max(1, pageWidthCm - m.leftCm - m.rightCm);
  const printableHeightCm = Math.max(1, pageHeightCm - m.topCm - m.bottomCm);

  const photoWidthCm = Math.max(0.5, config.targetWidthCm);
  const photoHeightCm = Math.max(0.5, config.targetHeightCm);
  const gutterCm = Math.max(0, config.gutterCm);
  const rowSpacingCm = Math.max(0, config.rowSpacingCm);

  // Extra height per cell if label/caption is enabled
  const labelExtraCm = config.showLabels ? 0.6 : 0;

  const resolvedRows: ResolvedRowLayout[] = [];

  if (config.sizeLayoutMode === 'per_row' && config.rowConfigs && config.rowConfigs.length > 0) {
    config.rowConfigs.forEach((rc, idx) => {
      const rW = Math.max(0.5, rc.widthCm);
      const rH = Math.max(0.5, rc.heightCm);
      let rCols: number;
      if (rc.columnsMode === 'custom' && rc.customColumns > 0) {
        rCols = rc.customColumns;
      } else if (config.columnsMode === 'custom' && config.customColumns > 0) {
        rCols = config.customColumns;
      } else {
        const fitCols = Math.floor((printableWidthCm + gutterCm) / (rW + gutterCm));
        rCols = Math.max(1, fitCols);
      }

      resolvedRows.push({
        rowIndex: idx,
        widthCm: rW,
        heightCm: rH,
        columns: rCols,
        emuWidth: cmToEmu(rW),
        emuHeight: cmToEmu(rH),
        twipWidth: cmToTwips(rW),
        twipHeight: cmToTwips(rH),
      });
    });
  } else {
    const effectiveCellHeightCm = photoHeightCm + labelExtraCm;
    let columns: number;
    if (config.columnsMode === 'custom' && config.customColumns > 0) {
      columns = config.customColumns;
    } else {
      const fitCols = Math.floor((printableWidthCm + gutterCm) / (photoWidthCm + gutterCm));
      columns = Math.max(1, fitCols);
    }

    const fitRows = Math.floor(
      (printableHeightCm + rowSpacingCm) / (effectiveCellHeightCm + rowSpacingCm)
    );
    const rowsPerPage = Math.max(1, fitRows);

    for (let r = 0; r < rowsPerPage; r++) {
      resolvedRows.push({
        rowIndex: r,
        widthCm: photoWidthCm,
        heightCm: photoHeightCm,
        columns,
        emuWidth: cmToEmu(photoWidthCm),
        emuHeight: cmToEmu(photoHeightCm),
        twipWidth: cmToTwips(photoWidthCm),
        twipHeight: cmToTwips(photoHeightCm),
      });
    }
  }

  const rowsPerPage = Math.max(1, resolvedRows.length);
  const columns = resolvedRows[0]?.columns || 1;
  const photosPerPage = Math.max(
    1,
    resolvedRows.reduce((acc, r) => acc + r.columns, 0)
  );

  // Count total items including duplicates/copies
  const totalPhotosWithCopies = photos.reduce((acc, p) => acc + (p.copies || 1), 0);
  const totalPages = Math.max(1, Math.ceil(totalPhotosWithCopies / photosPerPage));

  // Convert to EMU & Twips (primary/first row fallback)
  const emuWidth = cmToEmu(photoWidthCm);
  const emuHeight = cmToEmu(photoHeightCm);

  const twipWidth = cmToTwips(photoWidthCm);
  const twipHeight = cmToTwips(photoHeightCm);
  const twipPageWidth = cmToTwips(pageWidthCm);
  const twipPageHeight = cmToTwips(pageHeightCm);

  const twipMargins = {
    top: cmToTwips(m.topCm),
    bottom: cmToTwips(m.bottomCm),
    left: cmToTwips(m.leftCm),
    right: cmToTwips(m.rightCm),
  };

  return {
    pageWidthCm,
    pageHeightCm,
    printableWidthCm,
    printableHeightCm,
    columns,
    rowsPerPage,
    photosPerPage,
    totalPages,
    totalPhotosWithCopies,
    photoWidthCm,
    photoHeightCm,
    gutterCm,
    rowSpacingCm,
    emuWidth,
    emuHeight,
    twipWidth,
    twipHeight,
    twipPageWidth,
    twipPageHeight,
    twipMargins,
    resolvedRows,
  };
}

export interface ImageRelationship {
  id: string;
  rId: string;
  fileName: string;
  blob: Blob;
  name: string;
}

export interface ExpandedPhotoItem {
  photo: PhotoItem;
  copyIndex: number;
  label: string;
}

export function expandPhotosWithCopies(
  photos: PhotoItem[],
  labelType: 'filename' | 'counter' | 'blank'
): ExpandedPhotoItem[] {
  const result: ExpandedPhotoItem[] = [];
  let counter = 1;

  for (const photo of photos) {
    const count = Math.max(1, photo.copies || 1);
    for (let c = 0; c < count; c++) {
      let label = '';
      if (labelType === 'filename') {
        label = photo.name.replace(/\.[^/.]+$/, '');
        if (count > 1) label += ` #${c + 1}`;
      } else if (labelType === 'counter') {
        label = `Foto ${counter}`;
      }
      result.push({
        photo,
        copyIndex: c,
        label,
      });
      counter++;
    }
  }

  return result;
}

/**
 * Escapes XML special characters for safety in Word OpenXML
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates document.xml Office OpenXML string conforming to ECMA-376 standard
 */
export function generateDocumentXml(
  expandedPhotos: ExpandedPhotoItem[],
  photoRIdMap: Map<string, string>,
  layout: CalculatedLayout,
  config: GridConfig
): string {
  const {
    photosPerPage,
    totalPages,
    twipPageWidth,
    twipPageHeight,
    twipMargins,
    gutterCm,
    rowSpacingCm,
    resolvedRows,
  } = layout;

  const twipGutter = cmToTwips(gutterCm);
  const twipHalfGutter = Math.round(twipGutter / 2);
  const twipRowSpacing = cmToTwips(rowSpacingCm);
  const twipHalfRowSpacing = Math.round(twipRowSpacing / 2);

  // Border settings for cut guides
  const cutBordersXml = config.showCutGuides
    ? `<w:tcBorders>
        <w:top w:val="dashed" w:sz="4" w:space="0" w:color="999999"/>
        <w:left w:val="dashed" w:sz="4" w:space="0" w:color="999999"/>
        <w:bottom w:val="dashed" w:sz="4" w:space="0" w:color="999999"/>
        <w:right w:val="dashed" w:sz="4" w:space="0" w:color="999999"/>
      </w:tcBorders>`
    : `<w:tcBorders>
        <w:top w:val="none"/>
        <w:left w:val="none"/>
        <w:bottom w:val="none"/>
        <w:right w:val="none"/>
      </w:tcBorders>`;

  let bodyContent = '';

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const pageStartIndex = pageIdx * photosPerPage;
    const pageItems = expandedPhotos.slice(pageStartIndex, pageStartIndex + photosPerPage);

    if (pageItems.length === 0) continue;

    // Add page break if subsequent page
    if (pageIdx > 0) {
      bodyContent += `
    <w:p>
      <w:pPr>
        <w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>
      </w:pPr>
      <w:r>
        <w:br w:type="page"/>
      </w:r>
    </w:p>`;
    }

    let consumedInPage = 0;

    for (let r = 0; r < resolvedRows.length; r++) {
      if (consumedInPage >= pageItems.length) break;

      const rowLayout = resolvedRows[r];
      const rowCols = rowLayout.columns;
      const rowEmuW = rowLayout.emuWidth;
      const rowEmuH = rowLayout.emuHeight;
      const rowTwipColW = rowLayout.twipWidth;

      let rowCells = '';
      for (let c = 0; c < rowCols; c++) {
        const itemIndex = consumedInPage + c;
        if (itemIndex < pageItems.length) {
          const item = pageItems[itemIndex];
          const slotKey = getPhotoSlotKey(item.photo.id, rowLayout.widthCm, rowLayout.heightCm);
          const rId =
            photoRIdMap.get(slotKey) ||
            photoRIdMap.get(item.photo.id) ||
            'rId1';
          const docPrId = pageStartIndex + itemIndex + 100;
          const photoName = escapeXml(item.photo.name);
          const labelText = escapeXml(item.label);

          rowCells += `
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="${rowTwipColW}" w:type="dxa"/>
            <w:tcMar>
              <w:top w:w="${twipHalfRowSpacing}" w:type="dxa"/>
              <w:left w:w="${twipHalfGutter}" w:type="dxa"/>
              <w:bottom w:w="${twipHalfRowSpacing}" w:type="dxa"/>
              <w:right w:w="${twipHalfGutter}" w:type="dxa"/>
            </w:tcMar>
            ${cutBordersXml}
            <w:vAlign w:val="center"/>
          </w:tcPr>
          <w:p>
            <w:pPr>
              <w:jc w:val="center"/>
              <w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>
            </w:pPr>
            <w:r>
              <w:drawing>
                <wp:inline distT="0" distB="0" distL="0" distR="0">
                  <wp:extent cx="${rowEmuW}" cy="${rowEmuH}"/>
                  <wp:effectExtent l="0" t="0" r="0" b="0"/>
                  <wp:docPr id="${docPrId}" name="${photoName}"/>
                  <wp:cNvGraphicFramePr>
                    <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
                  </wp:cNvGraphicFramePr>
                  <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
                    <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                      <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                        <pic:nvPicPr>
                          <pic:cNvPr id="${docPrId}" name="${photoName}"/>
                          <pic:cNvPicPr/>
                        </pic:nvPicPr>
                        <pic:blipFill>
                          <a:blip r:embed="${rId}"/>
                          <a:stretch>
                            <a:fillRect/>
                          </a:stretch>
                        </pic:blipFill>
                        <pic:spPr>
                          <a:xfrm>
                            <a:off x="0" y="0"/>
                            <a:ext cx="${rowEmuW}" cy="${rowEmuH}"/>
                          </a:xfrm>
                          <a:prstGeom prst="rect">
                            <a:avLst/>
                          </a:prstGeom>
                        </pic:spPr>
                      </pic:pic>
                    </a:graphicData>
                  </a:graphic>
                </wp:inline>
              </w:drawing>
            </w:r>
          </w:p>${
            config.showLabels && labelText
              ? `
          <w:p>
            <w:pPr>
              <w:jc w:val="center"/>
              <w:spacing w:before="40" w:after="20"/>
            </w:pPr>
            <w:r>
              <w:rPr>
                <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
                <w:sz w:val="14"/>
                <w:color w:val="666666"/>
              </w:rPr>
              <w:t>${labelText}</w:t>
            </w:r>
          </w:p>`
              : ''
          }
        </w:tc>`;
        } else {
          // Empty cell in last row to maintain grid width
          rowCells += `
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="${rowTwipColW}" w:type="dxa"/>
            <w:tcBorders>
              <w:top w:val="none"/>
              <w:left w:val="none"/>
              <w:bottom w:val="none"/>
              <w:right w:val="none"/>
            </w:tcBorders>
          </w:tcPr>
          <w:p>
            <w:pPr>
              <w:spacing w:before="0" w:after="0"/>
            </w:pPr>
          </w:p>
        </w:tc>`;
        }
      }

      consumedInPage += rowCols;

      let gridColsXml = '';
      for (let c = 0; c < rowCols; c++) {
        gridColsXml += `<w:gridCol w:w="${rowTwipColW}"/>`;
      }

      // Check for STNK dimensions (23x7.5cm) to center it in A4
      const isStnk = Math.abs(rowLayout.widthCm - 23.0) < 0.1 && Math.abs(rowLayout.heightCm - 7.5) < 0.1;
      const tblW = isStnk ? `<w:tblW w:w="0" w:type="auto"/>` : `<w:tblW w:w="0" w:type="auto"/>`;
      const jc = isStnk ? `<w:jc w:val="center"/>` : `<w:jc w:val="center"/>`;

      bodyContent += `
    <w:tbl>
      <w:tblPr>
        ${tblW}
        ${jc}
        <w:tblBorders>
          <w:top w:val="none"/>
          <w:left w:val="none"/>
          <w:bottom w:val="none"/>
          <w:right w:val="none"/>
          <w:insideH w:val="none"/>
          <w:insideV w:val="none"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid>
        ${gridColsXml}
      </w:tblGrid>
      <w:tr>
        <w:trPr>
          <w:cantSplit/>
        </w:trPr>
        ${rowCells}
      </w:tr>
    </w:tbl>`;
    }
  }

  // Final section properties (page size, orientation, margins in Twips)
  const orientationAttr = config.orientation === 'landscape' ? 'w:orient="landscape"' : 'w:orient="portrait"';

  const sectPrXml = `
    <w:sectPr>
      <w:pgSz w:w="${twipPageWidth}" w:h="${twipPageHeight}" ${orientationAttr}/>
      <w:pgMar w:top="${twipMargins.top}" w:right="${twipMargins.right}" w:bottom="${twipMargins.bottom}" w:left="${twipMargins.left}" w:header="720" w:footer="720" w:gutter="0"/>
      <w:cols w:space="720"/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
${bodyContent}
${sectPrXml}
  </w:body>
</w:document>`;
}

/**
 * Builds standard [Content_Types].xml
 */
function buildContentTypesXml(imageFiles: { ext: string }[]): string {
  const extensions = new Set<string>(['png', 'jpeg', 'jpg']);
  for (const img of imageFiles) {
    extensions.add(img.ext.toLowerCase());
  }

  let defaultsXml = '';
  defaultsXml += `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n`;
  defaultsXml += `<Default Extension="xml" ContentType="application/xml"/>\n`;

  for (const ext of extensions) {
    if (ext === 'jpg' || ext === 'jpeg') {
      defaultsXml += `<Default Extension="${ext}" ContentType="image/jpeg"/>\n`;
    } else if (ext === 'png') {
      defaultsXml += `<Default Extension="png" ContentType="image/png"/>\n`;
    } else if (ext === 'webp') {
      defaultsXml += `<Default Extension="webp" ContentType="image/webp"/>\n`;
    }
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  ${defaultsXml}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
</Types>`;
}

/**
 * Builds _rels/.rels
 */
function buildRootRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
}

/**
 * Builds word/_rels/document.xml.rels
 */
function buildDocumentRelsXml(
  imageRelations: { rId: string; target: string }[]
): string {
  let imgRels = '';
  for (const rel of imageRelations) {
    imgRels += `<Relationship Id="${rel.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${rel.target}"/>\n`;
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  ${imgRels}
</Relationships>`;
}

/**
 * Builds minimal word/styles.xml
 */
function buildStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
        <w:lang w:val="id-ID"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
  <w:style w:type="table" w:default="1" w:styleId="TableNormal">
    <w:name w:val="Normal Table"/>
    <w:uiPriority w:val="99"/>
    <w:semiHidden/>
    <w:unhideWhenUsed/>
    <w:tblPr>
      <w:tblInd w:w="0" w:type="dxa"/>
      <w:tblCellMar>
        <w:top w:w="0" w:type="dxa"/>
        <w:left w:w="0" w:type="dxa"/>
        <w:bottom w:w="0" w:type="dxa"/>
        <w:right w:w="0" w:type="dxa"/>
      </w:tblCellMar>
    </w:tblPr>
  </w:style>
</w:styles>`;
}

/**
 * Builds minimal word/settings.xml
 */
function buildSettingsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:zoom w:percent="100"/>
  <w:defaultTabStop w:val="720"/>
  <w:compat>
    <w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>
  </w:compat>
</w:settings>`;
}

/**
 * Full Generator for .docx archive & document.xml template
 */
export async function generateDocxBlob(
  photos: PhotoItem[],
  config: GridConfig,
  onProgress?: (percent: number, statusText: string) => void
): Promise<{ docxBlob: Blob; documentXml: string }> {
  onProgress?.(10, 'Menghitung tata letak & rasio...');

  const layout = calculateLayout(photos, config);
  const expandedPhotos = expandPhotosWithCopies(photos, config.labelType);

  onProgress?.(25, 'Menyiapkan arsip OpenXML...');

  const zip = new JSZip();

  // Create unique image map and process Blobs per (photo, row dimensions)
  const photoRIdMap = new Map<string, string>();
  const imageRelations: { rId: string; target: string; ext: string }[] = [];
  const imageFiles: { ext: string }[] = [];

  // Identify all needed (photo, widthCm, heightCm) combinations across all pages/rows
  const neededSlots: { photo: PhotoItem; widthCm: number; heightCm: number; slotKey: string }[] = [];
  const seenSlotKeys = new Set<string>();

  for (let pageIdx = 0; pageIdx < layout.totalPages; pageIdx++) {
    const pageStartIndex = pageIdx * layout.photosPerPage;
    const pageItems = expandedPhotos.slice(pageStartIndex, pageStartIndex + layout.photosPerPage);
    let consumedInPage = 0;
    for (let r = 0; r < layout.resolvedRows.length; r++) {
      if (consumedInPage >= pageItems.length) break;
      const rowLayout = layout.resolvedRows[r];
      for (let c = 0; c < rowLayout.columns; c++) {
        const itemIndex = consumedInPage + c;
        if (itemIndex < pageItems.length) {
          const item = pageItems[itemIndex];
          const slotKey = getPhotoSlotKey(item.photo.id, rowLayout.widthCm, rowLayout.heightCm);
          if (!seenSlotKeys.has(slotKey)) {
            seenSlotKeys.add(slotKey);
            neededSlots.push({
              photo: item.photo,
              widthCm: rowLayout.widthCm,
              heightCm: rowLayout.heightCm,
              slotKey,
            });
          }
        }
      }
      consumedInPage += rowLayout.columns;
    }
  }

  let imgCounter = 1;
  const totalTasks = Math.max(1, neededSlots.length);

  for (let i = 0; i < neededSlots.length; i++) {
    const { photo, widthCm, heightCm, slotKey } = neededSlots[i];
    const rId = `rIdImg${imgCounter}`;
    photoRIdMap.set(slotKey, rId);
    if (!photoRIdMap.has(photo.id)) {
      photoRIdMap.set(photo.id, rId);
    }

    let blob: Blob | undefined;
    const isDefaultSize =
      Math.abs(widthCm - config.targetWidthCm) < 0.01 &&
      Math.abs(heightCm - config.targetHeightCm) < 0.01;

    if (isDefaultSize && photo.processedBlob) {
      blob = photo.processedBlob;
    } else {
      const processed = await processImageToBlob(photo.dataUrl, {
        widthCm,
        heightCm,
        mode: config.resizeMode,
        autoRotateMode: config.autoRotateMode,
        manualRotateAngle: photo.rotation || 0,
        dpi: config.dpi,
        backgroundColor: config.backgroundColor,
      });
      blob = processed.blob;
    }

    let ext = 'jpg';
    if (blob.type === 'image/png') ext = 'png';
    else if (blob.type === 'image/webp') ext = 'jpg';
    else ext = 'jpg';

    const filename = `image${imgCounter}.${ext}`;
    const targetPath = `media/${filename}`;

    const arrayBuffer = await blob.arrayBuffer();
    zip.file(`word/media/${filename}`, arrayBuffer);

    imageRelations.push({ rId, target: targetPath, ext });
    imageFiles.push({ ext });

    imgCounter++;

    const progressPct = 25 + Math.round(((i + 1) / totalTasks) * 45);
    onProgress?.(progressPct, `Menyisipkan gambar ${i + 1} dari ${totalTasks} (${widthCm}x${heightCm} cm)...`);
  }

  onProgress?.(75, 'Menyusun dokumen OpenXML (document.xml)...');

  const documentXml = generateDocumentXml(expandedPhotos, photoRIdMap, layout, config);

  // Write all OpenXML structure files
  zip.file('[Content_Types].xml', buildContentTypesXml(imageFiles));
  zip.file('_rels/.rels', buildRootRelsXml());
  zip.file('word/_rels/document.xml.rels', buildDocumentRelsXml(imageRelations));
  zip.file('word/document.xml', documentXml);
  zip.file('word/styles.xml', buildStylesXml());
  zip.file('word/settings.xml', buildSettingsXml());

  onProgress?.(90, 'Mengompresi ke arsip .docx...');

  const docxBlob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  onProgress?.(100, 'Selesai! Dokumen siap.');

  return { docxBlob, documentXml };
}

