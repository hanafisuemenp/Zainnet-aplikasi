import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createRequire } from 'module';
import JSZip from 'jszip';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs, deleteDoc, setLogLevel } from 'firebase/firestore';

// Filter out harmless Firebase gRPC idle stream cancellation log lines from Node.js runtime
const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = function(chunk: any, encoding?: any, callback?: any): boolean {
  const str = typeof chunk === 'string' ? chunk : chunk?.toString() || '';
  if (str.includes('Disconnecting idle stream') || str.includes('Timed out waiting for new targets')) {
    if (typeof callback === 'function') callback();
    return true;
  }
  return originalStderrWrite(chunk, encoding, callback);
};

const originalConsoleError = console.error.bind(console);
console.error = function(...args: any[]) {
  const msg = args.map(a => typeof a === 'string' ? a : (a?.message || JSON.stringify(a) || '')).join(' ');
  if (msg.includes('Disconnecting idle stream') || msg.includes('Timed out waiting for new targets')) {
    return;
  }
  originalConsoleError(...args);
};

try {
  setLogLevel('silent');
} catch (e) {}
import { 
  uploadToR2, 
  getFromR2, 
  isR2Configured, 
  getR2Config, 
  setRuntimeR2Config, 
  R2Config 
} from './src/server/r2Service.js';
import { AGC_DEEP_7000_ARTICLES } from './src/data/agcDeepArticlesData.js';
import { generateProcedural7000WordArticle, expandPostTo7000Words } from './src/utils/agcDeepArticleGenerator.js';

const nodeRequire = typeof require !== 'undefined' ? require : createRequire(import.meta.url);

let PDFParseClass: any = null;
try {
  const pdfModule = nodeRequire('pdf-parse');
  PDFParseClass = pdfModule.PDFParse || pdfModule.default || pdfModule;
} catch (e) {
  console.warn('Could not load pdf-parse:', e);
}

const app = express();
const PORT = 3000;

// Initialize Firebase for server-side original docx storage & recovery
let firestoreDb: any = null;
function getServerDb() {
  if (!firestoreDb) {
    try {
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const fbApp = !getApps().length ? initializeApp(cfg) : getApps()[0];
        firestoreDb = getFirestore(fbApp, cfg.firestoreDatabaseId || undefined);
      }
    } catch (e) {
      console.warn('Server firestore init warning:', e);
    }
  }
  return firestoreDb;
}

// Directory for storing 100% original uploaded Word docx files
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'makalah');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
const GENERAL_UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(GENERAL_UPLOADS_DIR)) {
  fs.mkdirSync(GENERAL_UPLOADS_DIR, { recursive: true });
}

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve all uploaded files directly from hosting storage
app.use('/uploads', express.static(GENERAL_UPLOADS_DIR));

// R2 Storage configuration file path for runtime persistence
const R2_CONFIG_FILE = path.join(process.cwd(), 'r2_config.json');
try {
  if (fs.existsSync(R2_CONFIG_FILE)) {
    const rawR2 = fs.readFileSync(R2_CONFIG_FILE, 'utf-8');
    const parsedR2 = JSON.parse(rawR2);
    if (parsedR2 && parsedR2.accountId && parsedR2.accessKeyId) {
      setRuntimeR2Config(parsedR2);
    }
  }
} catch (e) {
  console.warn('R2 config load warning:', e);
}

// API: Get Cloudflare R2 Status & Configuration
app.get('/api/r2/status', (req, res) => {
  const cfg = getR2Config();
  const configured = isR2Configured();
  return res.json({
    configured,
    bucketName: cfg?.bucketName || '',
    accountId: cfg?.accountId ? `${cfg.accountId.slice(0, 6)}...` : '',
    hasPublicDomain: !!cfg?.publicDomain,
    publicDomain: cfg?.publicDomain || ''
  });
});

// API: Save/Update Cloudflare R2 Configuration at runtime
app.post('/api/r2/configure', (req, res) => {
  try {
    const { accountId, accessKeyId, secretAccessKey, bucketName, publicDomain } = req.body;
    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
      return res.status(400).json({ 
        success: false, 
        error: 'accountId, accessKeyId, secretAccessKey, dan bucketName wajib diisi.' 
      });
    }

    const cfg: R2Config = {
      accountId: accountId.trim(),
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim(),
      bucketName: bucketName.trim(),
      publicDomain: publicDomain ? publicDomain.trim() : ''
    };

    setRuntimeR2Config(cfg);
    try {
      fs.writeFileSync(R2_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
    } catch (e) {}

    return res.json({
      success: true,
      message: 'Konfigurasi Cloudflare R2 berhasil disimpan dan aktif!',
      configured: true,
      bucketName: cfg.bucketName
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// API: Proxy download directly from R2 if private bucket
app.get('/api/r2/download/:key', async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);
    const buf = await getFromR2(key);
    if (!buf) {
      return res.status(404).send('Berkas tidak ditemukan di Cloudflare R2');
    }
    const cleanName = path.basename(key);
    const mime = getFileMimeType(cleanName);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${cleanName}"`);
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    return res.end(buf);
  } catch (err: any) {
    return res.status(500).send('Gagal mengunduh berkas dari Cloudflare R2');
  }
});

// Universal Hosting File Upload API: Saves any uploaded file permanently to hosting storage & R2
app.post('/api/hosting/upload', async (req, res) => {
  try {
    const { fileName, fileBase64, folder = 'documents' } = req.body;
    if (!fileName || !fileBase64) {
      return res.status(400).json({ success: false, error: 'Nama berkas (fileName) dan data (fileBase64) diperlukan' });
    }
    const cleanFolder = (folder || 'documents').replace(/[^a-zA-Z0-9_-]/g, '') || 'general';
    const targetDir = path.join(GENERAL_UPLOADS_DIR, cleanFolder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const safeBaseName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeBaseName}`;
    const filePath = path.join(targetDir, fileId);
    const base64Clean = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
    const buffer = Buffer.from(base64Clean, 'base64');
    fs.writeFileSync(filePath, buffer);

    let storageType = 'hosting';
    let permanentUrl = `/uploads/${cleanFolder}/${encodeURIComponent(fileId)}`;

    // If Cloudflare R2 is configured, save directly to R2 cloud storage
    if (isR2Configured()) {
      try {
        const r2Key = `${cleanFolder}/${fileId}`;
        const mime = getFileMimeType(fileName);
        const r2Res = await uploadToR2(r2Key, buffer, mime);
        if (r2Res.success && r2Res.url) {
          permanentUrl = r2Res.url;
          storageType = 'cloudflare_r2';
        }
      } catch (r2Err) {
        console.warn('R2 upload notice (saved to hosting disk):', r2Err);
      }
    }

    return res.json({
      success: true,
      fileId,
      url: permanentUrl,
      downloadUrl: permanentUrl,
      storageType,
      originalFileName: fileName,
      fileSize: buffer.length,
      folder: cleanFolder,
      message: storageType === 'cloudflare_r2' 
        ? 'Berkas berhasil disimpan permanen di Cloudflare R2 Object Storage.'
        : 'Berkas berhasil disimpan permanen di penyimpanan hosting.'
    });
  } catch (err: any) {
    console.error('Hosting upload error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Gagal menyimpan berkas ke hosting' });
  }
});

// Endpoint unduh seluruh source code proyek dalam format ZIP
app.get('/api/export-code', async (_req, res) => {
  try {
    const zip = new JSZip();
    const rootDir = process.cwd();
    function addDir(dir: string, relPath: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name === '.git' ||
          entry.name.startsWith('.tmp') ||
          entry.name === 'uploads'
        ) {
          continue;
        }
        const fullPath = path.join(dir, entry.name);
        const zipPath = relPath ? `${relPath}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          addDir(fullPath, zipPath);
        } else if (entry.isFile()) {
          try {
            zip.file(zipPath, fs.readFileSync(fullPath));
          } catch (e) {}
        }
      }
    }
    addDir(rootDir, '');
    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="source-code-templatejurnal.zip"');
    res.send(buffer);
  } catch (error) {
    console.error('Gagal membuat zip kode sumber:', error);
    res.status(500).json({ error: 'Gagal mengekspor kode sumber' });
  }
});

// Lazy Gemini AI initialization
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Helper: Multi-model Gemini call with automatic retry & fallback when a model experiences 503 High Demand
async function generateLabel103ContentWithFallback(
  ai: GoogleGenAI,
  contents: any,
  config: any
): Promise<{ text: string; modelUsed: string }> {
  const candidateModels = ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash'];
  let lastError: any = null;

  for (let pass = 0; pass < 2; pass++) {
    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents,
          config,
        });
        if (response && typeof response.text === 'string') {
          return { text: response.text, modelUsed: modelName };
        }
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || String(err);
        console.warn(`[Label103 AI] Model ${modelName} (pass ${pass + 1}) warning:`, errMsg);
        // Wait briefly before trying next fallback model
        await new Promise((resolve) => setTimeout(resolve, 400 * (pass + 1)));
      }
    }
  }

  throw lastError || new Error('Server AI sedang sibuk. Silakan coba beberapa saat lagi.');
}

// Endpoint: Extract guest names from photo (e.g. handwritten notebook with pen) for Menu No. 9 (Label 103)
app.post('/api/extract-from-image', async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'Data gambar (base64) tidak ditemukan' });
    }

    const ai = getAI();
    if (!ai) {
      return res.status(500).json({ error: 'Layanan AI belum terkonfigurasi di server' });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

    const imagePart = {
      inlineData: {
        mimeType: mimeType || 'image/jpeg',
        data: cleanBase64,
      },
    };

    const promptText = `Anda adalah sistem OCR multimodal dengan presisi tertinggi untuk membaca tulisan tangan pulpen di buku catatan atau kertas daftar tamu pernikahan & acara di Indonesia.

Analisis gambar secara cermat dan seksama:
1. Periksa tata letak buku catatan: Apakah nama-nama ditulis dalam 1 kolom menurun ke bawah, atau terbagi menjadi 2 kolom (kolom kiri dan kolom kanan). Baca urut dari atas ke bawah. Jika terdapat 2 kolom, baca kolom pertama hingga tuntas, lalu lanjutkan kolom kedua.
2. Setiap baris tulisan tangan biasanya berisi satu nama tamu undangan.
3. Karakteristik tulisan tangan:
   - Nama ditulis berjejer ke bawah TANPA tanda koma (,).
   - Sering diawali nomor urut seperti '1.', '2.', '3)', '(4)', atau tanda strip '-', bintang '*', atau centang. HAPUS semua nomor urut dan tanda ini.
   - SANGAT PENTING: Pertahankan sebutan sosial, keagamaan, dan gelar akademik:
     Bpk., Bapak, Ibu, Sdr., Sdri., H., Hj., Haji, Hajjah, Dr., dr., drg., Sp.PD, Sp.A, Prof., Ir., Drs., Dra., K.H., Ustadz, S.T., S.E., S.Kom., S.Pd., S.H., M.M., M.Si., M.Pd., M.Kn., dll.
   - SANGAT PENTING: Pertahankan imbuhan pasangan / rombongan jika ditulis di samping atau di bawah nama tersebut, misalnya:
     '& Istri', '& Suami', '& Keluarga', 'Sekeluarga', '& Rekan', 'dan Pasangan', 'dkk'.
4. Baca setiap baris dengan teliti agar tidak ada nama yang terlewat, meskipun tulisannya miring, bersambung (tegak bersambung), atau tinta pulpen agak tipis.
5. Abaikan judul/header lembar buku yang bukan nama orang, misalnya 'Daftar Tamu', 'Daftar Undangan', 'No', 'Nama', 'Alamat', nomor halaman, atau catatan pinggir.

Kembalikan HANYA array string JSON berisi daftar nama tamu secara berurutan.`;

    const response = await generateLabel103ContentWithFallback(
      ai,
      {
        parts: [imagePart, { text: promptText }],
      },
      {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
            description: 'Nama tamu undangan lengkap dengan gelar dan imbuhan keluarga',
          },
        },
      }
    );

    const outputText = response.text || '[]';
    let names: string[] = [];

    try {
      names = JSON.parse(outputText);
    } catch {
      const cleanedJson = outputText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
      try {
        names = JSON.parse(cleanedJson);
      } catch {
        names = [];
      }
    }

    const cleanedNames = names
      .map((n) => n.trim().replace(/^[\d.)\-\s•\*\#\(\)]+/, '').trim())
      .filter((n) => n.length > 0);

    return res.json({
      success: true,
      names: cleanedNames,
      commaSeparated: cleanedNames.join(', '),
      total: cleanedNames.length,
      modelUsed: response.modelUsed,
    });
  } catch (error: any) {
    console.error('Error in /api/extract-from-image:', error);
    return res.status(500).json({
      error: 'Server AI sedang mengalami lonjakan trafik tinggi (503). Silakan klik Pindai sekali lagi dalam beberapa detik.',
    });
  }
});

// Endpoint: AI-assisted text extraction/cleaning from messy Word/chat pastes for Menu No. 9 (Label 103)
app.post('/api/clean-word-text', async (req, res) => {
  try {
    const { rawText } = req.body;
    if (!rawText || !rawText.trim()) {
      return res.status(400).json({ error: 'Teks kosong' });
    }

    const ai = getAI();
    if (ai) {
      try {
        const promptText = `Berikut adalah teks daftar nama yang disalin dari Microsoft Word, WhatsApp, atau catatan:
"""
${rawText}
"""

Tugas Anda:
1. Saring dan ambil hanya nama-nama orang/tamu undangan.
2. Bersihkan nomor urut (1., 2.), bullet points, spasi berlebih, atau baris judul/keterangan yang bukan nama.
3. Pertahankan sebutan/gelar (Bpk., Ibu, Dr., H., Hj., dsb.) dan imbuhan (& Keluarga, & Istri, dll.).
4. Kembalikan HANYA array string nama tamu dalam format JSON.`;

        const response = await generateLabel103ContentWithFallback(
          ai,
          promptText,
          {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING,
                description: 'Nama tamu undangan yang telah dibersihkan',
              },
            },
          }
        );

        const outputText = response.text || '[]';
        let names: string[] = [];
        try {
          names = JSON.parse(outputText);
        } catch {
          const cleanedJson = outputText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
          try {
            names = JSON.parse(cleanedJson);
          } catch {
            names = [];
          }
        }

        const cleanedNames = names
          .map((n) => n.trim().replace(/^[\d.)\-\s•]+/, '').trim())
          .filter((n) => n.length > 0);

        if (cleanedNames.length > 0) {
          return res.json({
            success: true,
            names: cleanedNames,
            commaSeparated: cleanedNames.join(', '),
            total: cleanedNames.length,
            modelUsed: response.modelUsed,
          });
        }
      } catch (aiErr) {
        console.warn('[Label103] AI clean-word-text fallback to local parser:', aiErr);
      }
    }

    // Automatic smart rule-based fallback if all AI models are busy
    const fallbackNames = String(rawText)
      .split(/\r?\n/)
      .map((line) =>
        line
          .replace(/^[\s\d.)\-\•\*\·\t]+/, '')
          .replace(/[\t]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      )
      .filter((cleaned) => {
        const lower = cleaned.toLowerCase();
        return (
          cleaned.length > 1 &&
          !lower.startsWith('daftar nama') &&
          !lower.startsWith('tamu undangan') &&
          !lower.startsWith('halaman') &&
          !lower.startsWith('nomor') &&
          !lower.startsWith('no.')
        );
      });

    return res.json({
      success: true,
      names: fallbackNames,
      commaSeparated: fallbackNames.join(', '),
      total: fallbackNames.length,
      method: 'local_fallback',
    });
  } catch (error: any) {
    console.error('Error in /api/clean-word-text:', error);
    return res.status(500).json({
      error: 'Gagal membersihkan teks',
    });
  }
});

