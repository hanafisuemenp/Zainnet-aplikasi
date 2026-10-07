/**
 * Exact conversions for Microsoft Word / Office OpenXML standards:
 * - EMU (English Metric Units): 1 cm = 360,000 EMU (1 inch = 914,400 EMU)
 * - Twips (twentieth of an imperial point): 1 inch = 1440 twips => 1 cm = 1440 / 2.54 = ~566.929134 twips (approx 567)
 * - Point: 1 pt = 20 twips = 12700 EMU
 */

export const EMU_PER_CM = 360000;
export const EMU_PER_MM = 36000;
export const TWIPS_PER_CM = 566.929133858; // Standard 567 twips per cm

export function cmToEmu(cm: number): number {
  return Math.round(cm * EMU_PER_CM);
}

export function mmToEmu(mm: number): number {
  return Math.round((mm / 10) * EMU_PER_CM);
}

export function emuToCm(emu: number): number {
  return Number((emu / EMU_PER_CM).toFixed(3));
}

export function cmToTwips(cm: number): number {
  return Math.round(cm * TWIPS_PER_CM);
}

export function mmToTwips(mm: number): number {
  return Math.round((mm / 10) * TWIPS_PER_CM);
}

export function twipsToCm(twips: number): number {
  return Number((twips / TWIPS_PER_CM).toFixed(3));
}

export function cmToMm(cm: number): number {
  return Number((cm * 10).toFixed(2));
}

export function mmToCm(mm: number): number {
  return Number((mm / 10).toFixed(3));
}

/**
 * Calculates canvas pixel dimensions for printing at target DPI (default 300 DPI)
 */
export function cmToPixels(cm: number, dpi = 300): number {
  const inches = cm / 2.54;
  return Math.round(inches * dpi);
}

export const SIZE_PRESETS = [
  {
    id: '2x3',
    label: '2 × 3 cm',
    widthCm: 2.0,
    heightCm: 3.0,
    description: 'Pas Foto Standar / Syarat KTP & Kartu',
  },
  {
    id: '3x4',
    label: '3 × 4 cm',
    widthCm: 3.0,
    heightCm: 4.0,
    description: 'Pas Foto Ijazah, CPNS & Lamaran Kerja',
    badge: 'Populer',
  },
  {
    id: '4x6',
    label: '4 × 6 cm',
    widthCm: 4.0,
    heightCm: 6.0,
    description: 'Pas Foto SKCK, Buku Nikah & Kedinasan',
    badge: 'Populer',
  },
  {
    id: 'ktp',
    label: 'Ukuran KTP (8.56 × 5.4 cm)',
    widthCm: 8.56,
    heightCm: 5.4,
    description: 'Standar Kartu KTP / SIM / ID Card (85.6 × 54 mm)',
    badge: 'Ukuran KTP',
  },
  {
    id: 'ktp_portrait',
    label: 'Ukuran KTP Tegak (5.4 × 8.56 cm)',
    widthCm: 5.4,
    heightCm: 8.56,
    description: 'Kartu KTP / ID Card Posisi Tegak (Potret)',
    badge: 'KTP Tegak',
  },
  {
    id: 'pas_foto_ktp',
    label: 'Pas Foto e-KTP (2.5 × 3.5 cm)',
    widthCm: 2.5,
    heightCm: 3.5,
    description: 'Ukuran Pas Foto Dalam Kartu e-KTP (25 × 35 mm)',
    badge: 'Foto KTP',
  },
  {
    id: '4x4',
    label: '4 × 4 cm',
    widthCm: 4.0,
    heightCm: 4.0,
    description: 'Format Persegi / ID Khusus',
  },
  {
    id: '3x3',
    label: '3 × 3 cm',
    widthCm: 3.0,
    heightCm: 3.0,
    description: 'Format Persegi Kecil',
  },
  {
    id: '3.5x4.5',
    label: '3.5 × 4.5 cm',
    widthCm: 3.5,
    heightCm: 4.5,
    description: 'Standar Visa Schengen & Paspor',
  },
  {
    id: '5x5',
    label: '5 × 5 cm (2x2")',
    widthCm: 5.08,
    heightCm: 5.08,
    description: 'Standar Visa AS & Umrah',
  },
  {
    id: 'stnk',
    label: 'Ukuran STNK Mendatar (23 × 7.5 cm)',
    widthCm: 23.0,
    heightCm: 7.5,
    description: 'Ukuran STNK Mendatar (untuk dicetak di A4)',
    badge: 'STNK',
  },
  {
    id: 'stnk_portrait',
    label: 'Ukuran STNK Tegak (7.5 × 23 cm)',
    widthCm: 7.5,
    heightCm: 23.0,
    description: 'Ukuran STNK Tegak (untuk dicetak di A4)',
    badge: 'STNK Tegak',
  },
];

export const PAPER_PRESETS: Record<string, { widthCm: number; heightCm: number; label: string }> = {
  A4: {
    widthCm: 21.0,
    heightCm: 29.7,
    label: 'A4 (21.0 × 29.7 cm)',
  },
  F4: {
    widthCm: 21.5,
    heightCm: 33.0,
    label: 'F4 / Folio (21.5 × 33.0 cm)',
  },
  Letter: {
    widthCm: 21.59,
    heightCm: 27.94,
    label: 'Letter (21.6 × 27.9 cm)',
  },
};
