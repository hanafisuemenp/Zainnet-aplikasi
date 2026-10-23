import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  Footer,
  PageNumber,
  FootnoteReferenceRun,
  LineRuleType,
} from 'docx';

import { JournalArticle } from '../types/journal';
import { cleanSectionContent, normalizePpkIBibliographyEntry } from './cleanSectionContent';
import { parseInlineFormatting } from './inlineFormatting';

/** Export Markdown inline emphasis as actual DOCX runs, never literal *...*. */
function inlineWordRuns(raw: string, size = 24, defaultBold = false, defaultItalic = false): TextRun[] {
  return parseInlineFormatting(sanitizeXmlText(raw)).map((part) => new TextRun({
    text: part.text,
    font: 'Times New Roman',
    size,
    bold: defaultBold || part.bold,
    italics: defaultItalic || part.italic,
  }));
}

/**
 * Sanitizes strings by removing XML-incompatible ASCII control characters,
 * which often cause "Word found unreadable content / cannot open file" errors.
 */
function sanitizeXmlText(str: string | undefined | null): string {
  if (!str) return '';
  return String(str)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

/**
 * Transliterated Arabic, Islamic economics, or foreign terms commonly found in thesis titles
 * that must be italicized in scholarly titles (PPKI BAB III & BAB IV).
 */
const FOREIGN_TITLE_TERMS = new Set([
  'MUDHARABAH',
  'MUSYARAKAH',
  'MURABAHAH',
  'IJARAH',
  'WADIAH',
  'ISTISHNA',
  'SALAM',
  'QARDH',
  'SUKUK',
  'TAKAFUL',
  'MAQASHID',
  'SYARIAH',
  'SHARIAH',
  'FIQH',
  'MUAMALAH',
  'NISBAH',
  'ZAKAT',
  'INFAQ',
  'SHADAQAH',
  'WAKAF',
  'ONLINE',
  'WEBSITE',
  'E-COMMERCE',
  'ECOMMERCE',
  'FINTECH',
  'DIGITAL MARKETING',
  'BRAND AWARENESS',
  'RETURN ON ASSET',
  'RETURN ON EQUITY',
  'EARNING PER SHARE',
]);

/**
 * Parses article title into TextRuns, preserving 100% exact wording of original skripsi title
 * while styling foreign terms in italics as required by PPKI.
 */
function parseTitleRuns(rawTitle: string): TextRun[] {
  if (!rawTitle) {
    return [
      new TextRun({
        text: 'ARTIKEL ILMIAH',
        font: 'Times New Roman',
        size: 28, // 14pt
        bold: true,
      }),
    ];
  }

  // Convert <i>...</i> or <em>...</em> to markdown asterisks
  let normalized = sanitizeXmlText(rawTitle)
    .replace(/<\/?(i|em)>/gi, '*')
    .trim();

  // Respect Markdown *italic*, **bold**, ***bold italic*** in titles.
  if (/\*{1,3}[^*\s]/.test(normalized)) {
    return parseInlineFormatting(normalized).map(part => new TextRun({
      text: part.text.toUpperCase(),
      font: 'Times New Roman',
      size: 28,
      bold: true,
      italics: part.italic,
    }));
  }

  // If no asterisks, check for known foreign/transliterated words in uppercase title
  const words = normalized.toUpperCase().split(/\s+/);
  const runs: TextRun[] = [];
  let buffer = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const strippedWord = word.replace(/[^A-Z-]/g, '');

    if (FOREIGN_TITLE_TERMS.has(strippedWord)) {
      if (buffer) {
        runs.push(
          new TextRun({
            text: buffer + ' ',
            font: 'Times New Roman',
            size: 28,
            bold: true,
            italics: false,
          })
        );
        buffer = '';
      }
      runs.push(
        new TextRun({
          text: word + (i < words.length - 1 ? ' ' : ''),
          font: 'Times New Roman',
          size: 28,
          bold: true,
          italics: true,
        })
      );
    } else {
      buffer = buffer ? `${buffer} ${word}` : word;
    }
  }

  if (buffer) {
    runs.push(
      new TextRun({
        text: buffer,
        font: 'Times New Roman',
        size: 28,
        bold: true,
        italics: false,
      })
    );
  }

  return runs.length > 0
    ? runs
    : [
        new TextRun({
          text: normalized.toUpperCase(),
          font: 'Times New Roman',
          size: 28,
          bold: true,
        }),
      ];
}