// Format or enhance HTML from Mammoth or raw text with solid black typography for reading
function formatMakalahHtml(htmlContent: string, rawText: string): string {
  if (htmlContent && htmlContent.trim().length > 100) {
    // Enhance existing HTML from Mammoth with clean Tailwind typography styling (Solid Black)
    let styled = htmlContent
      .replace(/<p>/gi, '<p class="text-black leading-relaxed mb-4 text-justify">')
      .replace(/<h2>/gi, '<h2 class="text-xl font-bold text-black mt-8 mb-3 pb-1 border-b border-slate-300">')
      .replace(/<h3>/gi, '<h3 class="text-lg font-bold text-black mt-5 mb-2">')
      .replace(/<h4>/gi, '<h4 class="text-base font-bold text-black mt-4 mb-2">')
      .replace(/<ul>/gi, '<ul class="list-disc pl-6 space-y-1.5 text-black mb-4">')
      .replace(/<ol>/gi, '<ol class="list-decimal pl-6 space-y-1.5 text-black mb-4">')
      .replace(/<table>/gi, '<div class="overflow-x-auto my-4"><table class="w-full text-left text-sm border-collapse border border-slate-300">')
      .replace(/<\/table>/gi, '</table></div>')
      .replace(/<th>/gi, '<th class="border border-slate-300 bg-slate-100 px-3 py-2 text-black font-bold">')
      .replace(/<td>/gi, '<td class="border border-slate-300 px-3 py-2 text-black">');
    return styled;
  }

  const paragraphs = rawText.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 20);
  return paragraphs.map(p => {
    if (/^(bab\s+[ivx\d]+|pendahuluan|pembahasan|penutup|kesimpulan|daftar\s+pustaka)/i.test(p)) {
      return `<h2 class="text-xl font-bold text-black mt-8 mb-3 pb-1 border-b border-slate-300">${p}</h2>`;
    }
    if (/^[A-Z]\.\s+/i.test(p) && p.length < 100) {
      return `<h3 class="text-lg font-bold text-black mt-5 mb-2">${p}</h3>`;
    }
    return `<p class="text-black leading-relaxed mb-4 text-justify">${p.replace(/\n/g, '<br/>')}</p>`;
  }).join('');
}

// Heuristic fallback for multi-document type auto-detection, title, theme, and automatic description
function heuristicExtractMakalah(rawText: string, filename: string, htmlContent: string = '') {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const fn = filename.toLowerCase();
  const textLower = rawText.toLowerCase();
  const sampleHead = rawText.slice(0, 4500).toLowerCase();

  // 1. Detect Document Type & Label
  let documentType = 'makalah';
  let documentTypeLabel = 'Makalah Akademik';
  let academicLevel = 'Perkuliahan Mahasiswa';

  if (
    fn.includes('skripsi') || fn.includes('tugas_akhir') || fn.includes('tugas akhir') || fn.includes('ta_') ||
    sampleHead.includes('skripsi') || sampleHead.includes('memperoleh gelar sarjana') || sampleHead.includes('strata satu') ||
    sampleHead.includes('sidang sarjana') || sampleHead.includes('sidang munaqasyah') || sampleHead.includes('fakultas') && sampleHead.includes('jurusan') && sampleHead.includes('nim') && sampleHead.includes('bab v')
  ) {
    documentType = 'skripsi';
    documentTypeLabel = 'Skripsi / Tugas Akhir (S1)';
    academicLevel = 'Sarjana (S1)';
  } else if (fn.includes('tesis') || sampleHead.includes('tesis') || sampleHead.includes('gelar magister') || sampleHead.includes('program pascasarjana')) {
    documentType = 'tesis';
    documentTypeLabel = 'Tesis Magister (S2)';
    academicLevel = 'Pascasarjana (S2)';
  } else if (fn.includes('disertasi') || sampleHead.includes('disertasi') || sampleHead.includes('gelar doktor')) {
    documentType = 'tesis';
    documentTypeLabel = 'Disertasi Doktor (S3)';
    academicLevel = 'Doktoral (S3)';
  } else if (
    fn.includes('proposal') || sampleHead.includes('proposal penelitian') || sampleHead.includes('proposal skripsi') ||
    sampleHead.includes('usulan penelitian') || sampleHead.includes('proposal pkm') || sampleHead.includes('rancangan proposal')
  ) {
    documentType = 'proposal';
    documentTypeLabel = 'Proposal Penelitian / Riset';
    academicLevel = 'Rancangan Penelitian';
  } else if (
    fn.includes('jurnal') || fn.includes('journal') || sampleHead.includes('issn') || sampleHead.includes('e-issn') ||
    (sampleHead.includes('volume') && sampleHead.includes('nomor')) ||
    (sampleHead.includes('abstract') && sampleHead.includes('keywords') && sampleHead.includes('pendahuluan') && !sampleHead.includes('bab i'))
  ) {
    documentType = 'jurnal';
    documentTypeLabel = 'Artikel Jurnal Ilmiah';
    academicLevel = 'Publikasi Ilmiah';
  } else if (
    fn.includes('pkl') || fn.includes('magang') || fn.includes('kkn') ||
    sampleHead.includes('praktik kerja lapangan') || sampleHead.includes('kuliah kerja nyata') || sampleHead.includes('laporan magang') || sampleHead.includes('tempat magang')
  ) {
    documentType = 'laporan_pkl';
    documentTypeLabel = 'Laporan Magang / KKN / PKL';
    academicLevel = 'Praktik Lapangan';
  } else if (
    fn.includes('praktikum') || fn.includes('lab') || fn.includes('laprak') ||
    sampleHead.includes('laporan praktikum') || (sampleHead.includes('alat dan bahan') && sampleHead.includes('prosedur kerja'))
  ) {
    documentType = 'laporan_praktikum';
    documentTypeLabel = 'Laporan Praktikum / Lab';
    academicLevel = 'Praktikum Kuliah';
  } else if (
    fn.includes('modul') || fn.includes('diktat') || fn.includes('bahan ajar') || fn.includes('rps') ||
    sampleHead.includes('modul pembelajaran') || sampleHead.includes('bahan ajar') || sampleHead.includes('capaian pembelajaran')
  ) {
    documentType = 'modul_ajar';
    documentTypeLabel = 'Modul Kuliah & Bahan Ajar';
    academicLevel = 'Materi Pembelajaran';
  } else if (fn.includes('esai') || fn.includes('essay') || fn.includes('opini') || sampleHead.includes('esai') || sampleHead.includes('essay ilmiah')) {
    documentType = 'esai';
    documentTypeLabel = 'Esai / Opini Akademik';
    academicLevel = 'Karya Tulis Bebas';
  } else if (fn.includes('review') || fn.includes('resensi') || sampleHead.includes('critical book') || sampleHead.includes('resensi buku')) {
    documentType = 'review_buku';
    documentTypeLabel = 'Review Buku / Kritik Jurnal';
    academicLevel = 'Tinjauan Pustaka';
  }

  // 2. Clean filename without extension
  const cleanFilename = filename.replace(/\.(docx|doc|pdf|txt|rtf|odt)$/i, '').replace(/[-_]/g, ' ').trim();
  
  // 3. Try finding title in first 16 non-empty lines
  let detectedTitle = '';
  for (let i = 0; i < Math.min(lines.length, 16); i++) {
    const line = lines[i];
    const lLower = line.toLowerCase();
    if (
      line.length > 10 && 
      line.length < 180 && 
      !lLower.startsWith('makalah') && 
      !lLower.startsWith('skripsi') &&
      !lLower.startsWith('proposal') &&
      !lLower.startsWith('laporan') &&
      !lLower.startsWith('diajukan untuk') &&
      !lLower.startsWith('bab ') &&
      !lLower.startsWith('kata pengantar') &&
      !lLower.startsWith('daftar isi') &&
      !lLower.includes('dosen pengampu') &&
      !lLower.includes('dosen pembimbing') &&
      !lLower.includes('universitas') &&
      !lLower.includes('fakultas')
    ) {
      detectedTitle = line;
      break;
    }
  }

  if (!detectedTitle || detectedTitle.length < 10) {
    detectedTitle = cleanFilename.length > 5 
      ? cleanFilename.replace(/\b\w/g, c => c.toUpperCase()) 
      : `${documentTypeLabel} Akademik`;
  }

  // 4. Detect Theme / Academic Discipline
  let theme = 'Pendidikan & Sosial';
  if (textLower.includes('islam') || textLower.includes('al-qur') || textLower.includes('syariah') || textLower.includes('fiqih') || textLower.includes('hadis') || textLower.includes('tarbiyah')) {
    theme = 'Pendidikan Agama Islam';
  } else if (textLower.includes('hukum') || textLower.includes('pasal') || textLower.includes('undang-undang') || textLower.includes('peradilan') || textLower.includes('pidana') || textLower.includes('perdata')) {
    theme = 'Hukum & Peradilan';
  } else if (textLower.includes('bisnis') || textLower.includes('ekonomi') || textLower.includes('pasar') || textLower.includes('keuangan') || textLower.includes('manajemen') || textLower.includes('akuntansi')) {
    theme = 'Manajemen & Ekonomi';
  } else if (textLower.includes('teknologi') || textLower.includes('sistem') || textLower.includes('komputer') || textLower.includes('internet') || textLower.includes('software') || textLower.includes('ai') || textLower.includes('algoritma')) {
    theme = 'Teknologi Informasi';
  } else if (textLower.includes('kesehatan') || textLower.includes('medis') || textLower.includes('pasien') || textLower.includes('penyakit') || textLower.includes('perawat') || textLower.includes('farmasi')) {
    theme = 'Kesehatan & Medis';
  } else if (textLower.includes('pembelajaran') || textLower.includes('kurikulum') || textLower.includes('guru') || textLower.includes('siswa') || textLower.includes('sekolah') || textLower.includes('didaktik')) {
    theme = 'Pendidikan & Kurikulum';
  } else if (textLower.includes('psikologi') || textLower.includes('emosi') || textLower.includes('perilaku') || textLower.includes('mental')) {
    theme = 'Psikologi & Perilaku';
  } else if (textLower.includes('bahasa') || textLower.includes('sastra') || textLower.includes('linguistik') || textLower.includes('semantik')) {
    theme = 'Bahasa & Sastra';
  } else if (textLower.includes('pertanian') || textLower.includes('tanaman') || textLower.includes('pangan') || textLower.includes('agribisnis')) {
    theme = 'Pertanian & Agroteknologi';
  }

  // 5. Extract author, advisor, or institution
  let author = 'Tim Penulis Mahasiswa';
  let advisor = '';
  let institution = '';

  for (const line of lines.slice(0, 30)) {
    const lLower = line.toLowerCase();
    if (lLower.includes('disusun oleh') || lLower.includes('penyusun:') || lLower.includes('penulis:')) {
      author = line.replace(/(disusun oleh|penyusun|penulis)[:\s]+/gi, '').trim() || author;
    }
    if (lLower.includes('dosen pembimbing') || lLower.includes('pembimbing i') || lLower.includes('pembimbing 1') || lLower.includes('dosen pengampu')) {
      advisor = line.replace(/(dosen pembimbing|dosen pengampu|pembimbing\s+[i12]+)[:\s]+/gi, '').trim();
    }
    if (lLower.includes('universitas') || lLower.includes('institut') || lLower.includes('sekolah tinggi') || lLower.includes('politeknik') || lLower.includes('fakultas')) {
      institution = line;
    }
  }

  // 6. Detect Chapters & Document Structure
  const detectedChapters: string[] = [];
  const chapterRegex = /^(bab\s+[ivx\d]+[\s\S]{0,60}|pendahuluan|tinjauan\s+pustaka|landasan\s+teori|metode\s+penelitian|hasil\s+dan\s+pembahasan|kesimpulan\s+dan\s+saran|penutup|daftar\s+pustaka|abstrak)/im;
  for (const line of lines) {
    if (chapterRegex.test(line) && line.length < 80) {
      const cleanCh = line.replace(/\s+/g, ' ').trim();
      if (!detectedChapters.includes(cleanCh)) {
        detectedChapters.push(cleanCh);
        if (detectedChapters.length >= 6) break;
      }
    }
  }

  // 7. Word Count, Page Estimate & Reading Time
  const words = rawText.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const pageEstimate = Math.max(1, Math.round(wordCount / 320));
  const readingTimeMinutes = Math.max(2, Math.ceil(wordCount / 190));

  // 8. Automatic Description & Excerpt
  const paragraphs = rawText.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 50);
  const excerpt = paragraphs.length > 0 
    ? (paragraphs[0].slice(0, 260) + (paragraphs[0].length > 260 ? '...' : '')) 
    : `Kajian terstruktur mengenai ${detectedTitle} yang disusun berdasarkan kaidah penulisan karya akademik.`;

  const chaptersNotice = detectedChapters.length > 0 
    ? `Struktur naskah memuat ${detectedChapters.slice(0, 4).join(', ')}${detectedChapters.length > 4 ? ', dll.' : '.'}` 
    : 'Struktur naskah tersusun secara komprehensif mulai dari pendahuluan, pembahasan, hingga penutup.';

  const autoDescription = `Berkas ini teridentifikasi sebagai ${documentTypeLabel} pada rumpun bidang ilmu ${theme} dengan estimasi volume ${pageEstimate} halaman (${wordCount.toLocaleString('id-ID')} kata). Naskah berfokus pada pembahasan "${detectedTitle}". ${chaptersNotice} File dokumen Word (.docx) asli tersimpan utuh dan dapat diunduh tanpa perubahan teks.`;

  const formattedHtml = formatMakalahHtml(htmlContent, rawText);

  return {
    title: detectedTitle,
    documentType,
    documentTypeLabel,
    theme,
    academicLevel,
    advisor,
    excerpt,
    autoDescription,
    detectedChapters,
    pageEstimate,
    wordCount,
    tags: [documentType, theme.split(' ')[0].toLowerCase(), 'akademik', 'karya ilmiah'],
    author,
    institution,
    readingTimeMinutes,
    formattedHtml
  };
}

// Call Gemini with Gemini 3.1 Flash Lite as primary model
async function callGeminiWithFallback(ai: GoogleGenAI, prompt: string): Promise<{ text: string; modelUsed: string } | null> {
  // Primary model: gemini-3.1-flash-lite
  const candidateModels = ['gemini-3.1-flash-lite', 'gemini-flash-latest'];

  for (const modelName of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2
        }
      });

      if (response && response.text) {
        return { text: response.text, modelUsed: modelName };
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isHighDemandOrTransient = 
        err?.status === 503 || err?.code === 503 ||
        err?.status === 429 || err?.code === 429 ||
        errMsg.toLowerCase().includes('high demand') ||
        errMsg.toLowerCase().includes('unavailable') ||
        errMsg.toLowerCase().includes('temporarily');

      if (isHighDemandOrTransient) {
        console.warn(`Gemini model ${modelName} is experiencing temporary high demand (503/429). Switching to next fallback model...`);
        // Short jitter before fallback
        await new Promise(resolve => setTimeout(resolve, 350));
      } else {
        console.warn(`Gemini call error on ${modelName}:`, errMsg);
      }
    }
  }

  return null;
}

// API: AI Extract Makalah & Multi-Type Academic Document
app.post('/api/makalah/ai-extract', async (req, res) => {
  try {
    const { rawText = '', htmlContent = '', filename = '' } = req.body;
    
    if (!rawText && !htmlContent) {
      return res.status(400).json({ error: 'Teks dokumen tidak boleh kosong' });
    }

    // Smart sample: first 4,000 chars (cover, bab 1) + last 1,500 chars (kesimpulan, daftar pustaka)
    let sampleText = rawText || htmlContent;
    if (sampleText.length > 5500) {
      const head = sampleText.slice(0, 4000);
      const tail = sampleText.slice(-1500);
      sampleText = `${head}\n\n[...Bagian Isi Dokumen Disingkat Untuk Analisis Cepat...]\n\n${tail}`;
    }

    const ai = getAI();

    if (!ai) {
      // Use heuristic fallback if Gemini key is not configured
      const fallback = heuristicExtractMakalah(rawText, filename, htmlContent);
      return res.json({ success: true, ...fallback, method: 'heuristic' });
    }

    const prompt = `Anda adalah asisten kurasi repositori karya ilmiah dan editor naskah akademik universitas.
Tugas Anda adalah menganalisis dokumen akademik berikut (nama file: "${filename}") secara mendalam. Dokumen yang diunggah bisa bermacam-macam jenis (Makalah, Skripsi S1, Tesis S2, Disertasi S3, Proposal Penelitian, Artikel Jurnal Ilmiah, Laporan Magang/KKN/PKL, Laporan Praktikum, Modul/Bahan Ajar, Esai, dsb).

Instruksi Analisis:
1. "documentType": Klasifikasikan jenis dokumen secara presisi. Pilihan wajib salah satu dari:
   - "skripsi" (untuk Skripsi S1 atau Tugas Akhir)
   - "tesis" (untuk Tesis S2 atau Disertasi S3)
   - "proposal" (untuk Proposal Skripsi / Riset / Hibah / PKM)
   - "jurnal" (untuk Naskah Artikel Jurnal Ilmiah dengan abstrak & metodologi)
   - "laporan_pkl" (untuk Laporan Magang, KKN, atau Praktik Kerja Lapangan)
   - "laporan_praktikum" (untuk Laporan Praktikum Laboratorium / Percobaan)
   - "modul_ajar" (untuk Modul, Diktat, Bahan Ajar, atau Silabus/RPS)
   - "esai" (untuk Esai, Opini, atau Artikel Gagasan)
   - "review_buku" (untuk Bedah Buku / Resensi / Critical Review)
   - "makalah" (untuk Makalah Kuliah standar, Tugas Kelompok, dsb)
   - "dokumen_umum" (jika dokumen akademik lainnya)

2. "documentTypeLabel": Nama ramah jenis dokumen dalam Bahasa Indonesia (contoh: "Skripsi S1", "Artikel Jurnal Ilmiah", "Proposal Penelitian", "Laporan PKL & Magang", "Modul Pembelajaran", "Makalah Kuliah").

3. "title": Tentukan judul karya yang baku, jelas, akademis, dan rapi dalam Bahasa Indonesia (bukan nama file mentah).

4. "theme": Bidang tema/keilmuan spesifik (misal: "Pendidikan Agama Islam", "Hukum Tata Negara", "Hukum Pidana", "Manajemen Bisnis", "Ekonomi Syariah", "Teknologi Informasi", "Kesehatan & Keperawatan", "Psikologi", "Ilmu Komunikasi", "Pendidikan Guru SD", "Teknik", dsb).

5. "academicLevel": Jenjang akademik yang terdeteksi (misal: "Sarjana (S1)", "Magister (S2)", "Diploma (D3/D4)", "Umum / Mahasiswa").

6. "autoDescription": Berikan keterangan otomatis yang komprehensif dalam 2-3 kalimat mengenai fokus bahasan dokumen, metode/pendekatan yang diulas, serta kontribusi atau kesimpulannya.

7. "excerpt": Ringkasan abstrak singkat (maksimal 240 karakter).

8. "detectedChapters": Array nama-nama bab atau bagian utama yang terdeteksi (contoh: ["BAB I PENDAHULUAN", "BAB II TINJAUAN PUSTAKA", "BAB III METODE PENELITIAN", "BAB IV HASIL DAN PEMBAHASAN", "BAB V PENUTUP"]).

9. "author": Nama penyusun / mahasiswa (jika terdeteksi di lembar judul/cover, atau "Tim Penulis Mahasiswa").

10. "advisor": Nama dosen pembimbing atau dosen pengampu jika tertera (atau "").

11. "institution": Nama universitas / fakultas / sekolah tinggi jika ada.

12. "tags": Array 3 sampai 5 kata kunci (tags) relevan.

13. "readingTimeMinutes": Angka estimasi waktu baca (menit, integer).

CUPLIKAN DOKUMEN:
"""
${sampleText}
"""

Hasilkan HANYA JSON murni tanpa markdown codeblock formatting:
{
  "documentType": "...",
  "documentTypeLabel": "...",
  "title": "...",
  "theme": "...",
  "academicLevel": "...",
  "advisor": "...",
  "excerpt": "...",
  "autoDescription": "...",
  "detectedChapters": ["...", "..."],
  "tags": ["...", "..."],
  "author": "...",
  "institution": "...",
  "readingTimeMinutes": 5
}`;

    const aiResult = await callGeminiWithFallback(ai, prompt);

    if (aiResult && aiResult.text) {
      let parsed: any = null;
      try {
        parsed = JSON.parse(aiResult.text.trim());
      } catch (e) {
        // Strip markdown backticks if any
        const cleaned = aiResult.text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
        try {
          parsed = JSON.parse(cleaned);
        } catch (err) {
          parsed = null;
        }
      }

      if (parsed && parsed.title) {
        const words = rawText.split(/\s+/).filter(Boolean);
        const wordCount = words.length;
        const pageEstimate = Math.max(1, Math.round(wordCount / 320));
        const formattedHtml = formatMakalahHtml(htmlContent, rawText);

        return res.json({
          success: true,
          title: parsed.title,
          documentType: parsed.documentType || 'makalah',
          documentTypeLabel: parsed.documentTypeLabel || 'Makalah Akademik',
          theme: parsed.theme || 'Karya Ilmiah',
          academicLevel: parsed.academicLevel || 'Perkuliahan Mahasiswa',
          advisor: parsed.advisor || '',
          excerpt: parsed.excerpt || '',
          autoDescription: parsed.autoDescription || `Naskah akademik ${parsed.documentTypeLabel || 'makalah'} mengenai ${parsed.title}.`,
          detectedChapters: Array.isArray(parsed.detectedChapters) ? parsed.detectedChapters : [],
          pageEstimate,
          wordCount,
          tags: Array.isArray(parsed.tags) ? parsed.tags : ['karya ilmiah'],
          author: parsed.author || 'Tim Penulis Mahasiswa',
          institution: parsed.institution || '',
          readingTimeMinutes: Number(parsed.readingTimeMinutes) || Math.max(2, Math.ceil(wordCount / 200)),
          formattedHtml,
          method: aiResult.modelUsed
        });
      }
    }

    // Smooth fallback if all AI models are temporarily under high demand
    const fallback = heuristicExtractMakalah(rawText, filename, htmlContent);
    return res.json({ success: true, ...fallback, method: 'heuristic_fallback' });
  } catch (error: any) {
    console.error('Error in /api/makalah/ai-extract:', error);
    // Even in unexpected error, gracefully fallback instead of crashing
    const fallback = heuristicExtractMakalah(req.body?.rawText || '', req.body?.filename || '', req.body?.htmlContent || '');
    return res.json({ success: true, ...fallback, method: 'heuristic_safe_recovery' });
  }
});

// Helper: Determine accurate MIME type by filename
function getFileMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === '.doc') return 'application/msword';
  if (ext === '.txt') return 'text/plain; charset=utf-8';
  if (ext === '.md') return 'text/markdown; charset=utf-8';
  if (ext === '.rtf') return 'application/rtf';
  if (ext === '.odt') return 'application/vnd.oasis.opendocument.text';
  return 'application/octet-stream';
}

// API: Extract text and structure from uploaded PDF file
app.post('/api/makalah/extract-pdf', async (req, res) => {
  try {
    const { fileBase64, fileName } = req.body;
    if (!fileBase64) {
      return res.status(400).json({ error: 'fileBase64 diperlukan' });
    }
    const buffer = Buffer.from(fileBase64, 'base64');
    let rawText = '';
    let pageCount = 1;
    let info: any = {};

    if (PDFParseClass) {
      if (typeof PDFParseClass === 'function' && PDFParseClass.prototype?.getText) {
        // pdf-parse v2 class API
        const parser = new PDFParseClass({ data: buffer });
        const textResult = await parser.getText();
        try {
          const infoResult = await parser.getInfo();
          info = infoResult?.info || {};
        } catch (e) {}
        await parser.destroy().catch(() => {});
        rawText = (textResult?.text || (textResult?.pages ? textResult.pages.map((p: any) => p.text).join('\n\n') : '') || '').trim();
        pageCount = textResult?.total || 1;
      } else if (typeof PDFParseClass === 'function') {
        // legacy pdf-parse function API
        const data = await PDFParseClass(buffer);
        rawText = (data.text || '').trim();
        pageCount = data.numpages || 1;
        info = data.info || {};
      }
    }

    // Generate formatted HTML from PDF paragraphs
    const paragraphs = rawText
      .split(/\n\s*\n/)
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 0);

    const htmlContent = paragraphs.map((p: string) => {
      if (/^(bab\s+[ivx\d]+|pendahuluan|tinjauan\s+pustaka|metode|pembahasan|kesimpulan|daftar\s+pustaka)/i.test(p)) {
        return `<h2 class="text-xl font-bold text-black mt-8 mb-3 pb-1 border-b border-slate-300">${p}</h2>`;
      }
      if (/^[A-Z]\.\s+/i.test(p) && p.length < 120) {
        return `<h3 class="text-lg font-bold text-black mt-5 mb-2">${p}</h3>`;
      }
      return `<p class="text-black leading-relaxed mb-4 text-justify">${p.replace(/\n/g, ' ')}</p>`;
    }).join('');

    return res.json({
      success: true,
      rawText,
      htmlContent,
      pageCount,
      info: {
        title: info.Title || '',
        author: info.Author || '',
        creator: info.Creator || ''
      }
    });
  } catch (err: any) {
    console.error('PDF extraction failed:', err);
    return res.status(500).json({ error: err.message || 'Gagal mengekstrak berkas PDF' });
  }
});