/**
 * Parses bibliography text containing markdown *italics* into docx TextRuns
 */
function parseBibliographyRuns(refText: string): TextRun[] {
  return inlineWordRuns(refText, 24);
}

/**
 * Creates and downloads a Microsoft Word (.docx) document formatted with universal
 * compatibility across all versions of Word (Word 2007-2024, Word 365, Word for Mac,
 * WPS Office, LibreOffice, and Word Online).
 * Export dasar artikel tanpa template jurnal. Untuk format jurnal, gunakan fitur Upload Template DOCX.
 */
export async function buildJournalDocx(article: JournalArticle): Promise<Blob> {
  const {
    metadata,
    abstract,
    pendahuluan,
    metode,
    hasil,
    pembahasan,
    kesimpulan,
    daftarPustaka,
    footnotes,
  } = article;

  // 1. Normalize and clean footnotes
  const validFootnotes: { number: number; text: string; sectionId?: string; anchorWord?: string }[] = [];
  const docxFootnotesMap: Record<number, { children: Paragraph[] }> = {};

  if (Array.isArray(footnotes) && footnotes.length > 0) {
    footnotes.forEach((fn, idx) => {
      const fnNum = typeof fn.number === 'number' && fn.number > 0 ? fn.number : idx + 1;
      const cleanText = sanitizeXmlText(fn.text);
      if (cleanText.trim().length > 0) {
        validFootnotes.push({
          number: fnNum,
          text: cleanText,
          sectionId: fn.sectionId,
          anchorWord: fn.anchorWord ? sanitizeXmlText(fn.anchorWord) : undefined,
        });

        // Footnote paragraph in Word footnotes.xml
        docxFootnotesMap[fnNum] = {
          children: [
            new Paragraph({
              alignment: AlignmentType.LEFT,
              children: [
                ...inlineWordRuns(cleanText, 20),
              ],
              spacing: { line: 240, after: 60, lineRule: LineRuleType.AUTO },
            }),
          ],
        };
      }
    });
  }

  // Set to track which footnotes have been attached in the document body
  // (CRITICAL: In OpenXML, each footnote must be referenced exactly once to prevent corruption)
  const attachedFootnoteNumbers = new Set<number>();

  // 2. Helper to split content text into paragraphs and safely attach footnotes
  const createFormattedParagraphs = (
    textBlock: string,
    sectionKey?: string,
    isFirstSection = false
  ): Paragraph[] => {
    if (!textBlock) return [];

    const rawLines = sanitizeXmlText(textBlock)
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);

    const paragraphs: Paragraph[] = [];

    // Footnotes should be placed only at an explicit [^n] marker or exact anchorWord.
    // Guessing a reference position makes academic citations misleading.

    rawLines.forEach((line) => {
      // Check if line is a sub-subheading (PPKI: no letter/number numbering for subheadings)
      const isSubHeading = !article.extractive && (
        line.startsWith('#') ||
        (/^([A-Za-z0-9]+[.)]\s+)/i.test(line) && line.length < 80 && !line.includes(';') && !line.includes(',')));

      if (isSubHeading) {
        const cleanSubHeading = line
          .replace(/^#+\s*/, '')
          .replace(/^[A-Za-z0-9]+[.)]\s+/, '')
          .trim();
        paragraphs.push(
          new Paragraph({
            children: [
              ...inlineWordRuns(cleanSubHeading, 24, true),
            ],
            alignment: AlignmentType.LEFT,
            spacing: { before: 240, after: 120, line: 360, lineRule: LineRuleType.AUTO },
          })
        );
        return;
      }

      // Build text runs and parse inline footnote markers [^1] or [1]
      const children: (TextRun | FootnoteReferenceRun)[] = [];

      // Check if line contains inline footnote markers e.g. [^1], [^2], [1], [2]
      const markerRegex = /(\[\^?\d+\])/g;
      if (markerRegex.test(line)) {
        const parts = line.split(markerRegex);
        parts.forEach((part) => {
          const match = part.match(/^\[\^?(\d+)\]$/);
          if (match) {
            const fnNum = parseInt(match[1], 10);
            if (docxFootnotesMap[fnNum] && !attachedFootnoteNumbers.has(fnNum)) {
              children.push(new FootnoteReferenceRun(fnNum));
              attachedFootnoteNumbers.add(fnNum);
            } else {
              // Keep marker visible for review rather than silently deleting the citation.
              children.push(...inlineWordRuns(part));
            }
          } else if (part) {
            children.push(...inlineWordRuns(part));
          }
        });
      } else {
        // Match anchor words inside already-parsed formatting segments so
        // e.g. *research gap* does not get split into literal asterisks.
        for (const part of parseInlineFormatting(line)) {
          let rest = part.text;
          while (rest.length > 0) {
            const nextAnchor = validFootnotes
              .filter(fn => fn.sectionId === sectionKey && fn.anchorWord && !attachedFootnoteNumbers.has(fn.number))
              .map(fn => ({ fn, index: rest.toLocaleLowerCase('id-ID').indexOf(fn.anchorWord!.toLocaleLowerCase('id-ID')) }))
              .filter(match => match.index >= 0)
              .sort((a, b) => a.index - b.index)[0];
            if (!nextAnchor) {
              children.push(new TextRun({ text: rest, font: 'Times New Roman', size: 24, bold: part.bold, italics: part.italic }));
              break;
            }
            const beforeAndAnchor = rest.slice(0, nextAnchor.index + nextAnchor.fn.anchorWord!.length);
            children.push(new TextRun({ text: beforeAndAnchor, font: 'Times New Roman', size: 24, bold: part.bold, italics: part.italic }));
            children.push(new FootnoteReferenceRun(nextAnchor.fn.number));
            attachedFootnoteNumbers.add(nextAnchor.fn.number);
            rest = rest.slice(beforeAndAnchor.length);
          }
        }
      }

      paragraphs.push(
        new Paragraph({
          children,
          alignment: AlignmentType.JUSTIFIED,
          indent: { firstLine: 720 }, // 1.27 cm (0.5 inch) first line indent
          spacing: { after: 140, line: 360, lineRule: LineRuleType.AUTO }, // 1.5 Line Spacing
        })
      );
    });

    return paragraphs;
  };

  // Build document body elements
  const docChildren: Paragraph[] = [];

  // 1. JUDUL ARTIKEL (PPKI: 100% identik dengan skripsi, miring jika ada istilah asing)
  const titleRuns = parseTitleRuns(metadata?.judul || 'ARTIKEL ILMIAH');
  docChildren.push(
    new Paragraph({
      children: titleRuns,
      alignment: AlignmentType.CENTER,
      spacing: { before: 180, after: 240, line: 360, lineRule: LineRuleType.AUTO },
    })
  );

  // 2. METADATA PENULIS (Nama, Prodi, Instansi, Email - tanpa gelar)
  const namaClean = sanitizeXmlText(metadata?.nama || 'Penulis');
  const prodiClean = sanitizeXmlText(metadata?.prodi || '');
  const instansiClean = sanitizeXmlText(metadata?.instansi || '');
  const emailClean = sanitizeXmlText(metadata?.email || '');

  docChildren.push(
    new Paragraph({
      children: [
        new TextRun({
          text: namaClean,
          font: 'Times New Roman',
          size: 24, // 12pt
          bold: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 60, line: 240, lineRule: LineRuleType.AUTO },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `${prodiClean}${instansiClean ? ', ' + instansiClean : ''}`,
          font: 'Times New Roman',
          size: 22, // 11pt
          italics: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: emailClean ? 60 : 360, line: 240, lineRule: LineRuleType.AUTO },
    })
  );

  if (emailClean && emailClean !== '-') {
    docChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Email: ${emailClean}`,
            font: 'Times New Roman',
            size: 22,
            italics: true,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 360, line: 240, lineRule: LineRuleType.AUTO },
      })
    );
  }

  // 3. ABSTRAK (BAHASA INDONESIA) - 10pt, spasi tunggal, margin menjorok masuk 1,2 cm
  const abstrakIndoClean = sanitizeXmlText(abstract?.abstrakIndo || '');
  const keywordsIndoClean = Array.isArray(abstract?.keywordsIndo)
    ? abstract.keywordsIndo.map(sanitizeXmlText).join(', ')
    : sanitizeXmlText(abstract?.keywordsIndo || '');

  docChildren.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'ABSTRAK',
          font: 'Times New Roman',
          size: 20, // 10pt sesuai Bab III Teknik Penulisan
          bold: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 140, after: 100, line: 240, lineRule: LineRuleType.AUTO },
    }),
    new Paragraph({
      children: [
        ...inlineWordRuns(abstrakIndoClean, 20),
      ],
      alignment: AlignmentType.JUSTIFIED,
      indent: { left: 680, right: 680 }, // Margin menjorok masuk 1.2 cm
      spacing: { after: 100, line: 240, lineRule: LineRuleType.AUTO }, // Spasi tunggal
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: 'Kata Kunci: ',
          font: 'Times New Roman',
          size: 20,
          bold: true,
          italics: true,
        }),
        ...inlineWordRuns(keywordsIndoClean, 20, false, true),
      ],
      alignment: AlignmentType.LEFT,
      indent: { left: 680, right: 680 },
      spacing: { after: 200, line: 240, lineRule: LineRuleType.AUTO },
    })
  );

  // 4. ABSTRACT (ENGLISH)
  const abstrakEnglishClean = sanitizeXmlText(abstract?.abstrakEnglish || '');
  const keywordsEnglishClean = Array.isArray(abstract?.keywordsEnglish)
    ? abstract.keywordsEnglish.map(sanitizeXmlText).join(', ')
    : sanitizeXmlText(abstract?.keywordsEnglish || '');

  if (abstrakEnglishClean) {
    docChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'ABSTRACT',
            font: 'Times New Roman',
            size: 20,
            bold: true,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 140, after: 100, line: 240, lineRule: LineRuleType.AUTO },
      }),
      new Paragraph({
        children: [
          ...inlineWordRuns(abstrakEnglishClean, 20, false, true),
        ],
        alignment: AlignmentType.JUSTIFIED,
        indent: { left: 680, right: 680 },
        spacing: { after: 100, line: 240, lineRule: LineRuleType.AUTO },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: 'Keywords: ',
            font: 'Times New Roman',
            size: 20,
            bold: true,
            italics: true,
          }),
          ...inlineWordRuns(keywordsEnglishClean, 20, false, true),
        ],
        alignment: AlignmentType.LEFT,
        indent: { left: 680, right: 680 },
        spacing: { after: 300, line: 240, lineRule: LineRuleType.AUTO },
      })
    );
  }

  // Section Builder Function - PPKI: Subheadings WITHOUT letters or numbering
  const addSection = (headingText: string, contentText: string, sectionKey: string, isFirst = false) => {
    docChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: headingText.toUpperCase(),
            font: 'Times New Roman',
            size: 24, // 12pt
            bold: true,
          }),
        ],
        alignment: AlignmentType.LEFT,
        spacing: { before: 280, after: 140, line: 360, lineRule: LineRuleType.AUTO },
      })
    );

    const cleanedContent = article.extractive ? contentText : cleanSectionContent(contentText, headingText);
    const paras = createFormattedParagraphs(cleanedContent, sectionKey, isFirst);
    docChildren.push(...paras);
  };

  // 5. SECTIONS (Format Tanpa Huruf / Angka sesuai Pedoman PPKI Bab I & Bab III)
  addSection('PENDAHULUAN', pendahuluan, 'pendahuluan', true);
  addSection('METODE PENELITIAN', metode, 'metode');
  addSection('HASIL PENELITIAN', hasil, 'hasil');
  addSection('PEMBAHASAN', pembahasan, 'pembahasan');
  addSection('KESIMPULAN DAN SARAN', kesimpulan, 'kesimpulan');

  // Do not attach unknown footnotes to the last paragraph: that would miscite a source.
  // Any unmatched footnote remains in the quality warning for human review.
  for (const num of Object.keys(docxFootnotesMap)) {
    if (!attachedFootnoteNumbers.has(Number(num))) delete docxFootnotesMap[Number(num)];
  }


  // 6. DAFTAR RUJUKAN (PPKI Bab IV, hlm. 71-72: Hanging Indent, Dkk. / Et Al.)
  docChildren.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'DAFTAR RUJUKAN',
          font: 'Times New Roman',
          size: 24,
          bold: true,
        }),
      ],
      alignment: AlignmentType.LEFT,
      spacing: { before: 360, after: 180, line: 360, lineRule: LineRuleType.AUTO },
    })
  );

  if (Array.isArray(daftarPustaka) && daftarPustaka.length > 0) {
    daftarPustaka.forEach((refItem) => {
      const normalizedRef = article.extractive ? sanitizeXmlText(refItem) : normalizePpkIBibliographyEntry(sanitizeXmlText(refItem));
      if (normalizedRef.trim().length > 0) {
        const runs = parseBibliographyRuns(normalizedRef);
        docChildren.push(
          new Paragraph({
            children: runs,
            alignment: AlignmentType.JUSTIFIED,
            indent: { left: 720, hanging: 720 }, // Standard hanging indent 1.27 cm
            spacing: { after: 120, line: 360, lineRule: LineRuleType.AUTO },
          })
        );
      }
    });
  } else if (typeof daftarPustaka === 'string') {
    const rawList = sanitizeXmlText(daftarPustaka)
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    rawList.forEach((refItem) => {
      const normalizedRef = article.extractive ? refItem : normalizePpkIBibliographyEntry(refItem);
      const runs = parseBibliographyRuns(normalizedRef);
      docChildren.push(
        new Paragraph({
          children: runs,
          alignment: AlignmentType.JUSTIFIED,
          indent: { left: 720, hanging: 720 },
          spacing: { after: 120, line: 360, lineRule: LineRuleType.AUTO },
        })
      );
    });
  }

  // 7. Create Document with A4 & Universal Word Compatibility Settings
  // Margin: 4 cm kiri, 3 cm atas, kanan, bawah (PPKI Bab III Teknik Penulisan A)
  // 1 cm = 567 dxa -> 4 cm = 2268 dxa, 3 cm = 1701 dxa
  const doc = new Document({
    footnotes: docxFootnotesMap,
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 11906, // A4 standard width (210 mm)
              height: 16838, // A4 standard height (297 mm)
            },
            margin: {
              top: 1701, // 3 cm
              bottom: 1701, // 3 cm
              left: 2268, // 4 cm
              right: 1701, // 3 cm
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: 'Times New Roman',
                    size: 20, // 10pt
                  }),
                ],
              }),
            ],
          }),
        },
        children: docChildren,
      },
    ],
  });

  // 8. Produce a Blob. Caller packages it with Cover CD into one ZIP.
  const blob = await Packer.toBlob(doc);
  return new Blob([blob], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