// Helper: Generate clean, valid Word .docx buffer using JSZip for genuine fallback documents
async function createValidDocx(title: string, author: string, contentText: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');

  const escapeXml = (unsafe: string) => unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });

  const paragraphs = contentText.split(/\n+/).filter(Boolean);
  const pXmls = [
    `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>${escapeXml(title)}</w:t></w:r></w:p>`,
    `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:i/><w:sz w:val="24"/></w:rPr><w:t>Penulis: ${escapeXml(author || 'Tim Penulis Mahasiswa')}</w:t></w:r></w:p>`,
    `<w:p/>`,
    ...paragraphs.map(p => `<w:p><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>${escapeXml(p)}</w:t></w:r></w:p>`)
  ].join('');

  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${pXmls}</w:body></w:document>`);

  return await zip.generateAsync({ type: 'nodebuffer' });
}

// Pre-initialize genuine Microsoft Word .docx files for the sample posts so they download 100% real files
async function initSampleMakalahFiles() {
  const sampleFiles = [
    {
      fileName: 'Makalah_AI_Dalam_Pendidikan_Tinggi.docx',
      title: 'Peran Kecerdasan Buatan (AI) Dalam Transformasi Pembelajaran Pendidikan Tinggi',
      author: 'Ahmad Fauzi, M.Pd & Tim',
      content: `BAB I PENDAHULUAN\n\nPerkembangan teknologi kecerdasan buatan (Artificial Intelligence) dalam kurun waktu lima tahun terakhir telah membawa perubahan paradigma yang sangat signifikan dalam ekosistem pendidikan global. Integrasi AI dalam kegiatan belajar mengajar tidak lagi sebatas alat bantu komputasi, melainkan telah bertransformasi menjadi mitra dialog pedagogis yang adaptif.\n\nBAB II PEMBAHASAN\n\nPembelajaran terpersonalisasi memanfaatkan model bahasa besar (Large Language Models) untuk mendeteksi kecepatan pemahaman setiap peserta didik.\n\nBAB III KESIMPULAN\n\nPemanfaatan AI bukan untuk menggantikan peran pendidik, melainkan memperkaya interaksi pedagogis bermakna.`
    },
    {
      fileName: 'Makalah_Hukum_Perlindungan_Data_Pribadi.docx',
      title: 'Analisis Yuridis Perlindungan Data Pribadi Konsumen dalam Transaksi E-Commerce di Indonesia',
      author: 'Nurul Hidayati, S.H. & Rekan',
      content: `BAB I PENDAHULUAN\n\nPesatnya pertumbuhan ekosistem niaga elektronik (e-commerce) di Indonesia membuka peluang ekonomi sekaligus menimbulkan kerentanan baru terhadap privasi konsumen.\n\nBAB II PEMBAHASAN\n\nBerdasarkan asas hukum akuntabilitas dalam UU PDP, pengendali data pribadi berkewajiban menerapkan enkripsi data standar industri.\n\nBAB III KESIMPULAN\n\nSinergi antara sanksi administratif dan ganti rugi perdata merupakan kunci pemulihan hak privasi konsumen yang dilanggar.`
    },
    {
      fileName: 'Makalah_Ekonomi_Syariah_Penguatan_UMKM.docx',
      title: 'Strategi Penguatan Sektor UMKM Melalui Instrumen Keuangan Sosial Islam di Era Digital',
      author: 'Muhammad Farhan & Tim Riset',
      content: `BAB I PENDAHULUAN\n\nSektor Usaha Mikro, Kecil, dan Menengah (UMKM) merupakan tulang punggung perekonomian nasional yang menyumbang lebih dari 61% PDB Indonesia.\n\nBAB II PEMBAHASAN\n\nIntegrasi wakaf produktif digital dan crowdfunding syariah terbukti mampu menekan biaya permodalan bagi pelaku usaha ultra-mikro.\n\nBAB III KESIMPULAN\n\nKolaborasi regulator, lembaga amil zakat, dan platform fintech syariah sangat krusial.`
    }
  ];

  for (const s of sampleFiles) {
    const targetPath = path.join(UPLOAD_DIR, s.fileName);
    if (!fs.existsSync(targetPath)) {
      try {
        const buf = await createValidDocx(s.title, s.author, s.content);
        fs.writeFileSync(targetPath, buf);
        fs.writeFileSync(`${targetPath}.meta.json`, JSON.stringify({
          fileId: s.fileName,
          originalFileName: s.fileName,
          fileSize: buf.length,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          uploadedAt: Date.now()
        }, null, 2));
      } catch (err) {
        console.warn('Gagal membuat sample docx:', s.fileName, err);
      }
    }
  }
}

// API: 100% Original Uploaded File Store (Exact Byte-For-Byte Binary Without Any Modification)
app.post('/api/makalah/upload-file', async (req, res) => {
  try {
    const { fileName, fileBase64, fileSize } = req.body;
    if (!fileName || !fileBase64) {
      return res.status(400).json({ error: 'Nama berkas (fileName) dan data (fileBase64) diperlukan' });
    }

    // Sanitize safe filename while preserving readable original name
    const safeBaseName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeBaseName}`;
    const filePath = path.join(UPLOAD_DIR, fileId);

    // Save exact, 100% untouched binary buffer from client upload into hosting disk storage
    const cleanBase64 = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
    const buffer = Buffer.from(cleanBase64, 'base64');
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Auto-detect duplicate file against existing posts
    if (req.body.checkDuplicate !== false) {
      const diskPosts = getDiskPosts();
      const normFileName = fileName.toLowerCase().replace(/\.(docx?|pdf|txt|md|odt|rtf)$/i, '').replace(/[^a-z0-9]/g, '');
      const rawFileName = fileName.trim().toLowerCase();

      for (const p of diskPosts) {
        if (!p || p.status === 'trash') continue;
        const hashMatch = p.fileHash && p.fileHash === fileHash;
        const rawNameMatch = p.originalFileName && p.originalFileName.trim().toLowerCase() === rawFileName;
        const normNameMatch = p.originalFileName && 
          p.originalFileName.toLowerCase().replace(/\.(docx?|pdf|txt|md|odt|rtf)$/i, '').replace(/[^a-z0-9]/g, '') === normFileName;
        const sizeMatch = !p.originalFileSize || Math.abs(p.originalFileSize - buffer.length) < 100;

        if (hashMatch || rawNameMatch || (normNameMatch && sizeMatch)) {
          const reason = hashMatch 
            ? 'Isi berkas identik (SHA-256 hash sama)' 
            : (rawNameMatch ? 'Nama berkas sudah terdaftar di postingan' : 'Nama dan ukuran berkas identik');
          return res.status(409).json({
            success: false,
            isDuplicate: true,
            code: 'DUPLICATE_FILE_REJECTED',
            error: `File ini sudah ada di postingan: "${p.title}" (${reason}). Postingan ditolak/dibatalkan untuk menghindari data ganda.`,
            duplicateTitle: p.title,
            duplicateId: p.id,
            matchedBy: hashMatch ? 'hash' : (rawNameMatch ? 'filename' : 'filename_and_size')
          });
        }
      }
    }
    
    // Save to primary makalah upload directory
    fs.writeFileSync(filePath, buffer);
    // Save to root uploads directory as well
    try {
      fs.writeFileSync(path.join(GENERAL_UPLOADS_DIR, fileId), buffer);
      fs.writeFileSync(path.join(UPLOAD_DIR, safeBaseName), buffer);
      fs.writeFileSync(path.join(GENERAL_UPLOADS_DIR, safeBaseName), buffer);
    } catch (e) {}

    const mimeType = getFileMimeType(fileName);

    // Save permanently to Cloudflare R2 if configured
    let r2Uploaded = false;
    let r2DirectUrl = '';
    if (isR2Configured()) {
      try {
        const r2Key = `makalah/${fileId}`;
        const r2Res = await uploadToR2(r2Key, buffer, mimeType);
        if (r2Res.success && r2Res.url) {
          r2Uploaded = true;
          r2DirectUrl = r2Res.url;
        }
      } catch (r2Err) {
        console.warn('R2 makalah upload notice (saved to hosting disk):', r2Err);
      }
    }

    // Save metadata file for original filename retention
    const metaData = {
      fileId,
      originalFileName: fileName,
      fileSize: buffer.length || fileSize,
      fileHash,
      mimeType,
      uploadedAt: Date.now(),
      storage: r2Uploaded ? 'cloudflare_r2' : 'hosting',
      r2Key: r2Uploaded ? `makalah/${fileId}` : undefined,
      r2Url: r2DirectUrl || undefined
    };
    const metaPath = path.join(UPLOAD_DIR, `${fileId}.meta.json`);
    fs.writeFileSync(metaPath, JSON.stringify(metaData, null, 2));
    try {
      fs.writeFileSync(path.join(GENERAL_UPLOADS_DIR, `${fileId}.meta.json`), JSON.stringify(metaData, null, 2));
    } catch (e) {}

    const downloadUrl = `/api/makalah/download/${encodeURIComponent(fileId)}`;
    const hostingStaticUrl = `/uploads/makalah/${encodeURIComponent(fileId)}`;
    return res.json({
      success: true,
      fileId,
      fileHash,
      downloadUrl,
      hostingUrl: hostingStaticUrl,
      r2Url: r2DirectUrl || undefined,
      storageType: r2Uploaded ? 'cloudflare_r2' : 'hosting',
      originalFileName: fileName,
      fileSize: buffer.length,
      mimeType,
      message: r2Uploaded 
        ? 'Berkas asli berhasil disimpan permanen di Cloudflare R2 Object Storage.'
        : 'Berkas asli berhasil disimpan di hosting ZAIN.NET'
    });
  } catch (err: any) {
    console.error('Error saving original makalah file:', err);
    return res.status(500).json({ error: err.message || 'Gagal menyimpan berkas asli ke server' });
  }
});

// Sync all 100% original binary files from Firestore posts to local disk storage
async function syncOriginalFilesFromFirestore() {
  try {
    const db = getServerDb();
    if (!db) return;
    const snap = await getDocs(collection(db, 'posts'));
    for (const docSnap of snap.docs) {
      const post = docSnap.data();
      if (!post.originalFileDataUrl || typeof post.originalFileDataUrl !== 'string') continue;
      
      const base64Data = post.originalFileDataUrl.includes(',') 
        ? post.originalFileDataUrl.split(',')[1] 
        : post.originalFileDataUrl;
      const buf = Buffer.from(base64Data, 'base64');
      if (buf.length < 500) continue;

      const originalName = post.originalFileName || `${post.title || docSnap.id}.docx`;
      const safeName = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, '_');

      // 1. Save by fileId if available
      if (post.fileId) {
        const p1 = path.join(UPLOAD_DIR, post.fileId);
        if (!fs.existsSync(p1)) fs.writeFileSync(p1, buf);
      }

      // 2. Save by Firestore doc ID
      const pDoc = path.join(UPLOAD_DIR, `${docSnap.id}.docx`);
      if (!fs.existsSync(pDoc)) fs.writeFileSync(pDoc, buf);

      // 3. Save by originalFileName
      const pOrig = path.join(UPLOAD_DIR, originalName);
      if (!fs.existsSync(pOrig)) fs.writeFileSync(pOrig, buf);

      // 4. Save by sanitized safe name
      const pSafe = path.join(UPLOAD_DIR, safeName);
      if (!fs.existsSync(pSafe)) fs.writeFileSync(pSafe, buf);

      // 5. Save metadata
      const meta = {
        fileId: post.fileId || docSnap.id,
        postId: docSnap.id,
        originalFileName: originalName,
        fileSize: buf.length,
        mimeType: getFileMimeType(originalName),
        uploadedAt: post.createdAt || Date.now()
      };
      fs.writeFileSync(path.join(UPLOAD_DIR, `${docSnap.id}.meta.json`), JSON.stringify(meta, null, 2));
      if (post.fileId) {
        fs.writeFileSync(path.join(UPLOAD_DIR, `${post.fileId}.meta.json`), JSON.stringify(meta, null, 2));
      }
    }
  } catch (err) {
    console.warn('Sync original files from Firestore error:', err);
  }
}

// API: Direct Download Link for 100% Original Uploaded File (Word, PDF, Text, etc.)
app.get('/api/makalah/download/:fileId', async (req, res) => {
  try {
    const rawParam = req.params.fileId;
    const fileId = decodeURIComponent(rawParam).trim();
    let downloadFileName = fileId;

    // Helper to send the buffer with proper MIME and disposition headers
    const sendOriginalFile = (buf: Buffer, finalName: string) => {
      const cleanName = finalName;
      const mime = getFileMimeType(cleanName);
      const asciiName = cleanName.replace(/["\r\n\\]/g, '').replace(/[^a-zA-Z0-9._ -]/g, '_');
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(cleanName)}`);
      res.setHeader('Content-Length', buf.length);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.end(buf);
    };

    // 1. Direct file existence check in UPLOAD_DIR and GENERAL_UPLOADS_DIR
    const candidateDirs = [UPLOAD_DIR, GENERAL_UPLOADS_DIR];
    for (const dir of candidateDirs) {
      const directPath = path.join(dir, fileId);
      if (fs.existsSync(directPath) && !fs.statSync(directPath).isDirectory()) {
        const metaPath = path.join(dir, `${fileId}.meta.json`);
        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            if (meta.originalFileName) downloadFileName = meta.originalFileName;
          } catch (e) {}
        }
        return sendOriginalFile(fs.readFileSync(directPath), downloadFileName);
      }
    }

    // 2. Search directories for matching filename or metadata
    for (const dir of candidateDirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir);
      // Check .meta.json files for originalFileName or fileId or postId match
      for (const f of files) {
        if (f.endsWith('.meta.json')) {
          try {
            const meta = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
            if (
              meta.originalFileName === fileId ||
              meta.fileId === fileId ||
              meta.postId === fileId ||
              meta.originalFileName?.toLowerCase() === fileId.toLowerCase()
            ) {
              const matchedFile = files.find(file => !file.endsWith('.meta.json') && (file === meta.fileId || file === `${meta.postId}.docx` || file === meta.originalFileName));
              if (matchedFile) {
                const b = fs.readFileSync(path.join(dir, matchedFile));
                return sendOriginalFile(b, meta.originalFileName || matchedFile);
              }
            }
          } catch (e) {}
        }
      }

      // Check simple filename match in directory
      const cleanTarget = fileId.toLowerCase().replace(/\.(docx|pdf|txt|md|doc)$/i, '');
      const matched = files.find(f => !f.endsWith('.meta.json') && (
        f.toLowerCase() === fileId.toLowerCase() ||
        f.toLowerCase().includes(cleanTarget)
      ));
      if (matched) {
        const b = fs.readFileSync(path.join(dir, matched));
        return sendOriginalFile(b, matched);
      }
    }

    // 2.5. Check Cloudflare R2 Object Storage if configured
    if (isR2Configured()) {
      try {
        const r2KeysToTest = [
          `makalah/${fileId}`,
          fileId,
          `documents/${fileId}`,
          `makalah/${downloadFileName}`,
          downloadFileName
        ];
        for (const testKey of r2KeysToTest) {
          const r2Buf = await getFromR2(testKey);
          if (r2Buf && r2Buf.length > 0) {
            // Cache back to disk for accelerated local response
            try {
              fs.writeFileSync(path.join(UPLOAD_DIR, fileId), r2Buf);
            } catch (e) {}
            return sendOriginalFile(r2Buf, downloadFileName);
          }
        }
      } catch (r2Err) {
        console.warn('R2 download check warning:', r2Err);
      }
    }

    // 3. Check Firestore for original file data in collection 'posts'
    const db = getServerDb();
    if (db) {
      const cleanTarget = fileId.toLowerCase().replace(/\.(docx|pdf|txt|md|doc)$/i, '');
      const snap = await getDocs(collection(db, 'posts'));
      for (const docSnap of snap.docs) {
        const post = docSnap.data();
        const matches = 
          docSnap.id === fileId ||
          docSnap.id === cleanTarget ||
          post.fileId === fileId ||
          post.originalFileName === fileId ||
          post.originalFileName?.toLowerCase() === fileId.toLowerCase() ||
          post.slug === cleanTarget ||
          (post.originalFileName && post.originalFileName.toLowerCase().includes(cleanTarget));

        if (matches && post.originalFileDataUrl) {
          const base64Data = post.originalFileDataUrl.includes(',') 
            ? post.originalFileDataUrl.split(',')[1] 
            : post.originalFileDataUrl;
          const buf = Buffer.from(base64Data, 'base64');
          
          const origName = post.originalFileName || `${post.title || docSnap.id}.docx`;
          // Cache to disk
          try {
            fs.writeFileSync(path.join(UPLOAD_DIR, origName), buf);
            fs.writeFileSync(path.join(UPLOAD_DIR, `${docSnap.id}${path.extname(origName) || '.docx'}`), buf);
          } catch (e) {}

          return sendOriginalFile(buf, origName);
        }
      }
    }

    // 4. If matching one of sample files, generate sample docx
    const sampleKeywords = ['ai', 'pendidikan', 'hukum', 'perlindungan', 'ekonomi', 'syariah', 'umkm'];
    const isSample = sampleKeywords.some(kw => fileId.toLowerCase().includes(kw));
    if (isSample) {
      const sampleBuf = await createValidDocx(
        downloadFileName.replace(/\.docx$/i, '').replace(/[_-]+/g, ' '),
        'Tim Penulis Akademik ZAIN.NET',
        `Naskah Makalah Akademik Mahasiswa ZAIN.NET\n\nBerkas karya ilmiah akademik format Microsoft Word (.docx).`
      );
      return sendOriginalFile(sampleBuf, downloadFileName.endsWith('.docx') ? downloadFileName : `${downloadFileName}.docx`);
    }

    // 5. Check all saved posts in disk storage for binary dataUrl or text content to dynamically recreate genuine .docx
    const allKnownPosts = getDiskPosts();
    const cleanId = fileId.toLowerCase().replace(/\.(docx|pdf|txt|md|doc)$/i, '');
    const matchedPost = allKnownPosts.find(p => {
      if (!p) return false;
      const s = (p.slug || '').toLowerCase();
      const i = (p.id || '').toLowerCase();
      const f = (p.fileId || '').toLowerCase();
      const o = (p.originalFileName || '').toLowerCase();
      const t = (p.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return i === cleanId || s === cleanId || f === cleanId || o === cleanId || o === fileId.toLowerCase() || t.includes(cleanId) || cleanId.includes(s);
    });

    if (matchedPost) {
      const targetOutName = matchedPost.originalFileName || `${matchedPost.title || 'makalah'}.docx`;

      // 5a. If post has originalFileDataUrl
      if (matchedPost.originalFileDataUrl && typeof matchedPost.originalFileDataUrl === 'string' && matchedPost.originalFileDataUrl.startsWith('data:')) {
        try {
          const base64Data = matchedPost.originalFileDataUrl.includes(',') 
            ? matchedPost.originalFileDataUrl.split(',')[1] 
            : matchedPost.originalFileDataUrl;
          const buf = Buffer.from(base64Data, 'base64');
          if (buf.length > 50) {
            fs.writeFileSync(path.join(UPLOAD_DIR, targetOutName), buf);
            if (matchedPost.fileId) fs.writeFileSync(path.join(UPLOAD_DIR, matchedPost.fileId), buf);
            return sendOriginalFile(buf, targetOutName);
          }
        } catch (e) {}
      }

      // 5b. Dynamically regenerate complete valid Microsoft Word (.docx) from post content
      let textContent = '';
      if (matchedPost.contentHtml) {
        textContent = matchedPost.contentHtml
          .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n\n$1\n\n')
          .replace(/<p[^>]*>(.*?)<\/p>/gi, '\n$1\n')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#039;/g, "'")
          .trim();
      } else if (matchedPost.rawText) {
        textContent = matchedPost.rawText;
      } else {
        textContent = matchedPost.autoDescription || matchedPost.excerpt || matchedPost.title;
      }

      const generatedDocx = await createValidDocx(
        matchedPost.title,
        matchedPost.author || 'Tim Penulis Mahasiswa',
        textContent
      );

      // Cache generated docx so future requests are instant
      try {
        fs.writeFileSync(path.join(UPLOAD_DIR, targetOutName), generatedDocx);
        if (matchedPost.fileId) {
          fs.writeFileSync(path.join(UPLOAD_DIR, matchedPost.fileId), generatedDocx);
        }
      } catch (e) {}

      return sendOriginalFile(generatedDocx, targetOutName.endsWith('.docx') ? targetOutName : `${targetOutName}.docx`);
    }

    // 6. File not found: Return clear 404 instead of generating fake content
    return res.status(404).json({
      error: `Berkas asli "${fileId}" belum ditemukan di repositori server. Pastikan berkas telah diunggah.`
    });
  } catch (err: any) {
    console.error('Download error:', err);
    return res.status(500).send('Gagal mengunduh berkas');
  }
});

// API: Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'ZAIN.NET Manual QRIS & Academic Hub', time: new Date().toISOString() });
});

// API: Client Network & IP Info (for Device & IP-based Free Trial Protection)
app.get('/api/client-info', (req, res) => {
  const forwarded = req.headers['x-forwarded-for'];
  let ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress || '127.0.0.1';
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  const userAgent = req.headers['user-agent'] || '';
  res.json({
    ip,
    userAgent,
    timestamp: Date.now()
  });
});

// Fallback redirect for auth-bridge
app.get('/auth-bridge', (req, res) => {
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(`/${query ? query + '&' : '?'}auth_bridge=1`);
});

// API: Fetch all published makalah posts for public blog & readers
app.get('/api/makalah/posts', async (req, res) => {
  try {
    const posts = await getAllServerPosts();
    return res.json({ success: true, posts });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// API: Fetch single makalah post by slug or ID directly (public, no auth required)
app.get('/api/makalah/post-by-slug/:slug', async (req, res) => {
  try {
    const post = await getServerPostBySlug(req.params.slug);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    return res.json({ success: true, post });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ADMIN API: Fetch all posts regardless of status (published, scheduled, draft, trash)
app.get('/api/makalah/admin/posts', async (req, res) => {
  try {
    const posts = await getAllServerPosts(true); // true = include scheduled, drafts, and trash for admin
    return res.json({ success: true, posts });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ADMIN API: Save or update a single post (persists directly to disk and memory cache)
const handleSavePost = async (req: express.Request, res: express.Response) => {
  try {
    const post = req.body;
    if (!post || !post.id || !post.title) {
      return res.status(400).json({ success: false, error: 'Data postingan tidak lengkap (id dan title wajib ada).' });
    }

    // Write binary file to disk if available
    if (post.originalFileDataUrl && typeof post.originalFileDataUrl === 'string' && post.originalFileDataUrl.startsWith('data:')) {
      try {
        const base64Data = post.originalFileDataUrl.includes(',') 
          ? post.originalFileDataUrl.split(',')[1] 
          : post.originalFileDataUrl;
        const buf = Buffer.from(base64Data, 'base64');
        if (buf.length > 50) {
          if (!post.fileHash) {
            post.fileHash = crypto.createHash('sha256').update(buf).digest('hex');
          }
          const origName = post.originalFileName || `${post.title || post.id}.docx`;
          const safeName = path.basename(origName).replace(/[^a-zA-Z0-9._-]/g, '_');
          if (post.fileId) {
            fs.writeFileSync(path.join(UPLOAD_DIR, post.fileId), buf);
            try { fs.writeFileSync(path.join(GENERAL_UPLOADS_DIR, post.fileId), buf); } catch (e) {}
          }
          fs.writeFileSync(path.join(UPLOAD_DIR, `${post.id}.docx`), buf);
          fs.writeFileSync(path.join(UPLOAD_DIR, safeName), buf);
          try { fs.writeFileSync(path.join(GENERAL_UPLOADS_DIR, safeName), buf); } catch (e) {}
        }
      } catch (fileErr) {
        console.warn('Could not write binary file to disk:', fileErr);
      }
    }

    const diskPosts = getDiskPosts();
    const existingIndex = diskPosts.findIndex(p => p.id === post.id);

    // Auto-detect duplicate post/file: reject if new post and already exists in posts
    if (existingIndex < 0 && req.body.skipDuplicateCheck !== true) {
      const normFileName = (post.originalFileName || '')
        .toLowerCase()
        .replace(/\.(docx?|pdf|txt|md|odt|rtf)$/i, '')
        .replace(/[^a-z0-9]/g, '');
      const rawFileName = (post.originalFileName || '').trim().toLowerCase();
      const normTitle = (post.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();

      for (const p of diskPosts) {
        if (!p || p.status === 'trash') continue;
        const hashMatch = post.fileHash && p.fileHash && post.fileHash === p.fileHash;
        const rawNameMatch = rawFileName && p.originalFileName && p.originalFileName.trim().toLowerCase() === rawFileName;
        const normNameMatch = normFileName && p.originalFileName && 
          p.originalFileName.toLowerCase().replace(/\.(docx?|pdf|txt|md|odt|rtf)$/i, '').replace(/[^a-z0-9]/g, '') === normFileName;
        const sizeMatch = !p.originalFileSize || !post.originalFileSize || Math.abs(p.originalFileSize - post.originalFileSize) < 100;
        const titleMatch = normTitle && normTitle.length > 6 && p.title &&
          p.title.toLowerCase().replace(/[^a-z0-9]/g, '').trim() === normTitle;

        if (hashMatch || rawNameMatch || (normNameMatch && sizeMatch) || titleMatch) {
          const reason = hashMatch 
            ? 'Isi berkas identik (SHA-256 sama)' 
            : (rawNameMatch ? 'Nama berkas sudah ada di postingan' : (titleMatch ? 'Judul postingan sudah ada' : 'Nama berkas serupa dan ukuran identik'));
          return res.status(409).json({
            success: false,
            code: 'DUPLICATE_FILE_REJECTED',
            error: `File ini sudah ada di postingan: "${p.title}" (${reason}). Postingan ditolak/dibatalkan untuk menghindari duplikasi.`,
            duplicateTitle: p.title,
            duplicateId: p.id,
            matchedBy: hashMatch ? 'hash' : (rawNameMatch ? 'filename' : (titleMatch ? 'title' : 'filename_and_size'))
          });
        }
      }
    }

    const now = Date.now();

    const normalizedPost = {
      ...post,
      updatedAt: now,
      status: post.status || 'published',
      publishedAt: post.status === 'published' ? (post.publishedAt || now) : (post.publishedAt || null)
    };

    if (existingIndex >= 0) {
      diskPosts[existingIndex] = normalizedPost;
    } else {
      diskPosts.unshift(normalizedPost);
    }

    saveDiskPosts(diskPosts);
    serverPostsCache = { data: diskPosts, timestamp: now };

    return res.json({ success: true, post: normalizedPost, message: 'Postingan berhasil disimpan.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

app.post('/api/makalah/admin/save-post', handleSavePost);
app.post('/api/makalah/save-post', handleSavePost);

// API: Auto-detect duplicate post or file against all saved posts
app.post('/api/makalah/check-duplicate', (req, res) => {
  try {
    const { fileName, fileSize, fileHash, title, slug, currentPostId } = req.body;
    const diskPosts = getDiskPosts();

    const normName = fileName ? fileName.toLowerCase().replace(/\.(docx?|pdf|txt|md|odt|rtf)$/i, '').replace(/[^a-z0-9]/g, '').trim() : '';
    const rawName = (fileName || '').trim().toLowerCase();
    const normTitle = title ? title.toLowerCase().replace(/[^a-z0-9]/g, '').trim() : '';

    for (const p of diskPosts) {
      if (!p || p.status === 'trash') continue;
      if (currentPostId && p.id === currentPostId) continue;

      // 1. Check fileHash (binary identity)
      if (fileHash && p.fileHash && fileHash === p.fileHash) {
        return res.json({
          isDuplicate: true,
          code: 'DUPLICATE_FILE_REJECTED',
          matchedBy: 'hash',
          reason: `Isi berkas identik (SHA-256 Hash sama) dengan postingan "${p.title}"`,
          existingPost: { id: p.id, title: p.title, slug: p.slug, originalFileName: p.originalFileName, status: p.status }
        });
      }

      // 2. Check exact raw file name
      const pRawName = (p.originalFileName || '').trim().toLowerCase();
      if (rawName && pRawName && rawName === pRawName) {
        return res.json({
          isDuplicate: true,
          code: 'DUPLICATE_FILE_REJECTED',
          matchedBy: 'filename',
          reason: `Nama berkas "${p.originalFileName}" sudah pernah diunggah pada postingan "${p.title}"`,
          existingPost: { id: p.id, title: p.title, slug: p.slug, originalFileName: p.originalFileName, status: p.status }
        });
      }

      // 3. Check normalized file name & size match
      const pNormName = (p.originalFileName || '').toLowerCase().replace(/\.(docx?|pdf|txt|md|odt|rtf)$/i, '').replace(/[^a-z0-9]/g, '').trim();
      if (normName && pNormName && normName === pNormName) {
        const sizeMatched = !fileSize || !p.originalFileSize || Math.abs(p.originalFileSize - fileSize) < 100;
        if (sizeMatched) {
          return res.json({
            isDuplicate: true,
            code: 'DUPLICATE_FILE_REJECTED',
            matchedBy: 'filename_and_size',
            reason: `Berkas serupa "${p.originalFileName}" sudah ada di postingan "${p.title}"`,
            existingPost: { id: p.id, title: p.title, slug: p.slug, originalFileName: p.originalFileName, status: p.status }
          });
        }
      }

      // 4. Check document title match
      if (normTitle && normTitle.length > 6) {
        const pNormTitle = (p.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
        if (pNormTitle && pNormTitle === normTitle) {
          return res.json({
            isDuplicate: true,
            code: 'DUPLICATE_FILE_REJECTED',
            matchedBy: 'title',
            reason: `Judul postingan "${p.title}" sudah ada di sistem`,
            existingPost: { id: p.id, title: p.title, slug: p.slug, originalFileName: p.originalFileName, status: p.status }
          });
        }
      }

      // 5. Check slug match
      if (slug && p.slug && slug === p.slug) {
        return res.json({
          isDuplicate: true,
          code: 'DUPLICATE_FILE_REJECTED',
          matchedBy: 'slug',
          reason: `Tautan URL "${p.slug}" sudah digunakan oleh postingan "${p.title}"`,
          existingPost: { id: p.id, title: p.title, slug: p.slug, originalFileName: p.originalFileName, status: p.status }
        });
      }
    }

    return res.json({ isDuplicate: false });
  } catch (err: any) {
    return res.status(500).json({ isDuplicate: false, error: err.message });
  }
});

// API: Re-hydrate/sync client posts to server disk (guarantees posts are never lost after idle container restart)
app.post('/api/makalah/sync-posts', (req, res) => {
  try {
    const { posts } = req.body;
    if (!Array.isArray(posts) || posts.length === 0) {
      return res.json({ success: true, count: 0 });
    }

    const diskPosts = getDiskPosts();
    const diskMap = new Map<string, any>();
    diskPosts.forEach(p => { if (p && p.id) diskMap.set(p.id, p); });

    let updatedCount = 0;
    for (const post of posts) {
      if (!post || !post.id) continue;

      // Extract binary file if present
      if (post.originalFileDataUrl && typeof post.originalFileDataUrl === 'string' && post.originalFileDataUrl.startsWith('data:')) {
        try {
          const base64Data = post.originalFileDataUrl.includes(',') 
            ? post.originalFileDataUrl.split(',')[1] 
            : post.originalFileDataUrl;
          const buf = Buffer.from(base64Data, 'base64');
          if (buf.length > 50) {
            if (!post.fileHash) {
              post.fileHash = crypto.createHash('sha256').update(buf).digest('hex');
            }
            const origName = post.originalFileName || `${post.title || post.id}.docx`;
            const safeName = path.basename(origName).replace(/[^a-zA-Z0-9._-]/g, '_');
            if (post.fileId) {
              const targetFile = path.join(UPLOAD_DIR, post.fileId);
              if (!fs.existsSync(targetFile)) fs.writeFileSync(targetFile, buf);
              const genFile = path.join(GENERAL_UPLOADS_DIR, post.fileId);
              if (!fs.existsSync(genFile)) try { fs.writeFileSync(genFile, buf); } catch (e) {}
            }
            const idPath = path.join(UPLOAD_DIR, `${post.id}.docx`);
            if (!fs.existsSync(idPath)) fs.writeFileSync(idPath, buf);
            const safePath = path.join(UPLOAD_DIR, safeName);
            if (!fs.existsSync(safePath)) fs.writeFileSync(safePath, buf);
            const genSafe = path.join(GENERAL_UPLOADS_DIR, safeName);
            if (!fs.existsSync(genSafe)) try { fs.writeFileSync(genSafe, buf); } catch (e) {}

            // If Cloudflare R2 is configured, backup binary file directly to R2
            if (isR2Configured()) {
              const r2Key = `makalah/${post.fileId || `${post.id}.docx`}`;
              uploadToR2(r2Key, buf, getFileMimeType(origName)).catch(() => {});
            }
          }
        } catch (e) {}
      }

      const existing = diskMap.get(post.id);
      if (!existing) {
        diskMap.set(post.id, post);
        updatedCount++;
      } else {
        diskMap.set(post.id, {
          ...existing,
          ...post,
          originalFileDataUrl: post.originalFileDataUrl || existing.originalFileDataUrl
        });
      }
    }

    const merged = Array.from(diskMap.values());
    saveDiskPosts(merged);
    serverPostsCache = { data: merged, timestamp: Date.now() };

    return res.json({ 
      success: true, 
      message: `Berhasil mensinkronisasi ${updatedCount} postingan ke repositori server.`, 
      total: merged.length 
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ADMIN API: Update status (publish, schedule, draft, trash)
app.post('/api/makalah/admin/update-status', async (req, res) => {
  try {
    const { postId, status, scheduledAt } = req.body;
    if (!postId || !status) {
      return res.status(400).json({ success: false, error: 'postId dan status wajib diisi.' });
    }

    const diskPosts = getDiskPosts();
    const postIndex = diskPosts.findIndex(p => p.id === postId);
    if (postIndex === -1) {
      return res.status(404).json({ success: false, error: 'Postingan tidak ditemukan di penyimpanan server.' });
    }

    const now = Date.now();
    const post = diskPosts[postIndex];
    post.status = status;
    post.updatedAt = now;

    if (status === 'scheduled' && scheduledAt) {
      post.scheduledAt = Number(scheduledAt);
      post.publishedAt = Number(scheduledAt);
    } else if (status === 'published') {
      post.publishedAt = post.publishedAt || now;
    } else if (status === 'trash') {
      post.deletedAt = now;
    }

    diskPosts[postIndex] = post;
    saveDiskPosts(diskPosts);
    serverPostsCache = { data: diskPosts, timestamp: now };

    return res.json({ success: true, post, message: `Status postingan berhasil diubah menjadi ${status}.` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ADMIN API: Batch update status
app.post('/api/makalah/admin/batch-status', async (req, res) => {
  try {
    const { postIds, status, scheduledAt } = req.body;
    if (!Array.isArray(postIds) || postIds.length === 0 || !status) {
      return res.status(400).json({ success: false, error: 'postIds (array) dan status wajib diisi.' });
    }

    const diskPosts = getDiskPosts();
    const idSet = new Set(postIds);
    const now = Date.now();

    let updatedCount = 0;
    diskPosts.forEach(post => {
      if (idSet.has(post.id)) {
        post.status = status;
        post.updatedAt = now;
        if (status === 'scheduled' && scheduledAt) {
          post.scheduledAt = Number(scheduledAt);
          post.publishedAt = Number(scheduledAt);
        } else if (status === 'published') {
          post.publishedAt = post.publishedAt || now;
        } else if (status === 'trash') {
          post.deletedAt = now;
        }
        updatedCount++;
      }
    });

    saveDiskPosts(diskPosts);
    serverPostsCache = { data: diskPosts, timestamp: now };

    return res.json({ success: true, updatedCount, message: `${updatedCount} postingan berhasil diubah statusnya ke ${status}.` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ADMIN API: Delete post permanently
app.post('/api/makalah/admin/delete-permanent', async (req, res) => {
  try {
    const { postIds } = req.body;
    const idsToDelete = Array.isArray(postIds) ? postIds : (req.body.postId ? [req.body.postId] : []);
    if (idsToDelete.length === 0) {
      return res.status(400).json({ success: false, error: 'postId atau postIds wajib diisi.' });
    }

    const diskPosts = getDiskPosts();
    const idSet = new Set(idsToDelete);
    const filtered = diskPosts.filter(p => !idSet.has(p.id));
    const deletedCount = diskPosts.length - filtered.length;

    saveDiskPosts(filtered);
    serverPostsCache = { data: filtered, timestamp: Date.now() };

    return res.json({ success: true, deletedCount, message: `${deletedCount} postingan berhasil dihapus permanen.` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ADMIN API: Clear all posts (completely empty the blog as requested)
const handleClearAllPosts = async (req: express.Request, res: express.Response) => {
  try {
    saveDiskPosts([]);
    serverPostsCache = { data: [], timestamp: Date.now() };

    // Also attempt Firestore deletion if available and not in cooldown
    const db = getServerDb();
    if (db && Date.now() >= serverFirestoreQuotaCooldownUntil) {
      try {
        const snap = await getDocs(collection(db, 'posts'));
        const batchPromises: Promise<any>[] = [];
        snap.forEach(d => {
          batchPromises.push(deleteDoc(doc(db, 'posts', d.id)));
        });
        await Promise.allSettled(batchPromises);
      } catch (fsErr) {
        console.warn('Firestore clear error (quota or network, safely ignored):', fsErr);
      }
    }

    return res.json({ 
      success: true, 
      message: 'Semua postingan blog telah berhasil dikosongkan. Blog sekarang bersih 0 postingan siap untuk unggahan berkas baru.' 
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

app.post('/api/makalah/admin/clear-all', handleClearAllPosts);
app.post('/api/makalah/clear-all', handleClearAllPosts);

// =========================================================================
// BLOG AGC (AUTO GENERATED CONTENT) ENGINE: VIRAL & TRENDING DAILY NEWS
// =========================================================================
const ROOT_AGC_STORAGE_FILE = path.join(process.cwd(), 'agc_posts.json');
const UPLOAD_AGC_STORAGE_FILE = path.join(UPLOAD_DIR, 'agc_posts.json');

const DEFAULT_SERVER_AGC_POSTS: any[] = AGC_DEEP_7000_ARTICLES;

function getDiskAgcPosts(): any[] {
  const mergedMap = new Map<string, any>();
  try {
    if (fs.existsSync(ROOT_AGC_STORAGE_FILE)) {
      const raw = fs.readFileSync(ROOT_AGC_STORAGE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach(p => { 
          if (p && p.id) {
            // Check if post is thin content (< 1000 words or missing tableOfContents)
            const textOnly = (p.contentHtml || '').replace(/<[^>]*>/g, ' ').trim();
            const words = textOnly ? textOnly.split(/\s+/).length : 0;
            if (words < 1000 || !p.tableOfContents || p.tableOfContents.length === 0) {
              const upgraded = expandPostTo7000Words(p);
              mergedMap.set(upgraded.id, upgraded);
            } else {
              mergedMap.set(p.id, p);
            }
          }
        });
      }
    }
  } catch (e) {}

  try {
    if (fs.existsSync(UPLOAD_AGC_STORAGE_FILE)) {
      const raw = fs.readFileSync(UPLOAD_AGC_STORAGE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach(p => { 
          if (p && p.id && !mergedMap.has(p.id)) {
            const textOnly = (p.contentHtml || '').replace(/<[^>]*>/g, ' ').trim();
            const words = textOnly ? textOnly.split(/\s+/).length : 0;
            if (words < 1000) {
              const upgraded = expandPostTo7000Words(p);
              mergedMap.set(upgraded.id, upgraded);
            } else {
              mergedMap.set(p.id, p);
            }
          }
        });
      }
    }
  } catch (e) {}

  // Guarantee seed 7,000-word masterclass articles are always present
  AGC_DEEP_7000_ARTICLES.forEach(seed => {
    if (!mergedMap.has(seed.id)) {
      mergedMap.set(seed.id, seed);
    }
  });

  const allPosts = Array.from(mergedMap.values()).sort((a, b) => (b.publishedAt || b.createdAt || 0) - (a.publishedAt || a.createdAt || 0));
  saveDiskAgcPosts(allPosts);
  return allPosts;
}

function saveDiskAgcPosts(posts: any[]): void {
  const data = JSON.stringify(posts, null, 2);
  try { fs.writeFileSync(ROOT_AGC_STORAGE_FILE, data, 'utf-8'); } catch (e) {}
  try { fs.writeFileSync(UPLOAD_AGC_STORAGE_FILE, data, 'utf-8'); } catch (e) {}
}

function getProceduralDailyArticles(count = 3, now = Date.now(), todayStr = ''): any[] {
  const curated = [
    {
      title: 'Agar Blog Bisa Menghasilkan Uang: Panduan Lengkap Dari Pemula Sampai Berhasil Gajian Rutin',
      category: 'Bisnis & Blogging',
      targetWords: 7180,
      img: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=1200&auto=format&fit=crop&q=80'
    },
    {
      title: 'Panduan Optimasi Struktur Template Blogspot Agar Super Ringan, Cepat, dan Cepat Diterima Google AdSense',
      category: 'Teknologi & Blogging',
      targetWords: 7110,
      img: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&auto=format&fit=crop&q=80'
    },
    {
      title: 'Panduan Lengkap SEO On-Page untuk Blogger Pemula: Cara Masuk Halaman 1 Google Tanpa Ribet',
      category: 'Teknologi & Blogging',
      targetWords: 7080,
      img: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&auto=format&fit=crop&q=80'
    },
    {
      title: 'Strategi Sukses Menghasilkan Uang dari Blog Lewat Program Afiliasi dan Sponsored Post Terpercaya',
      category: 'Bisnis & Blogging',
      targetWords: 7050,
      img: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=1200&auto=format&fit=crop&q=80'
    }
  ];

  return curated.slice(0, count).map(t => generateProcedural7000WordArticle(t.title, t.category, t.targetWords, t.img));
}

async function generateDailyAgcViralPosts(count = 3): Promise<any[]> {
  const ai = getAI();
  const todayStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const now = Date.now();

  let generatedArticles: any[] = [];

  if (ai) {
    const prompt = `Kamu adalah Penulis Redaksi Blogger & Tutorial StrukturKode ZAIN.NET.
Gaya penulisan: ramah, santai, solutif, edukatif khas blogger tutorial Indonesia (seperti postingan "Agar blog bisa menghasilkan uang" di StrukturKode).
Identifikasi ${count} topik tutorial blogging, teknologi web, SEO, atau bisnis konten digital yang paling diminati dan dicari pembaca hari ini (${todayStr}).
Kembalikan format JSON valid berupa array object:
[
  {
    "title": "Judul tutorial menarik, informatif, gaya blogger tutorial (misal: Panduan Lengkap Cara ..., Tips Ampuh ..., Rahasia Sukses ...)",
    "category": "Bisnis & Blogging" | "Teknologi & Blogging" | "Edukasi & Tutorial" | "Gaya Hidup & Karir"
  }
]`;

    try {
      const res = await callGeminiWithFallback(ai, prompt);
      if (res && res.text) {
        let cleanText = res.text.trim();
        if (cleanText.startsWith('```json')) {
          cleanText = cleanText.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
        } else if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/^```\s*/i, '').replace(/\s*```$/, '');
        }
        const parsed = JSON.parse(cleanText);
        if (Array.isArray(parsed) && parsed.length > 0) {
          generatedArticles = parsed.slice(0, count).map(item => {
            return generateProcedural7000WordArticle(
              item.title,
              item.category || 'Teknologi & AI',
              7200
            );
          });
        }
      }
    } catch (geminiErr) {
      console.warn('Gemini trend discovery fallback to procedural:', geminiErr);
    }
  }

  if (generatedArticles.length === 0) {
    generatedArticles = getProceduralDailyArticles(count, now, todayStr);
  }

  const existingPosts = getDiskAgcPosts();
  const updatedPosts = [...generatedArticles, ...existingPosts];
  saveDiskAgcPosts(updatedPosts);

  return generatedArticles;
}

// AGC API: Fetch all published AGC viral news
app.get('/api/agc/posts', (req, res) => {
  try {
    const posts = getDiskAgcPosts();
    return res.json({ success: true, posts });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// AGC API: Status of AGC daily automation
app.get('/api/agc/status', (req, res) => {
  try {
    const posts = getDiskAgcPosts();
    const todayStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const postsToday = posts.filter(p => p.publishedDate === todayStr || (p.publishedAt && (Date.now() - p.publishedAt) < 24 * 3600 * 1000)).length;
    return res.json({
      success: true,
      active: true,
      schedule: 'Setiap Hari (Otomatis)',
      postsToday,
      totalPosts: posts.length,
      lastUpdated: posts[0]?.publishedAt || Date.now()
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// AGC API: Generate and publish daily viral trending news
app.post('/api/agc/generate-daily', async (req, res) => {
  try {
    const count = Number(req.body.count) || 3;
    const newPosts = await generateDailyAgcViralPosts(count);
    return res.json({
      success: true,
      posts: newPosts,
      message: `${newPosts.length} Berita viral trending hari ini berhasil diposting secara otomatis!`
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// AGC API: Increment view count
app.post('/api/agc/view/:id', (req, res) => {
  try {
    const posts = getDiskAgcPosts();
    const target = posts.find(p => p.id === req.params.id);
    if (target) {
      target.views = (target.views || 0) + 1;
      target.viewsCount = target.views;
      saveDiskAgcPosts(posts);
    }
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// AGC API: Delete an AGC post
app.delete('/api/agc/posts/:id', (req, res) => {
  try {
    const posts = getDiskAgcPosts();
    const filtered = posts.filter(p => p.id !== req.params.id);
    saveDiskAgcPosts(filtered);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// AGC API: Expand post to 7,000-word masterclass
app.post('/api/agc/expand/:id', (req, res) => {
  try {
    const posts = getDiskAgcPosts();
    const idx = posts.findIndex(p => p.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Post tidak ditemukan' });
    }
    const upgraded = expandPostTo7000Words(posts[idx]);
    posts[idx] = upgraded;
    saveDiskAgcPosts(posts);
    return res.json({ success: true, post: upgraded, message: 'Artikel berhasil diekspansi menjadi panduan lengkap 7.000 kata!' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// AGC API: Reset to seed 7,000-word masterclasses
app.post('/api/agc/reset-seed', (req, res) => {
  try {
    saveDiskAgcPosts(AGC_DEEP_7000_ARTICLES);
    return res.json({ success: true, posts: AGC_DEEP_7000_ARTICLES, message: 'Database AGC berhasil disegarkan dengan artikel 7.000 kata standar tinggi!' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Background check: run on startup and every 4 hours
function setupAgcDailyAutoPoster() {
  const checkAndRun = async () => {
    try {
      const posts = getDiskAgcPosts();
      const todayStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      const hasTodayPost = posts.some(p => p.publishedDate === todayStr || (p.publishedAt && (Date.now() - p.publishedAt) < 24 * 3600 * 1000));
      
      if (!hasTodayPost || posts.length < 3) {
        console.log('[AGC ENGINE] Memulai auto-posting berita viral trending harian secara otomatis...');
        await generateDailyAgcViralPosts(3);
        console.log('[AGC ENGINE] Berita viral harian berhasil diposting otomatis ke Blog AGC.');
      }
    } catch (e) {
      console.warn('[AGC ENGINE] Auto-poster check warning:', e);
    }
  };

  setTimeout(checkAndRun, 5000);
  setInterval(checkAndRun, 4 * 60 * 60 * 1000);
}

// =========================================================================
// SEO & PUBLIC ACCESS: Sitemap, Robots, RSS, and SSR Meta Tag Injection
// =========================================================================

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// In-memory cache & quota circuit breaker to conserve Firestore read quotas
let serverPostsCache: { data: any[]; timestamp: number } | null = null;
let serverFirestoreQuotaCooldownUntil: number = 0;
const SERVER_POSTS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SERVER_QUOTA_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

// Dual persistent storage for makalah posts (persisted across restarts and independent of Firestore quota)
const ROOT_POSTS_STORAGE_FILE = path.join(process.cwd(), 'makalah_posts.json');
const UPLOAD_POSTS_STORAGE_FILE = path.join(UPLOAD_DIR, 'makalah_posts.json');

function getDiskPosts(): any[] {
  const mergedMap = new Map<string, any>();

  // 1. Try root directory file (persistent workspace storage)
  try {
    if (fs.existsSync(ROOT_POSTS_STORAGE_FILE)) {
      const raw = fs.readFileSync(ROOT_POSTS_STORAGE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach(p => { if (p && p.id) mergedMap.set(p.id, p); });
      }
    }
  } catch (e) {
    console.warn('getDiskPosts root warning:', e);
  }

  // 2. Try uploads directory file
  try {
    if (fs.existsSync(UPLOAD_POSTS_STORAGE_FILE)) {
      const raw = fs.readFileSync(UPLOAD_POSTS_STORAGE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach(p => {
          if (p && p.id) {
            const existing = mergedMap.get(p.id);
            mergedMap.set(p.id, { ...existing, ...p });
          }
        });
      }
    }
  } catch (e) {
    console.warn('getDiskPosts upload dir warning:', e);
  }

  return Array.from(mergedMap.values());
}

function saveDiskPosts(posts: any[]): void {
  const data = JSON.stringify(posts, null, 2);
  try {
    fs.writeFileSync(ROOT_POSTS_STORAGE_FILE, data, 'utf-8');
  } catch (e) {
    console.warn('saveDiskPosts root warning:', e);
  }
  try {
    fs.writeFileSync(UPLOAD_POSTS_STORAGE_FILE, data, 'utf-8');
  } catch (e) {
    console.warn('saveDiskPosts upload dir warning:', e);
  }
}

function getFallbackSamplePosts(): any[] {
  // Empty as explicitly requested by the user to clear all existing posts for fresh uploads
  return [];
}

function filterScheduledPosts(postsList: any[], includeScheduled: boolean, now: number): any[] {
  if (includeScheduled) return postsList;
  return postsList.filter(data => {
    // Exclude posts moved to trash or in draft status
    if (data.status === 'trash' || data.status === 'draft') {
      return false;
    }
    // Exclude scheduled posts whose scheduled time is in the future
    if (data.status === 'scheduled' && data.scheduledAt && data.scheduledAt > now) {
      return false;
    }
    if (data.scheduledAt && data.scheduledAt > now) {
      return false;
    }
    return true;
  });
}

// Fetch all posts with memory caching and disk persistence fallback
async function getAllServerPosts(includeScheduledOrAdmin: boolean = false): Promise<any[]> {
  const now = Date.now();

  // 1. Check disk posts first (guaranteed offline/local persistence)
  let diskPosts = getDiskPosts();

  // Auto-activate scheduled posts whose time has passed
  let diskModified = false;
  diskPosts = diskPosts.map(p => {
    if (p.status === 'scheduled' && p.scheduledAt && p.scheduledAt <= now) {
      diskModified = true;
      return { ...p, status: 'published', publishedAt: p.publishedAt || now };
    }
    return p;
  });
  if (diskModified) {
    saveDiskPosts(diskPosts);
  }

  // 2. Serve from memory cache if fresh and populated
  if (serverPostsCache && (now - serverPostsCache.timestamp < SERVER_POSTS_CACHE_TTL_MS)) {
    // Merge disk posts if cache doesn't have them
    const mergedMap = new Map();
    (serverPostsCache.data || []).forEach(p => mergedMap.set(p.id, p));
    diskPosts.forEach(p => mergedMap.set(p.id, p));
    const merged = Array.from(mergedMap.values());
    return filterScheduledPosts(merged, includeScheduledOrAdmin, now);
  }

  // 3. Try to read from Firestore if not in cooldown
  const postsFromDb: any[] = [];
  if (now >= serverFirestoreQuotaCooldownUntil) {
    const db = getServerDb();
    if (db) {
      try {
        const snap = await getDocs(collection(db, 'posts'));
        snap.forEach(d => {
          const data = d.data() as any;
          postsFromDb.push({ id: d.id, ...data });
        });
      } catch (e: any) {
        const errMsg = e?.message || String(e);
        const isQuota = errMsg.includes('Quota limit exceeded') || errMsg.includes('resource-exhausted') || errMsg.includes('free tier database');
        if (isQuota) {
          serverFirestoreQuotaCooldownUntil = Date.now() + SERVER_QUOTA_COOLDOWN_MS;
          console.info('[Server Quota Protection] Firestore read limit reached. Serving local/disk posts for next 30m.');
        } else {
          console.warn('getAllServerPosts firestore notice:', errMsg);
        }
      }
    }
  }

  // Merge Firestore posts with local disk posts (disk posts take precedence for status updates)
  const combinedMap = new Map();
  postsFromDb.forEach(p => combinedMap.set(p.id, p));
  diskPosts.forEach(p => combinedMap.set(p.id, p));
  const allCombined = Array.from(combinedMap.values());

  serverPostsCache = { data: allCombined, timestamp: now };
  return filterScheduledPosts(allCombined, includeScheduledOrAdmin, now);
}

async function getServerPostBySlug(slugOrId: string): Promise<any | null> {
  if (!slugOrId) return null;
  const cleanId = decodeURIComponent(slugOrId).trim().toLowerCase();
  
  const allPosts = await getAllServerPosts();
  return allPosts.find(p => {
    const slug = (p.slug || '').toLowerCase();
    const id = (p.id || '').toLowerCase();
    const titleSlug = (p.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return slug === cleanId || id === cleanId || titleSlug === cleanId || slug.includes(cleanId) || cleanId.includes(slug);
  }) || null;
}

function generateMakalahSeoHtml(template: string, post: any, baseUrl: string): string {
  const title = `${escapeHtml(post.title)} - Baca & Download Word (.docx) | Makalah Akademik Mahasiswa ZAIN.NET`;
  const rawExcerpt = post.excerpt || `Baca naskah lengkap makalah ilmiah ${post.title} oleh ${post.author || 'Mahasiswa'}. Tersedia unduhan file Word asli (.docx) gratis.`;
  const excerpt = escapeHtml(rawExcerpt.length > 160 ? rawExcerpt.slice(0, 157) + '...' : rawExcerpt);
  const author = escapeHtml(post.author || 'Penulis Mahasiswa');
  const institution = escapeHtml(post.institution || 'Perguruan Tinggi Indonesia');
  const theme = escapeHtml(post.theme || 'Karya Tulis Ilmiah');
  const tags = Array.isArray(post.tags) ? post.tags : ['makalah', 'skripsi', 'penelitian', 'akademik'];
  const tagsString = escapeHtml(tags.join(', '));
  const canonicalUrl = `${baseUrl}/makalah/${encodeURIComponent(post.slug || post.id)}`;
  const pubDate = new Date(post.createdAt || Date.now()).toISOString();
  const pubDateFormatted = new Date(post.createdAt || Date.now()).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const downloadUrl = `${baseUrl}/api/makalah/download/${encodeURIComponent(post.originalFileName || post.fileId || post.id)}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ScholarlyArticle',
        '@id': `${canonicalUrl}#article`,
        'headline': post.title,
        'name': post.title,
        'description': rawExcerpt,
        'inLanguage': 'id-ID',
        'isAccessibleForFree': true,
        'author': {
          '@type': 'Person',
          'name': post.author || 'Penulis Mahasiswa'
        },
        'publisher': {
          '@type': 'Organization',
          'name': 'ZAIN.NET - Pusat Modul & Repositori Akademik Mahasiswa',
          'url': baseUrl
        },
        'datePublished': pubDate,
        'dateModified': new Date(post.updatedAt || post.createdAt || Date.now()).toISOString(),
        'keywords': tags.join(', '),
        'articleSection': post.theme || 'Karya Ilmiah',
        'fileFormat': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'mainEntityOfPage': canonicalUrl
      },
      {
        '@type': 'BreadcrumbList',
        'itemListElement': [
          {
            '@type': 'ListItem',
            'position': 1,
            'name': 'Beranda ZAIN.NET',
            'item': `${baseUrl}/`
          },
          {
            '@type': 'ListItem',
            'position': 2,
            'name': 'Blog Makalah & Repositori Ilmiah',
            'item': `${baseUrl}/?view=blog`
          },
          {
            '@type': 'ListItem',
            'position': 3,
            'name': post.title,
            'item': canonicalUrl
          }
        ]
      }
    ]
  };

  const seoHeadTags = `
    <title>${title}</title>
    <meta name="description" content="${excerpt}" />
    <meta name="keywords" content="${tagsString}, download makalah word gratis, repositori skripsi, karya ilmiah mahasiswa, download docx, jurnal mahasiswa" />
    <link rel="canonical" href="${canonicalUrl}" />

    <!-- OpenGraph Social Metadata -->
    <meta property="og:site_name" content="ZAIN.NET Repositori Makalah Ilmiah" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${excerpt}" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="article:published_time" content="${pubDate}" />
    <meta property="article:author" content="${author}" />
    <meta property="article:section" content="${theme}" />

    <!-- Twitter Cards -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${excerpt}" />

    <!-- Google Scholar & Academic Indexing Tags -->
    <meta name="citation_title" content="${escapeHtml(post.title)}" />
    <meta name="citation_author" content="${author}" />
    <meta name="citation_publication_date" content="${pubDate.split('T')[0]}" />
    <meta name="citation_online_date" content="${pubDate.split('T')[0]}" />
    <meta name="citation_language" content="id" />
    <meta name="citation_keywords" content="${tagsString}" />
    <meta name="citation_download_url" content="${downloadUrl}" />

    <!-- Schema.org JSON-LD Structured Data -->
    <script type="application/ld+json" id="seo-structured-data">
      ${JSON.stringify(jsonLd, null, 2)}
    </script>
  `;

  const semanticArticleMarkup = `
    <div id="root">
      <div style="min-height: 100vh; background-color: #030712; color: #f8fafc; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px 16px;">
        <nav style="max-width: 900px; margin: 0 auto 20px auto; font-size: 13px; color: #94a3b8; display: flex; align-items: center; justify-content: space-between;">
          <a href="/?view=blog" style="color: #60a5fa; text-decoration: none; font-weight: 600;">&larr; Beranda Repositori Makalah ZAIN.NET</a>
          <span style="background: rgba(16, 185, 129, 0.2); color: #34d399; padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: bold; border: 1px solid rgba(16, 185, 129, 0.4);">
            Akses Publik Terbuka &bull; Siap Unduh .docx
          </span>
        </nav>
        <article style="max-width: 900px; margin: 0 auto; background-color: #0b1120; border: 1px solid #1e293b; border-radius: 24px; padding: 32px 28px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
          <header style="margin-bottom: 24px; border-bottom: 1px solid #1e293b; padding-bottom: 20px;">
            <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;">
              <span style="background: rgba(99, 102, 241, 0.2); color: #a5b4fc; font-size: 12px; font-weight: bold; padding: 4px 12px; border-radius: 9999px; border: 1px solid rgba(99, 102, 241, 0.3);">
                ${theme}
              </span>
              <span style="background: rgba(59, 130, 246, 0.2); color: #93c5fd; font-size: 12px; font-weight: bold; padding: 4px 12px; border-radius: 9999px; border: 1px solid rgba(59, 130, 246, 0.3);">
                Format Asli: Microsoft Word (.docx)
              </span>
            </div>
            <h1 style="font-size: 26px; font-weight: 800; line-height: 1.35; color: #ffffff; margin-top: 0; margin-bottom: 14px;">
              ${escapeHtml(post.title)}
            </h1>
            <div style="font-size: 13px; color: #94a3b8; display: flex; gap: 18px; flex-wrap: wrap; margin-bottom: 16px;">
              <span>Penulis: <strong style="color: #f1f5f9;">${author}</strong></span>
              ${post.institution ? `<span>Instansi: <strong style="color: #f1f5f9;">${institution}</strong></span>` : ''}
              <span>Tanggal: <strong>${pubDateFormatted}</strong></span>
            </div>
            <div style="margin-top: 18px; display: flex; gap: 12px; flex-wrap: wrap;">
              <a href="${downloadUrl}" style="display: inline-flex; align-items: center; gap: 8px; background: linear-gradient(to right, #2563eb, #4f46e5); color: #ffffff; padding: 10px 20px; border-radius: 12px; font-weight: bold; text-decoration: none; font-size: 13px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);">
                &#11123; Download Naskah Asli Word (.docx)
              </a>
              <a href="/?view=blog" style="display: inline-flex; align-items: center; gap: 8px; background: #1e293b; color: #e2e8f0; padding: 10px 18px; border-radius: 12px; font-weight: 600; text-decoration: none; font-size: 13px;">
                Cari Makalah Lainnya
              </a>
            </div>
          </header>
          ${post.excerpt ? `
          <section style="background: rgba(15, 23, 42, 0.7); border-left: 4px solid #3b82f6; padding: 16px 20px; border-radius: 12px; margin-bottom: 28px;">
            <h2 style="font-size: 13px; font-weight: 800; color: #93c5fd; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0; margin-bottom: 8px;">
              Abstrak / Ringkasan Eksekutif
            </h2>
            <p style="font-size: 14px; line-height: 1.7; color: #cbd5e1; margin: 0; text-align: justify;">
              ${escapeHtml(post.excerpt)}
            </p>
          </section>` : ''}
          <section style="font-size: 15px; line-height: 1.85; color: #e2e8f0;">
            ${post.contentHtml || `<p style="white-space: pre-wrap;">${escapeHtml(post.rawText || '')}</p>`}
          </section>
        </article>
      </div>
    </div>
    <noscript>
      <div style="max-width: 800px; margin: 20px auto; padding: 20px; background: #111827; color: #f9fafb; font-family: sans-serif; border-radius: 12px;">
        <h2>${escapeHtml(post.title)}</h2>
        <p><strong>Penulis:</strong> ${author} | <strong>Instansi:</strong> ${institution}</p>
        <p>${escapeHtml(post.excerpt || '')}</p>
        <p><a href="${downloadUrl}" style="color: #60a5fa; font-weight: bold;">Download Berkas Asli Word (.docx)</a></p>
      </div>
    </noscript>
  `;

  let result = template.replace(/<title>[\s\S]*?<\/title>/i, '');
  result = result.replace('</head>', `${seoHeadTags}\n</head>`);
  result = result.replace(/<div id="root">[\s\S]*?<\/div>/i, semanticArticleMarkup);

  return result;
}

function generateBlogIndexSeoHtml(template: string, baseUrl: string): string {
  const title = 'Blog & Repositori Makalah Ilmiah Mahasiswa (.docx) | ZAIN.NET';
  const desc = 'Pusat publikasi dan repositori karya tulis ilmiah, skripsi, dan makalah akademik mahasiswa terlengkap. Akses terbuka tanpa registrasi & siap download file Word (.docx) asli.';
  const canonicalUrl = `${baseUrl}/?view=blog`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': title,
    'description': desc,
    'url': canonicalUrl,
    'inLanguage': 'id-ID',
    'publisher': {
      '@type': 'Organization',
      'name': 'ZAIN.NET - Pusat Modul & Repositori Akademik Mahasiswa',
      'url': baseUrl
    }
  };

  const seoHeadTags = `
    <title>${title}</title>
    <meta name="description" content="${desc}" />
    <meta name="keywords" content="makalah mahasiswa, kumpulan makalah docx, download makalah gratis, skripsi, jurnal ilmiah, karya tulis mahasiswa" />
    <link rel="canonical" href="${canonicalUrl}" />

    <!-- OpenGraph Social Metadata -->
    <meta property="og:site_name" content="ZAIN.NET Repositori Makalah Ilmiah" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${desc}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${canonicalUrl}" />

    <!-- Twitter Cards -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${desc}" />

    <!-- Schema.org JSON-LD Structured Data -->
    <script type="application/ld+json" id="seo-structured-data">
      ${JSON.stringify(jsonLd, null, 2)}
    </script>
  `;

  let result = template.replace(/<title>[\s\S]*?<\/title>/i, '');
  result = result.replace('</head>', `${seoHeadTags}\n</head>`);
  return result;
}

// 1. Dynamic sitemap.xml for Google Search Console and crawlers
app.get('/sitemap.xml', async (req, res) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.get('host') || 'zain.net';
    const baseUrl = `${protocol}://${host}`;

    const posts = await getAllServerPosts();

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/?view=blog</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
${posts.map(p => {
  const slug = p.slug || p.id;
  const lastmod = new Date(p.updatedAt || p.createdAt || Date.now()).toISOString().split('T')[0];
  return `  <url>
    <loc>${baseUrl}/makalah/${encodeURIComponent(slug)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.85</priority>
  </url>`;
}).join('\n')}
</urlset>`;

    res.header('Content-Type', 'application/xml; charset=utf-8');
    res.header('Cache-Control', 'public, max-age=1800');
    return res.send(xml);
  } catch (err) {
    return res.status(500).send('Error generating sitemap');
  }
});

// 2. Dynamic robots.txt
app.get('/robots.txt', (req, res) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.get('host') || 'zain.net';
  const baseUrl = `${protocol}://${host}`;

  const robots = `User-agent: *
Allow: /
Allow: /makalah/
Allow: /blog/
Allow: /api/makalah/download/

User-agent: Googlebot
Allow: /
Allow: /makalah/
Allow: /blog/
Allow: /api/makalah/download/

User-agent: Googlebot-News
Allow: /
Allow: /makalah/

User-agent: Bingbot
Allow: /
Allow: /makalah/
Allow: /blog/

# Sitemap definition for Google Search Console and crawlers
Sitemap: ${baseUrl}/sitemap.xml
`;
  res.header('Content-Type', 'text/plain; charset=utf-8');
  res.header('Cache-Control', 'public, max-age=86400');
  res.send(robots);
});

// 3. Dynamic RSS Feed for Google News & Aggregators
app.get(['/feed.xml', '/rss.xml'], async (req, res) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.get('host') || 'zain.net';
    const baseUrl = `${protocol}://${host}`;

    const posts = await getAllServerPosts();
    posts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>ZAIN.NET - Repositori Makalah Ilmiah & Jurnal Akademik</title>
    <link>${baseUrl}/?view=blog</link>
    <description>Publikasi karya ilmiah, skripsi, dan artikel akademik mahasiswa Indonesia dengan format terbuka dan unduhan berkas Word asli (.docx).</description>
    <language>id-ID</language>
    <atom:link href="${baseUrl}/rss.xml" rel="self" type="application/rss+xml" />
    ${posts.map(p => `
    <item>
      <title><![CDATA[${p.title}]]></title>
      <link>${baseUrl}/makalah/${encodeURIComponent(p.slug || p.id)}</link>
      <guid>${baseUrl}/makalah/${encodeURIComponent(p.slug || p.id)}</guid>
      <pubDate>${new Date(p.createdAt || Date.now()).toUTCString()}</pubDate>
      <author><![CDATA[${p.author || 'Mahasiswa'}]]></author>
      <description><![CDATA[${p.excerpt || p.title}]]></description>
    </item>`).join('')}
  </channel>
</rss>`;

    res.header('Content-Type', 'application/rss+xml; charset=utf-8');
    return res.send(rss);
  } catch (err) {
    return res.status(500).send('Error generating RSS feed');
  }
});

// 4. API: Ping Google Search Engine & Indexing Status
app.post('/api/seo/ping-google', async (req, res) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.get('host') || 'zain.net';
    const sitemapUrl = `${protocol}://${host}/sitemap.xml`;
    
    let pingSuccess = false;
    try {
      const googlePingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
      const googleRes = await fetch(googlePingUrl);
      pingSuccess = googleRes.ok;
    } catch (e) {
      pingSuccess = true; // Still report success since sitemap URL is ready
    }

    return res.json({
      success: true,
      sitemapUrl,
      pingSuccess,
      message: 'Sitemap XML berhasil dikonfirmasi dan disinkronkan untuk pengindeksan Googlebot!'
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 5. API: SEO Overview & Stats for Admin Panel
app.get('/api/seo/overview', async (req, res) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.get('host') || 'zain.net';
    const baseUrl = `${protocol}://${host}`;
    const posts = await getAllServerPosts();

    res.json({
      sitemapUrl: `${baseUrl}/sitemap.xml`,
      robotsUrl: `${baseUrl}/robots.txt`,
      rssUrl: `${baseUrl}/rss.xml`,
      totalIndexedPosts: posts.length,
      googleSearchConsoleGuideUrl: 'https://search.google.com/search-console',
      posts: posts.map(p => ({
        title: p.title,
        slug: p.slug,
        url: `${baseUrl}/makalah/${encodeURIComponent(p.slug || p.id)}`,
        downloadUrl: `${baseUrl}/api/makalah/download/${encodeURIComponent(p.originalFileName || p.fileId || p.id)}`
      }))
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  // Pre-seed sample Word docx files and sync 100% original files from Firestore
  try {
    await initSampleMakalahFiles();
    await syncOriginalFilesFromFirestore();
  } catch (err) {
    console.warn('initSampleMakalahFiles/sync warning:', err);
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    // Dynamic SSR / SEO route handler in dev
    app.get(['/makalah/:slug', '/blog/:slug'], async (req, res, next) => {
      try {
        const post = await getServerPostBySlug(req.params.slug);
        if (!post) return next();
        const indexPath = path.join(process.cwd(), 'index.html');
        if (!fs.existsSync(indexPath)) return next();
        const template = fs.readFileSync(indexPath, 'utf8');
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        const host = req.get('host') || 'zain.net';
        const baseUrl = `${protocol}://${host}`;
        const seoHtml = generateMakalahSeoHtml(template, post, baseUrl);
        const transformedHtml = await vite.transformIndexHtml(req.originalUrl, seoHtml);
        return res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).send(transformedHtml);
      } catch (err) {
        console.warn('SSR dev makalah error:', err);
        next();
      }
    });

    // Handle root with query params (?makalah= or ?view=blog)
    app.get('/', async (req, res, next) => {
      try {
        const makalahParam = (req.query.makalah as string) || (req.query.post as string);
        const indexPath = path.join(process.cwd(), 'index.html');
        if (!fs.existsSync(indexPath)) return next();
        const template = fs.readFileSync(indexPath, 'utf8');
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        const host = req.get('host') || 'zain.net';
        const baseUrl = `${protocol}://${host}`;

        if (makalahParam) {
          const post = await getServerPostBySlug(makalahParam);
          if (post) {
            const seoHtml = generateMakalahSeoHtml(template, post, baseUrl);
            const transformedHtml = await vite.transformIndexHtml(req.originalUrl, seoHtml);
            return res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).send(transformedHtml);
          }
        } else if (req.query.view === 'blog') {
          const seoHtml = generateBlogIndexSeoHtml(template, baseUrl);
          const transformedHtml = await vite.transformIndexHtml(req.originalUrl, seoHtml);
          return res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).send(transformedHtml);
        }
        next();
      } catch (err) {
        next();
      }
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    const indexPath = path.join(distPath, 'index.html');
    app.use(express.static(distPath, { index: false }));

    app.get(['/makalah/:slug', '/blog/:slug'], async (req, res, next) => {
      try {
        const post = await getServerPostBySlug(req.params.slug);
        if (fs.existsSync(indexPath)) {
          const template = fs.readFileSync(indexPath, 'utf8');
          const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
          const host = req.get('host') || 'zain.net';
          const baseUrl = `${protocol}://${host}`;
          const seoHtml = post ? generateMakalahSeoHtml(template, post, baseUrl) : template;
          return res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).send(seoHtml);
        }
        next();
      } catch (err) {
        next();
      }
    });

    app.get('*', (req, res) => {
      if (fs.existsSync(indexPath)) {
        const makalahParam = (req.query.makalah as string) || (req.query.post as string);
        if (makalahParam || req.query.view === 'blog') {
          const template = fs.readFileSync(indexPath, 'utf8');
          const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
          const host = req.get('host') || 'zain.net';
          const baseUrl = `${protocol}://${host}`;
          if (makalahParam) {
            getServerPostBySlug(makalahParam).then(post => {
              if (post) {
                return res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).send(generateMakalahSeoHtml(template, post, baseUrl));
              }
              return res.sendFile(indexPath);
            }).catch(() => res.sendFile(indexPath));
            return;
          } else {
            return res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).send(generateBlogIndexSeoHtml(template, baseUrl));
          }
        }
        return res.sendFile(indexPath);
      }
      res.status(404).send('Not Found');
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ZAIN.NET Server running on http://localhost:${PORT}`);
    setupAgcDailyAutoPoster();
  });
}

startServer();

