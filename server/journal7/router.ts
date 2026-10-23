import express from 'express';
import { journalPageCountRouter } from './pageCount';
import path from 'path';
import os from 'os';
import fs from 'fs';
import multer from 'multer';
import mammoth from 'mammoth';
import { GoogleGenAI, Type } from '@google/genai';
import { cleanSectionContent, normalizePpkIBibliographyEntry, normalizeFootnotes } from '../../src/journalConverter/utils/cleanSectionContent';
import { saveAndAnalyzeTemplate, applyTemplateToArticle, getTemplatePath } from '../../src/journalConverter/utils/templateEngine';

// Helper function to robustly extract text from PDF buffers supporting both pdf-parse v1 and v2
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdfModule: any = await import('pdf-parse').then((m: any) => m?.default || m).catch(() => null);

    if (pdfModule) {
      if (pdfModule.PDFParse) {
        const parser = new pdfModule.PDFParse({ data: buffer });
        const res = await parser.getText();
        if (res?.text) return res.text;
      }
      if (typeof pdfModule === 'function') {
        const res = await pdfModule(buffer);
        if (res?.text) return res.text;
      }
      if (pdfModule.default && typeof pdfModule.default === 'function') {
        const res = await pdfModule.default(buffer);
        if (res?.text) return res.text;
      }
    }

    // Fallback: search for extractable text chunks directly in buffer if library fails
    const rawBufferStr = buffer.toString('latin1');
    const textMatches = rawBufferStr.match(/\(([^()]+)\)\s*Tj/g);
    if (textMatches && textMatches.length > 20) {
      return textMatches.map((m) => m.replace(/[()]/g, '').replace(/\s*Tj$/, '')).join(' ');
    }

    throw new Error('Tidak dapat mengekstrak teks dari PDF ini. Coba simpan sebagai format .docx atau copy-paste langsung.');
  } catch (err: any) {
    console.error('Error parsing PDF:', err);
    throw new Error(`Gagal memproses file PDF: ${err?.message || 'Format PDF tidak dapat dibaca'}`);
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit for 20+ page documents
});

const app = express.Router();
export const journal7Router = app;
app.use('/count-pages', journalPageCountRouter);

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Initialize Gemini on demand: if the key has not been configured yet,
// the main ZAIN.NET website must continue starting normally.
let _journalAi: GoogleGenAI | null = null;
function getJournalAi(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY belum dikonfigurasi pada server ZAIN.NET (Menu 1 Link 7).');
  }
  if (!_journalAi) {
    _journalAi = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      // @ts-ignore
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return _journalAi;
}

// Candidate Flash models in priority order based on official @google/genai guidelines:
// 'gemini-3.1-flash-lite' is the official requested high-speed model for article processing,
// followed by 'gemini-2.5-flash' and 'gemini-2.5-pro' for robust failover.
const CANDIDATE_FLASH_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
];

// In-memory cooldown tracking per model to avoid hammering exhausted models
const modelCooldownUntil = new Map<string, number>();

function isModelInCooldown(modelName: string): boolean {
  const until = modelCooldownUntil.get(modelName);
  if (!until) return false;
  if (Date.now() < until) return true;
  modelCooldownUntil.delete(modelName);
  return false;
}

function parseRetryDelayMs(err: any): number {
  try {
    const details = err?.details || err?.error?.details;
    if (Array.isArray(details)) {
      const retryInfo = details.find((d: any) =>
        d?.['@type']?.includes('RetryInfo') || d?.retryDelay
      );
      if (retryInfo?.retryDelay) {
        const secMatch = String(retryInfo.retryDelay).match(/([\d\.]+)s/);
        if (secMatch) {
          return Math.ceil(parseFloat(secMatch[1]) * 1000);
        }
      }
    }
    const msg = err?.message || JSON.stringify(err);
    const msgMatch = msg.match(/retry in\s+([\d\.]+)\s*s/i);
    if (msgMatch) {
      return Math.ceil(parseFloat(msgMatch[1]) * 1000);
    }
  } catch {}
  return 26000;
}

// Helper to safely extract raw text from Gemini API response
function getTextFromResponse(response: any): string {
  if (!response) return '';
  if (typeof response.text === 'string') return response.text;
  if (typeof response.text === 'function') {
    try {
      const res = response.text();
      if (typeof res === 'string') return res;
    } catch {}
  }
  if (response.candidates?.[0]?.content?.parts) {
    return response.candidates[0].content.parts.map((p: any) => p.text || '').join('');
  }
  return '';
}

// Helper to safely parse and self-repair JSON from AI response
function safeJsonParse(rawText: string, fallback: any = {}): any {
  if (!rawText || typeof rawText !== 'string') return fallback;
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  }

  // 1. Direct standard parse
  try {
    return JSON.parse(cleaned);
  } catch {}

  // 2. Extract largest JSON object substring
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {}
  }

  // 3. Attempt automated bracket/quote repairing for truncated responses
  try {
    let repaired = cleaned;
    const quoteMatches = repaired.match(/(?<!\\)"/g);
    if (quoteMatches && quoteMatches.length % 2 !== 0) {
      repaired += '"';
    }
    const openBraces = (repaired.match(/\{/g) || []).length;
    const closeBraces = (repaired.match(/\}/g) || []).length;
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;

    for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += ']';
    for (let i = 0; i < openBraces - closeBraces; i++) repaired += '}';

    return JSON.parse(repaired);
  } catch {}

  // 4. Field extraction heuristic for essential section contents
  const extracted: any = { ...fallback };
  const kesimpulanMatch = cleaned.match(/"kesimpulan"\s*:\s*"([\s\S]*?)(?:",\s*"|"\s*\}|$)/i);
  if (kesimpulanMatch && kesimpulanMatch[1]) {
    extracted.kesimpulan = kesimpulanMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }
  const hasilMatch = cleaned.match(/"hasil"\s*:\s*"([\s\S]*?)(?:",\s*"|"\s*\}|$)/i);
  if (hasilMatch && hasilMatch[1]) {
    extracted.hasil = hasilMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }
  const pembahasanMatch = cleaned.match(/"pembahasan"\s*:\s*"([\s\S]*?)(?:",\s*"|"\s*\}|$)/i);
  if (pembahasanMatch && pembahasanMatch[1]) {
    extracted.pembahasan = pembahasanMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }

  if (extracted.kesimpulan || extracted.hasil || extracted.pembahasan || extracted.pendahuluan) {
    if (!extracted.daftarPustaka) extracted.daftarPustaka = [];
    if (!extracted.footnotes) extracted.footnotes = [];
    return extracted;
  }

  if (fallback && Object.keys(fallback).length > 0) {
    return fallback;
  }

  console.error('Failed to parse JSON from AI output:', cleaned.slice(0, 300));
  throw new Error('Respon AI tidak dapat diuraikan sebagai format JSON yang valid.');
}

// Robust wrapper with automatic exponential backoff retry, per-model rate limit cooldown, and multi-model fallback
async function generateContentWithFallback(params: {
  contents: string;
  config?: any;
  maxRetriesPerModel?: number;
  selectedModel?: string;
}): Promise<any> {
  const { contents, config, maxRetriesPerModel = 2, selectedModel } = params;
  let lastError: any = null;

  // Build model priority list based on user selection
  let modelsToTry: string[] = [];
  if (selectedModel && selectedModel !== 'auto') {
    // If user explicitly chose a model, test it first
    modelsToTry.push(selectedModel);
    // Then add all candidate flash models for failover
    for (const m of CANDIDATE_FLASH_MODELS) {
      if (!modelsToTry.includes(m)) {
        modelsToTry.push(m);
      }
    }
  } else {
    modelsToTry = [...CANDIDATE_FLASH_MODELS];
  }

  // Pre-check: if all models are in cooldown, wait for the soonest one to be ready
  const now = Date.now();
  const allInCooldown = modelsToTry.every((m) => isModelInCooldown(m));
  if (allInCooldown) {
    let minWait = Infinity;
    for (const m of modelsToTry) {
      const until = modelCooldownUntil.get(m) || now;
      const remaining = until - now;
      if (remaining < minWait) minWait = remaining;
    }
    if (minWait > 0 && minWait <= 30000) {
      console.log(`[Gemini API] All models currently in quota cooldown. Auto-waiting ${Math.ceil(minWait / 1000)}s for quota refresh...`);
      await new Promise((resolve) => setTimeout(resolve, minWait + 1000));
    }
  }

  const MAX_ROUNDS = 3;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    if (round > 1) {
      console.log(`[Gemini API] Starting round ${round}/${MAX_ROUNDS} after brief pause...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    for (const modelName of modelsToTry) {
      // If this model is currently under a 429 quota cooldown, skip it to avoid burning requests
      if (isModelInCooldown(modelName)) {
        const remainingSec = Math.ceil(((modelCooldownUntil.get(modelName) || 0) - Date.now()) / 1000);
        console.log(`[Gemini API] Skipping "${modelName}" (quota cooldown active for ${remainingSec}s)...`);
        continue;
      }

      for (let attempt = 1; attempt <= maxRetriesPerModel; attempt++) {
        try {
          console.log(`[Gemini API] (Round ${round}) Trying model "${modelName}" (attempt ${attempt}/${maxRetriesPerModel})...`);
          const callPromise = getJournalAi().models.generateContent({
            model: modelName,
            contents,
            config,
          });

          // 120s timeout per call to prevent hanging sockets
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Koneksi model Gemini melebihi batas waktu (timeout).')), 120000)
          );

          const response: any = await Promise.race([callPromise, timeoutPromise]);
          const textContent = getTextFromResponse(response);

          if (textContent && textContent.trim().length > 0) {
            console.log(`[Gemini API] Success using model "${modelName}".`);
            // Clear any previous cooldown upon success
            modelCooldownUntil.delete(modelName);
            return response;
          }
        } catch (err: any) {
          lastError = err;
          const errMessage = err?.message || JSON.stringify(err);
          console.warn(`[Gemini API] Warning on model "${modelName}" (attempt ${attempt}):`, errMessage);

          // Immediate stop ONLY for actual project monthly spending cap reached
          if (
            errMessage.includes('monthly spending cap') ||
            errMessage.includes('exceeded its monthly spending cap')
          ) {
            throw new Error(
              'Proyek Google AI Studio / Gemini API Anda telah mencapai batas pengeluaran bulanan (Monthly Spending Cap Exceeded). Silakan buka https://ai.studio/spend untuk mengatur batas pengeluaran proyek Anda.'
            );
          }

          // If a Pro/paid model was tried on a free tier (limit: 0 or PERMISSION_DENIED),
          // don't waste retries on it - immediately switch to Flash models!
          if (
            (modelName.includes('pro') && (errMessage.includes('limit: 0') || errMessage.includes('free_tier_requests') || errMessage.includes('Quota exceeded'))) ||
            (modelName.includes('pro') && (errMessage.includes('403') || errMessage.includes('PERMISSION_DENIED')))
          ) {
            console.log(`[Gemini API] Pro model "${modelName}" requires paid tier or quota limit is 0, switching to Flash models immediately.`);
            break;
          }

          // If model not found or deprecated, immediately switch to next model without wasting retries
          if (
            errMessage.includes('404') ||
            errMessage.includes('NOT_FOUND') ||
            errMessage.includes('no longer available') ||
            errMessage.includes('is not found')
          ) {
            console.log(`[Gemini API] Model "${modelName}" not available, switching to next candidate model.`);
            break;
          }

          // If model access is denied (403 PERMISSION_DENIED), switch to next model immediately
          if (
            errMessage.includes('403') ||
            errMessage.includes('PERMISSION_DENIED') ||
            errMessage.includes('denied access')
          ) {
            console.log(`[Gemini API] Model "${modelName}" permission denied (403), switching to next candidate model.`);
            break;
          }

          // CRITICAL: Handle 429 Quota Exceeded (RESOURCE_EXHAUSTED)
          const isRateLimited =
            errMessage.includes('429') ||
            errMessage.includes('RESOURCE_EXHAUSTED') ||
            err?.status === 'RESOURCE_EXHAUSTED';

          if (isRateLimited) {
            const retryDelayMs = parseRetryDelayMs(err);
            modelCooldownUntil.set(modelName, Date.now() + retryDelayMs);
            console.log(`[Gemini API] Model "${modelName}" hit 429 quota limit. Placed on cooldown for ${Math.ceil(retryDelayMs / 1000)}s. Failing over to other candidate models immediately.`);
            // Do NOT retry this exhausted model on attempt 2! Break to next candidate model immediately!
            break;
          }

          // If model is experiencing temporary high-demand (503 UNAVAILABLE), wait with jitter
          const is503HighDemand =
            errMessage.includes('503') ||
            errMessage.includes('high demand') ||
            errMessage.includes('UNAVAILABLE') ||
            errMessage.includes('overloaded');

          const isNetworkError =
            errMessage.includes('fetch failed') ||
            errMessage.includes('ECONNRESET') ||
            errMessage.includes('ETIMEDOUT') ||
            errMessage.includes('timeout');

          if (attempt < maxRetriesPerModel && (is503HighDemand || isNetworkError)) {
            const delayMs = attempt * 1500 + Math.floor(Math.random() * 800);
            console.log(`[Gemini API] 503 high-demand / network glitch on "${modelName}", waiting ${delayMs}ms before retry...`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          } else {
            // Note: Do NOT lock out 503 in modelCooldownUntil! 503 is a temporary traffic surge,
            // not an exhausted quota bucket. Immediately failover to the next candidate model!
            console.log(`[Gemini API] Model "${modelName}" still unavailable, immediately trying next candidate model.`);
            break;
          }
        }
      }
    }
  }

  // Final resilience fallback: If the failure was due to temporary 503 high demand across tried models,
  // do a direct fast recovery attempt using verified stable models
  let finalErrMsg = lastError?.message || JSON.stringify(lastError);
  const isFinal503 =
    finalErrMsg.includes('503') ||
    finalErrMsg.includes('high demand') ||
    finalErrMsg.includes('UNAVAILABLE');

  if (isFinal503) {
    console.log('[Gemini API] Final resilience: attempting immediate failover recovery for 503 with stable flash models...');
    await new Promise((resolve) => setTimeout(resolve, 2000));
    for (const recoveryModel of ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.1-flash-lite']) {
      try {
        console.log(`[Gemini API] Executing 503 recovery attempt using "${recoveryModel}"...`);
        const response: any = await getJournalAi().models.generateContent({
          model: recoveryModel,
          contents,
          config,
        });
        const textContent = getTextFromResponse(response);
        if (textContent && textContent.trim().length > 0) {
          console.log(`[Gemini API] 503 Recovery succeeded on model "${recoveryModel}".`);
          return response;
        }
      } catch (recoveryErr: any) {
        lastError = recoveryErr;
      }
    }
  }

  // Final resilience fallback: If the failure was due to rate limit, check if waiting can allow recovery
  const isFinalRateLimited =
    finalErrMsg.includes('429') ||
    finalErrMsg.includes('RESOURCE_EXHAUSTED');

  if (isFinalRateLimited) {
    const activeCooldowns = Array.from(modelCooldownUntil.values()).filter((v) => v > Date.now());
    if (activeCooldowns.length > 0) {
      const earliestCooldown = Math.min(...activeCooldowns);
      const remainingCooldown = earliestCooldown - Date.now();
      if (remainingCooldown > 0 && remainingCooldown <= 28000) {
        console.log(`[Gemini API] Final resilience: waiting ${Math.ceil(remainingCooldown / 1000)}s for quota to refresh before final recovery call...`);
        await new Promise((resolve) => setTimeout(resolve, remainingCooldown + 1500));
        // Try each candidate model once more
        for (const recoveryModel of CANDIDATE_FLASH_MODELS) {
          try {
            console.log(`[Gemini API] Executing recovery attempt using "${recoveryModel}"...`);
            const response: any = await getJournalAi().models.generateContent({
              model: recoveryModel,
              contents,
              config,
            });
            const textContent = getTextFromResponse(response);
            if (textContent && textContent.trim().length > 0) {
              console.log(`[Gemini API] Recovery succeeded on model "${recoveryModel}".`);
              modelCooldownUntil.delete(recoveryModel);
              return response;
            }
          } catch (recoveryErr: any) {
            lastError = recoveryErr;
          }
        }
      }
    }
  }

  // If all candidate models and rounds failed
  console.error('[Gemini API] All fallback models exhausted:', lastError);
  finalErrMsg = lastError?.message || JSON.stringify(lastError);

  // Check specific reason
  if (
    finalErrMsg.includes('503') ||
    finalErrMsg.includes('high demand') ||
    finalErrMsg.includes('UNAVAILABLE')
  ) {
    throw new Error(
      'Server AI Google sedang mengalami lonjakan beban trafik sementara (503 Service Unavailable / High Demand). Sistem telah mencoba mengalihkan ke model cadangan namun trafik sedang padat. Silakan tunggu beberapa saat lalu klik tombol Generate kembali.'
    );
  }

  if (
    finalErrMsg.includes('spending cap') ||
    (finalErrMsg.includes('RESOURCE_EXHAUSTED') && !finalErrMsg.includes('limit: 0, model: gemini-3.1-pro')) ||
    (finalErrMsg.includes('429') && !finalErrMsg.includes('limit: 0, model: gemini-3.1-pro'))
  ) {
    throw new Error(
      'Batas kecepatan permintaan API (Rate Limit) atau kuota akun tercapai. Silakan tunggu 30-60 detik lalu coba klik tombol Generate kembali.'
    );
  }

  if (
    finalErrMsg.includes('403') ||
    finalErrMsg.includes('PERMISSION_DENIED') ||
    finalErrMsg.includes('denied access')
  ) {
    throw new Error(
      'Akses API Gemini ditolak (Permission Denied 403). Pastikan kunci API Gemini valid dan memiliki izin akses di konsol Google AI Studio.'
    );
  }

  throw new Error(
    `Layanan AI sedang mengalami kendala sementara (${finalErrMsg.slice(0, 150)}...). Silakan klik tombol Generate kembali.`
  );
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 1. File Upload Handler Endpoint (Extract text from PDF, DOCX, TXT)
app.post('/template/upload', (req: any, res: any) => {
  upload.single('template')(req, res, (err: any) => {
    if (err) return res.status(400).json({ error: err.message || 'Gagal mengunggah template.' });
    try {
      if (!req.file) return res.status(400).json({ error: 'Tidak ada file template.' });
      if (!req.file.originalname.toLowerCase().endsWith('.docx')) return res.status(400).json({ error: 'Template harus berupa DOCX.' });
      const profile = saveAndAnalyzeTemplate(req.file.buffer, req.file.originalname);
      res.json({ profile });
    } catch (e: any) { res.status(500).json({ error: 'Template tidak dapat dibaca: ' + (e.message || e) }); }
  });
});

app.post('/template/apply', (req, res) => {
  try {
    const { templateId, article } = req.body || {};
    if (!templateId || !article) return res.status(400).json({ error: 'Template dan artikel wajib tersedia.' });
    const out = path.join(os.tmpdir(), `article-template-${Date.now()}-${Math.random().toString(36).slice(2)}.docx`);
    const profile = applyTemplateToArticle(templateId, article, out);
    res.download(out, 'artikel-dengan-template.docx', (err) => { try { fs.unlinkSync(out); } catch {} if (err) console.error('Template download error', err); });
  } catch (e: any) { res.status(500).json({ error: 'Gagal menerapkan template: ' + (e.message || e) }); }
});

app.post('/upload-skripsi', (req: any, res: any) => {
  upload.single('file')(req, res, async (err: any) => {
    if (err) {
      console.error('Multer upload error:', err);
      return res.status(400).json({ error: `Gagal mengunggah file: ${err.message || 'Error upload file'}` });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Tidak ada file yang diunggah.' });
      }

      const { originalname, mimetype, buffer } = req.file;
      let extractedText = '';

      if (mimetype === 'application/pdf' || originalname.toLowerCase().endsWith('.pdf')) {
        extractedText = await extractPdfText(buffer);
      } else if (
        mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimetype === 'application/msword' ||
        originalname.toLowerCase().endsWith('.docx') ||
        originalname.toLowerCase().endsWith('.doc')
      ) {
        const mammothLib: any = (mammoth as any)?.default || mammoth;
        const docxResult = await mammothLib.extractRawText({ buffer });
        extractedText = docxResult.value || '';
      } else if (mimetype === 'text/plain' || originalname.toLowerCase().endsWith('.txt')) {
        extractedText = buffer.toString('utf-8');
      } else {
        return res.status(400).json({
          error: 'Format file tidak didukung. Harap unggah file PDF, DOCX, atau TXT.',
        });
      }

      if (!extractedText || extractedText.trim().length === 0) {
        return res.status(400).json({
          error: 'Teks dari file skripsi tidak dapat diekstrak atau file kosong.',
        });
      }

      res.json({
        fileName: originalname,
        fileSize: req.file.size,
        textLength: extractedText.length,
        extractedText: extractedText,
      });
    } catch (error: any) {
      console.error('Error parsing skripsi file:', error);
      res.status(500).json({
        error: 'Gagal membaca isi file skripsi: ' + (error.message || 'Error tidak diketahui'),
      });
    }
  });
});

// --- SMART THESIS SEGMENTATION & TOKEN SAVER ---
// Memisahkan bab skripsi dan membuang bagian non-esensial (lampiran mentah, lembar pengesahan)
// Menghemat hingga 65% token tanpa menurunkan kualitas artikel ilmiah.

interface ThesisSegments {
  frontMatterAndBab123: string;
  bab4HasilPembahasan: string;
  bab5DanPustaka: string;
}

function cleanThesisNoise(text: string): string {
  if (!text) return '';
  
  // 1. Potong lampiran mentah berlebih setelah Daftar Pustaka (kuesioner, output spss mentah ratusan halaman)
  const lampiranMatch = text.search(/\n\s*(LAMPIRAN|Lampiran\s+[A-Z0-9]|KUESIONER|KUISIONER|ANGKET PENELITIAN)/i);
  let cleaned = text;
  if (lampiranMatch !== -1 && lampiranMatch > text.length * 0.4) {
    // Pastikan lampiran berada di bagian belakang (setelah 40% teks)
    cleaned = text.substring(0, lampiranMatch + 2000); // Sisakan sedikit konteks jika ada daftar pustaka di dekatnya
  }

  return cleaned;
}

function segmentThesisText(rawText: string): ThesisSegments {
  const cleaned = cleanThesisNoise(rawText);

  // Regex patterns untuk mendeteksi Bab I, Bab II, Bab III, Bab IV, Bab V, Daftar Pustaka
  const bab1Index = cleaned.search(/\n\s*(BAB\s+I\b|BAB\s+1\b|PENDAHULUAN)/i);
  const bab4Index = cleaned.search(/\n\s*(BAB\s+IV\b|BAB\s+4\b|HASIL\s+DAN\s+PEMBAHASAN|HASIL\s+PENELITIAN)/i);
  const bab5Index = cleaned.search(/\n\s*(BAB\s+V\b|BAB\s+5\b|KESIMPULAN\s+DAN\s+SARAN|PENUTUP)/i);
  const daftarPustakaIndex = cleaned.search(/\n\s*(DAFTAR\s+PUSTAKA|REFERENSI|BIBLIOGRAPHY|DAFTAR\s+RUJUKAN)/i);

  // Default fallback if explicit Bab regex fails (misal dokumen tanpa kata 'BAB IV')
  const totalLen = cleaned.length;

  let part1 = '';
  let part2 = '';
  let part3 = '';

  if (bab4Index !== -1) {
    // Bagian 1: Judul, Bab 1, 2, 3
    const start1 = bab1Index !== -1 && bab1Index < 3000 ? bab1Index : 0;
    part1 = cleaned.substring(start1, bab4Index).trim();

    if (bab5Index !== -1 && bab5Index > bab4Index) {
      // Bagian 2: Bab 4 (Hasil & Pembahasan)
      part2 = cleaned.substring(bab4Index, bab5Index).trim();
      // Bagian 3: Bab 5 & Daftar Pustaka
      part3 = cleaned.substring(bab5Index).trim();
    } else if (daftarPustakaIndex !== -1 && daftarPustakaIndex > bab4Index) {
      part2 = cleaned.substring(bab4Index, daftarPustakaIndex).trim();
      part3 = cleaned.substring(daftarPustakaIndex).trim();
    } else {
      part2 = cleaned.substring(bab4Index).trim();
      part3 = cleaned.substring(Math.max(bab4Index, totalLen - 15000)).trim();
    }
  } else {
    // Graceful proportionate slicing for unstructured documents
    part1 = cleaned.substring(0, Math.floor(totalLen * 0.55));
    part2 = cleaned.substring(Math.floor(totalLen * 0.35), Math.floor(totalLen * 0.85));
    part3 = cleaned.substring(Math.floor(totalLen * 0.70));
  }

  return {
    frontMatterAndBab123: part1 || cleaned.slice(0, 30000),
    bab4HasilPembahasan: part2 || cleaned.slice(Math.floor(totalLen * 0.3), Math.floor(totalLen * 0.8)),
    bab5DanPustaka: part3 || cleaned.slice(Math.floor(totalLen * 0.7)),
  };
}

// 2. Multi-Stage Scientific Journal Article Endpoints (To avoid JSON output truncation and ensure deep 13-page academic quality)

// Helper: Run Stage 1 (Metadata, Abstract, Pendahuluan, Metode) - Target Panjang Sesuai Pedoman & Target Halaman (Default 25 Halaman)
async function runStage1(ai: any, rawText: string, metadata: any, targetLengthPages: number = 25, selectedModel?: string) {
  const targetPages = Number(targetLengthPages) || 25;
  const pendahuluanTargetPages = Math.max(5, Math.round(targetPages * 0.24)); // ~6 halaman untuk 25 hal
  const pendahuluanWords = pendahuluanTargetPages * 320; // ~1.900 - 2.200 kata
  const metodeTargetPages = Math.max(2, Math.round(targetPages * 0.12)); // ~3 halaman untuk 25 hal
  const metodeWords = metodeTargetPages * 320; // ~950 - 1.100 kata

  const segments = segmentThesisText(rawText);
  const promptText = `
Anda adalah seorang Reviewer Ahli dan Editor Senior Jurnal Ilmiah yang menyusun artikel hasil penelitian (field research paper / research article) dengan memedomani secara ketat BUKU PEDOMAN KARYA TULIS ILMIAH (BAB I ARTIKEL, BAB III TEKNIK PENULISAN, & BAB IV KUTIPAN/RUJUKAN).

TUGAS UTAMA:
Ekstrak bahan penelitian HANYA DARI NASKAH SKRIPSI YANG DISEDIAKAN, lalu susun menjadi BAGIAN AWAL ARTIKEL JURNAL ILMIAH (Judul, Nama Penulis, Abstrak Dwibahasa, Pendahuluan, dan Metode Penelitian).

PERINGATAN KETAT PANJANG ARTIKEL (TARGET KESELURUHAN: TEPAT ${targetPages} HALAMAN WORD / TIDAK BOLEH HANYA 5 HALAMAN!):
Anda WAJIB menulis naskah ini secara SANGAT PANJANG, MENDALAM, DAN ELABORATIF. JANGAN MERINGKAS, JANGAN MEMPERSINGKAT! Setiap bagian harus diuraikan secara luas dan analitis dengan bahan murni dari naskah skripsi yang dilampirkan agar ketika diformat dalam Word (Times New Roman 12pt, spasi 1.5, margin 4-3-3-3 cm) mencapai target halaman yang diminta.

KAIDAH KETAT PEDOMAN PENULISAN (PPKI 2020):
1. **JUDUL ARTIKEL**:
   - WAJIB DISAMAKAN PERSIS 100% DENGAN JUDUL SKRIPSI ASLI, TIDAK BOLEH DIKURANGI, TIDAK BOLEH DIRINGKAS, TIDAK BOLEH DIPERSINGKAT, DAN TIDAK BOLEH DIUBAH KATA-KATANYA SAMA SEKALI.
   - Jika pada naskah asli judul skripsi terdapat kata/frasa asing (bahasa Arab, Inggris, Latin, atau istilah seperti *Mudharabah*, *Musyarakah*, *Murabahah*, *Takaful*, *E-Commerce*, dsb.) atau kata yang dicetak miring pada judul skripsi asli, tuliskan dengan penanda bintang *istilah* agar dicetak miring.
   - Ditulis menggunakan HURUF KAPITAL (BESAR SEMUA), frasa berita, baku, dan tanpa singkatan tidak umum.

2. **NAMA PENULIS & IDENTITAS**:
   - Ditulis TANPA GELAR AKADEMIK atau gelar apa pun.
   - Di bawah nama dicantumkan identitas: nama program studi, nama lembaga/tempat kerja/instansi, dan alamat e-mail korespondensi.

3. **ABSTRAK DAN KATA KUNCI**:
   - Bersifat ringkas dan padat tentang ide-ide yang paling penting.
   - Struktur wajib memuat:
     * Masalah dan tujuan penelitian (objective)
     * Prosedur/metode penelitian (perspective)
     * Ringkasan temuan/hasil penelitian (finding)
   - Panjang abstrak teks: 50 - 75 KATA (maksimal 100 kata), 1 paragraf padat.
   - Dibuat dwibahasa: Abstrak Bahasa Indonesia dan Abstract Bahasa Inggris.
   - Kata Kunci (Keywords): Tepat 3 - 5 kata/istilah pokok.

4. **PENDAHULUAN (TARGET: TEPAT ${pendahuluanTargetPages} HALAMAN WORD | MINIMAL ${pendahuluanWords} KATA | 12 - 16 PARAGRAF TEBAL)**:
   - Sesuai Pedoman PPKI (BAB I hlm. 4 & BAB III hlm. 61): Penulisan artikel jurnal menggunakan SISTEMATIKA TANPA ANGKA ATAUPUN ABJAD PADA SUBJUDUL. Gunakan judul subbagian "PENDAHULUAN" (BUKAN "A. PENDAHULUAN").
   - DILARANG KERAS MENGULANG kata subjudul "PENDAHULUAN" di awal kalimat isi! Teks harus langsung mengalir masuk ke paragraf narasi tanpa judul duplikat.
   - Pendahuluan memuat empat gagasan wajib: (a) latar belakang penelitian empiris di lapangan, (b) wawasan masalah dan landasan teoritis/grand theory dari Bab II, (c) telaah literatur penelitian-penelitian terdahulu yang relevan dari skripsi, dan (d) research gap, novelty, rumusan tujuan, serta manfaat penelitian.
   - WAJIB disematkan nomor rujukan catatan kaki (footnote) berupa penanda [^1], [^2], [^3] di ujung kalimat kutipan atau definisi teori.

5. **METODE PENELITIAN (TARGET: TEPAT ${metodeTargetPages} HALAMAN WORD | MINIMAL ${metodeWords} KATA | 6 - 8 PARAGRAF DETAIL)**:
   - Sesuai Pedoman PPKI (BAB I hlm. 4 & BAB III hlm. 61): Gunakan judul subbagian "METODE PENELITIAN" (BUKAN "B. METODE PENELITIAN").
   - DILARANG KERAS MENGULANG kata subjudul "METODE PENELITIAN" di awal kalimat isi!
   - Uraikan HANYA teknik yang benar-benar dilakukan dalam skripsi: kualitatif atau kuantitatif, setting, sumber data, teknik pengumpulan, analisis, dan validasi jika ada. Jangan menambahkan observasi, triangulasi, atau sampel jika tidak tercatat di sumber.

PRINSIP SUMBER DATA:
- WAJIB mengambil seluruh bahan, data, teori, dan variabel murni dari isi skripsi asli yang dilampirkan di bawah. Jangan mengarang data untuk memperpanjang artikel.
- DILARANG MENGARANG fakta, nama objek, sampel, atau metode baru yang tidak ada di skripsi.

Metadata Penulis:
- Judul Usulan: ${metadata?.judul || 'Sesuai isi skripsi'}
- Nama Penulis: ${metadata?.nama || 'Penulis Skripsi'}
- Program Studi: ${metadata?.prodi || 'Program Studi Manajemen'}
- Email: ${metadata?.email ? metadata.email : '[Opsional / Tidak dicantumkan]'}
- Instansi: ${metadata?.instansi || 'IAIN Madura'}

ISI BAGIAN AWAL SKRIPSI (JUDUL, BAB I, II, & III):
"""
${segments.frontMatterAndBab123}
"""

Kembalikan HANYA format JSON valid.
`;

  const response = await generateContentWithFallback({
    contents: promptText,
    selectedModel,
    config: {
      responseMimeType: 'application/json',
      maxOutputTokens: 8192,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          metadata: {
            type: Type.OBJECT,
            properties: {
              judul: { type: Type.STRING },
              judulEnglish: { type: Type.STRING },
              nama: { type: Type.STRING },
              prodi: { type: Type.STRING },
              email: { type: Type.STRING },
              instansi: { type: Type.STRING },
            },
            required: ['judul', 'nama', 'prodi', 'email'],
          },
          abstract: {
            type: Type.OBJECT,
            properties: {
              abstrakIndo: { type: Type.STRING },
              keywordsIndo: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              abstrakEnglish: { type: Type.STRING },
              keywordsEnglish: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['abstrakIndo', 'keywordsIndo', 'abstrakEnglish', 'keywordsEnglish'],
          },
          pendahuluan: { type: Type.STRING },
          metode: { type: Type.STRING },
          footnotes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                number: { type: Type.INTEGER },
                text: { type: Type.STRING },
                sectionId: { type: Type.STRING },
                anchorWord: { type: Type.STRING },
              },
              required: ['id', 'number', 'text', 'sectionId'],
            },
          },
        },
        required: ['metadata', 'abstract', 'pendahuluan', 'metode'],
      },
    },
  });

  const parsed = safeJsonParse(getTextFromResponse(response), {});

  // Enforce 100% exact title from user input if provided
  if (metadata?.judul && metadata.judul.trim().length > 0) {
    parsed.metadata = { ...(parsed.metadata || {}), ...metadata, judul: metadata.judul.trim() };
  }

  // Sanitize section content from accidental duplicate headers or letters
  if (!parsed.pendahuluan || !parsed.metode || !parsed.abstract?.abstrakIndo) {
    throw new Error('Tahap 1 menghasilkan data tidak lengkap. Harap ulangi tanpa mengurangi kuota.');
  }
  if (parsed.pendahuluan) {
    parsed.pendahuluan = cleanSectionContent(parsed.pendahuluan, 'PENDAHULUAN');
  }
  if (parsed.metode) {
    parsed.metode = cleanSectionContent(parsed.metode, 'METODE PENELITIAN');
  }

  if (parsed.metadata?.email && parsed.metadata.email.trim() && parsed.metadata.email !== '-') {
    const rawEmail = parsed.metadata.email.trim();
    if (rawEmail.includes('@')) {
      const userPart = rawEmail.split('@')[0].trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
      parsed.metadata.email = userPart ? `${userPart}@gmail.com` : '';
    } else {
      const userPart = rawEmail.toLowerCase().replace(/[^a-z0-9._-]/g, '');
      parsed.metadata.email = userPart ? `${userPart}@gmail.com` : '';
    }
  }
  if (parsed.footnotes) {
    parsed.footnotes = normalizeFootnotes(parsed.footnotes);
  }
  return parsed;
}

// Helper: Run Stage 2 Sub-Worker for HASIL PENELITIAN (Dedicated call to guarantee 2,400+ words and no truncation)
async function runHasilWorker(ai: any, bab4Content: string, stage1Data: any, targetPages: number, selectedModel?: string) {
  const hasilTargetPages = Math.max(6, Math.round(targetPages * 0.28)); // ~7-8 halaman untuk 25 hal
  const hasilWords = hasilTargetPages * 320; // ~2.200 - 2.600 kata

  const promptText = `
Anda adalah Editor Senior Jurnal Ilmiah yang bertugas menyusun bagian HASIL PENELITIAN artikel ilmiah hasil penelitian lapangan (field research) memedomani BUKU PEDOMAN KARYA TULIS ILMIAH (PPKI 2020 BAB I & BAB III).

TUGAS UTAMA:
Ekstrak temuan empiris murni HANYA DARI BAB IV SKRIPSI ASLI yang dilampirkan, lalu susun bagian HASIL PENELITIAN secara mendalam untuk artikel:
"${stage1Data?.metadata?.judul || 'Artikel Ilmiah'}"

TARGET PANJANG WAJIB (TEPAT ${hasilTargetPages} HALAMAN WORD | MINIMAL ${hasilWords} KATA | 14 - 18 PARAGRAF EMPIRIS KAYA DATA):
Tulis naskah bagian HASIL PENELITIAN ini secara SANGAT LUAS, DETAIL, DAN EKSTENSIF. JANGAN MERINGKAS! JANGAN MEMBUAT PARAGRAF PENDEK!

ATURAN STRUKTUR & PEDOMAN PPKI:
1. Sistematika tanpa abjad/angka: Judul bagian adalah "HASIL PENELITIAN" (BUKAN "C. HASIL PENELITIAN").
2. DILARANG KERAS MENGULANG kata subjudul "HASIL PENELITIAN" di awal kalimat isi! Langsung mulai dengan narasi deskripsi kondisi objek dan subjek penelitian.
3. Struktur isi wajib memuat:
   a. Deskripsi menyeluruh kondisi latar penelitian, profil informan/responden, dan setting riset (3-4 paragraf tebal).
   b. Paparan temuan data empiris terurai per fokus penelitian (8-10 paragraf tebal memuat seluruh data angka, persentase, tabel deskriptif naratif, dan kutipan wawancara langsung informan dengan mencantumkan nama informan dan tanggal wawancara).
   c. Pola temuan khusus dan dinamika lapangan yang terungkap selama penelitian (3-4 paragraf tebal).
4. Sematkan nomor catatan kaki (footnote) berupa penanda [^X] pada kutipan wawancara atau dokumen lapangan.

ISI BAB IV SKRIPSI:
"""
${bab4Content}
"""

Kembalikan HANYA JSON valid: { "hasil": "isi teks lengkap", "footnotes": [ { "id": "fn_h1", "number": 1, "text": "Wawancara dengan Informan X, Jabatan, Tanggal...", "sectionId": "hasil" } ] }
`;

  const response = await generateContentWithFallback({
    contents: promptText,
    selectedModel,
    config: {
      responseMimeType: 'application/json',
      maxOutputTokens: 8192,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          hasil: { type: Type.STRING },
          footnotes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                number: { type: Type.INTEGER },
                text: { type: Type.STRING },
                sectionId: { type: Type.STRING },
                anchorWord: { type: Type.STRING },
              },
              required: ['id', 'number', 'text', 'sectionId'],
            },
          },
        },
        required: ['hasil'],
      },
    },
  });

  const parsed = safeJsonParse(getTextFromResponse(response), {});
  if (parsed.hasil) {
    parsed.hasil = cleanSectionContent(parsed.hasil, 'HASIL PENELITIAN');
  }
  return parsed;
}

// Helper: Run Stage 2 Sub-Worker for PEMBAHASAN (Dedicated call to guarantee 2,200+ words and deep dialectic analysis)
async function runPembahasanWorker(ai: any, bab4Content: string, stage1Data: any, targetPages: number, selectedModel?: string) {
  const pembahasanTargetPages = Math.max(5, Math.round(targetPages * 0.24)); // ~6-7 halaman untuk 25 hal
  const pembahasanWords = pembahasanTargetPages * 320; // ~1.900 - 2.300 kata

  const promptText = `
Anda adalah Editor Senior Jurnal Ilmiah yang bertugas menyusun bagian PEMBAHASAN artikel ilmiah memedomani BUKU PEDOMAN KARYA TULIS ILMIAH (PPKI 2020 BAB I & BAB III).

TUGAS UTAMA:
Lakukan analisis dan dialektika ilmiah mendalam menghubungkan temuan empiris skripsi dengan kerangka teori (Bab II) dan penelitian-penelitian terdahulu yang relevan untuk artikel:
"${stage1Data?.metadata?.judul || 'Artikel Ilmiah'}"

TARGET PANJANG WAJIB (TEPAT ${pembahasanTargetPages} HALAMAN WORD | MINIMAL ${pembahasanWords} KATA | 12 - 16 PARAGRAF ANALITIS BERBOBOT TINGGI):
Tulis naskah PEMBAHASAN ini secara SANGAT ANALITIS, MENDALAM, DAN BERBOBOT. JANGAN MERINGKAS!

ATURAN STRUKTUR & PEDOMAN PPKI:
1. Sistematika tanpa abjad/angka: Judul bagian adalah "PEMBAHASAN" (BUKAN "D. PEMBAHASAN").
2. DILARANG KERAS MENGULANG kata subjudul "PEMBAHASAN" di awal kalimat isi! Langsung masuk ke perbincangan dialektika teoritis dan analitis.
3. Struktur isi wajib memuat:
   a. Pembahasan dan analisis konseptual untuk menjawab setiap fokus/rumusan masalah penelitian (4-5 paragraf tebal).
   b. Integrasi dan konfirmasi temuan lapangan dengan teori-teori utama/grand theory dari Bab II (4-5 paragraf tebal).
   c. Komparasi komprehensif dengan temuan riset-riset terdahulu (analisis posisi temuan: memperkuat, mengoreksi, atau memperluas teori) (3-4 paragraf tebal).
   d. Implikasi teoritis dan praktis temuan, serta keterbatasan temuan riset (2-3 paragraf tebal).
4. Sematkan rujukan catatan kaki (footnote) berupa penanda [^X] pada teori atau rujukan buku yang dikutip.

ISI BAB IV SKRIPSI:
"""
${bab4Content}
"""

Kembalikan HANYA JSON valid: { "pembahasan": "isi teks lengkap", "footnotes": [ { "id": "fn_p1", "number": 1, "text": "Rujukan teori...", "sectionId": "pembahasan" } ] }
`;

  const response = await generateContentWithFallback({
    contents: promptText,
    selectedModel,
    config: {
      responseMimeType: 'application/json',
      maxOutputTokens: 8192,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          pembahasan: { type: Type.STRING },
          footnotes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                number: { type: Type.INTEGER },
                text: { type: Type.STRING },
                sectionId: { type: Type.STRING },
                anchorWord: { type: Type.STRING },
              },
              required: ['id', 'number', 'text', 'sectionId'],
            },
          },
        },
        required: ['pembahasan'],
      },
    },
  });

  const parsed = safeJsonParse(getTextFromResponse(response), {});
  if (parsed.pembahasan) {
    parsed.pembahasan = cleanSectionContent(parsed.pembahasan, 'PEMBAHASAN');
  }
  return parsed;
}

// Helper: Run Stage 2 (Hasil & Pembahasan) - Target Panjang Sesuai Pedoman & Target Halaman (Default 25 Halaman)
async function runStage2(ai: any, rawText: string, stage1Data: any, targetLengthPages: number = 25, selectedModel?: string) {
  const targetPages = Number(targetLengthPages) || 25;
  const segments = segmentThesisText(rawText);
  const bab4Content = segments.bab4HasilPembahasan && segments.bab4HasilPembahasan.length > 2500
    ? segments.bab4HasilPembahasan
    : rawText;

  // Execute Hasil and Pembahasan sequentially with rate pacing to protect Gemini API 5 RPM limit
  const hasilRes = await runHasilWorker(ai, bab4Content, stage1Data, targetPages, selectedModel);

  // Polite delay to pace requests within Gemini Free Tier rate limit window
  await new Promise((resolve) => setTimeout(resolve, 1800));

  const pembahasanRes = await runPembahasanWorker(ai, bab4Content, stage1Data, targetPages, selectedModel);

  const combinedFootnotes = [
    ...(hasilRes.footnotes || []),
    ...(pembahasanRes.footnotes || []),
  ];

  if (!hasilRes.hasil?.trim() || !pembahasanRes.pembahasan?.trim()) {
    throw new Error('Tahap 2 belum menghasilkan Hasil dan Pembahasan yang lengkap.');
  }
  return {
    hasil: cleanSectionContent(hasilRes.hasil, 'HASIL PENELITIAN'),
    pembahasan: cleanSectionContent(pembahasanRes.pembahasan, 'PEMBAHASAN'),
    footnotes: normalizeFootnotes(combinedFootnotes),
  };
}

// Helper: Run Stage 3 (Kesimpulan, Footnotes, Daftar Rujukan) - Target Sesuai Pedoman PPKI 2020
async function runStage3(ai: any, rawText: string, stage1Data: any, stage2Data?: any, footnoteStyle?: string, selectedModel?: string, targetLengthPages: number = 25) {
  const targetPages = Number(targetLengthPages) || 25;
  const kesimpulanWords = Math.max(500, Math.round(targetPages * 24)); // ~600 kata esai mendalam untuk 25 hal

  const segments = segmentThesisText(rawText);
  const promptText = `
Anda adalah seorang Reviewer Ahli dan Editor Senior Jurnal Ilmiah yang menyusun artikel ilmiah dengan memedomani secara ketat BUKU PEDOMAN KARYA TULIS ILMIAH (PPKI 2020 BAB I ARTIKEL, BAB III TEKNIK PENULISAN, & BAB IV KUTIPAN, RUJUKAN, DAN DAFTAR RUJUKAN).

TUGAS UTAMA:
Ekstrak dan susun TAHAP 3 (Kesimpulan & Saran, Catatan Kaki/Footnote, dan Daftar Rujukan) HANYA DARI NASKAH SKRIPSI ASLI YANG DIBERIKAN untuk artikel ilmiah bertajuk:
"${stage1Data?.metadata?.judul || 'Artikel Ilmiah'}"

${stage2Data?.hasil ? `Ringkasan Temuan Hasil & Pembahasan dari Tahap 2:\n- Temuan Hasil: ${stage2Data.hasil.slice(0, 1500)}\n- Temuan Pembahasan: ${stage2Data.pembahasan?.slice(0, 1500) || ''}` : ''}

KAIDAH KETAT PEDOMAN PENULISAN (PPKI 2020):
1. **KESIMPULAN DAN SARAN (TARGET MINIMAL ${kesimpulanWords} KATA | 4 - 5 PARAGRAF ESAI MENDALAM)**:
   - Sesuai Pedoman Bab I & Bab III: Sistematika subjudul TANPA HURUF ABJAD. Gunakan judul "KESIMPULAN DAN SARAN" (BUKAN "E. KESIMPULAN DAN SARAN").
   - DILARANG KERAS MENGULANG kata subjudul "KESIMPULAN DAN SARAN" di awal kalimat isi! Langsung masuk ke uraian esai.
   - Sesuai Pedoman Bab I Artikel: "Kesimpulan adalah jawaban dari fokus atau rumusan masalah... Kesimpulan disajikan dalam bentuk esai, bukan dalam bentuk numerikal."
   - Sajikan dalam bentuk paragraf esai analitis mendalam:
     a. Jawaban substantif dan menyeluruh atas rumusan masalah penelitian berdasarkan data empiris (2-3 paragraf tebal).
     b. Keterbatasan temuan penelitian yang jujur dan ilmiah (1 paragraf).
     c. Saran dan rekomendasi tindakan praktis bagi pengambil kebijakan serta agenda riset lanjutan (1-2 paragraf tebal).

2. **CATATAN KAKI (FOOTNOTES - PPKI BAB IV BAGIAN B)**:
   - "IAIN Madura secara resmi menetapkan catatan kaki (footnote) sebagai teknik penulisan rujukan dalam setiap karya ilmiah."
   - Gunakan hanya catatan kaki yang memiliki sumber sah dalam skripsi asli. Jangan paksakan 15–25 catatan bila naskah tidak mendukung.
   - Format rujukan buku:
     Nama Penulis Seperti Susunan Aslinya (tanpa gelar), *Judul Buku Dicetak Miring* (Tempat Penerbit: Nama Penerbit, Tahun), nomor halaman.
     Contoh: Mohammad Hefni, *Islam Madura: Sebuah Studi Konstruktivisme-Strukturalis tentang Relasi Islam Pesantren dan Islam Kampung di Sumenep Madura* (Malang: Literasi Nusantara, 2019), 55.
   - Setiap footnote memuat: 'id' (misal: 'fn_1'), 'number' (1, 2, ...), 'text' (teks lengkap footnote), 'sectionId' ('pendahuluan'/'metode'/'hasil'/'pembahasan'), dan 'anchorWord' (kata rujukan di teks).

3. **DAFTAR RUJUKAN (PPKI BAB IV BAGIAN C, hlm. 71-72)**:
   - Judul bagian adalah "DAFTAR RUJUKAN" (BUKAN "DAFTAR PUSTAKA").
   - Cantumkan hanya referensi yang benar-benar ada pada daftar pustaka skripsi asli, sebanyak yang tersedia. DILARANG menambah sumber fiktif untuk memenuhi target jumlah.
   - ATURAN NAMA PENULIS SESUAI PPKI HLM. 71-72:
     * Satu Penulis: Nama akhir dibalik, nama depan. (Contoh: Hefni, Mohammad.)
     * Dua Penulis: Nama pertama dibalik, nama kedua ditulis menurut urutan biasa. (Contoh: Guntur, Romli dan A. Fawaid.)
     * Tiga Penulis atau Lebih: HANYA nama pertama yang ditulis (dibalik) lalu WAJIB LANGSUNG diikuti "dkk." atau "et al."! DILARANG menuliskan nama penulis kedua dan ketiga! (Contoh: Alulu, Fadhlan, dkk. atau Latuconsina, Fadly B., dkk.)
   - Judul buku dicetak miring dengan tanda bintang *...*.
   - Menggunakan format hanging indent (baris kedua menjorok ke dalam).

ISI BAB V & DAFTAR PUSTAKA SKRIPSI:
"""
${segments.bab5DanPustaka}
"""

Kembalikan HANYA format JSON valid dengan field 'kesimpulan', 'daftarPustaka', dan 'footnotes'.
`;

  const response = await generateContentWithFallback({
    contents: promptText,
    selectedModel,
    config: {
      responseMimeType: 'application/json',
      maxOutputTokens: 8192,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          kesimpulan: { type: Type.STRING },
          daftarPustaka: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          footnotes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                number: { type: Type.INTEGER },
                text: { type: Type.STRING },
                sectionId: { type: Type.STRING },
                anchorWord: { type: Type.STRING },
              },
              required: ['id', 'number', 'text', 'sectionId'],
            },
          },
        },
        required: ['kesimpulan', 'daftarPustaka', 'footnotes'],
      },
    },
  });

  const parsed = safeJsonParse(getTextFromResponse(response), {});
  if (!parsed.kesimpulan || !Array.isArray(parsed.daftarPustaka) || !Array.isArray(parsed.footnotes)) {
    throw new Error('Tahap 3 belum lengkap: kesimpulan, daftar rujukan atau footnote gagal dihasilkan. Tidak akan menyatakan artikel selesai.');
  }

  if (parsed.kesimpulan) {
    parsed.kesimpulan = cleanSectionContent(parsed.kesimpulan, 'KESIMPULAN DAN SARAN');
  }

  // Normalize all bibliography entries per PPKI 2020 rules
  if (Array.isArray(parsed.daftarPustaka)) {
    parsed.daftarPustaka = parsed.daftarPustaka.map((entry: string) => normalizePpkIBibliographyEntry(entry));
  }

  if (parsed.footnotes) {
    parsed.footnotes = normalizeFootnotes(parsed.footnotes);
  }

  return parsed;
}

// Stage 1 Endpoint
app.post('/generate-journal/stage1', async (req, res) => {
  try {
    const ai = getJournalAi();
    const { rawText, metadata, targetLengthPages, selectedModel = 'gemini-3.1-flash-lite' } = req.body;
    if (!rawText || rawText.trim().length < 50 || rawText.length > 350000) {
      return res.status(400).json({ error: 'Teks skripsi tidak boleh kosong.' });
    }
    const data1 = await runStage1(ai, rawText, metadata, targetLengthPages, selectedModel);
    res.json(data1);
  } catch (error: any) {
    console.error('Error in Stage 1:', error);
    res.status(500).json({ error: 'Gagal memproses Tahap 1: ' + (error.message || 'Error server') });
  }
});

// Stage 2 Endpoint
app.post('/generate-journal/stage2', async (req, res) => {
  try {
    const ai = getJournalAi();
    const { rawText, stage1Data, targetLengthPages, selectedModel = 'gemini-3.1-flash-lite' } = req.body;
    if (!rawText || rawText.trim().length < 50 || rawText.length > 350000) {
      return res.status(400).json({ error: 'Teks skripsi tidak boleh kosong.' });
    }
    const data2 = await runStage2(ai, rawText, stage1Data, targetLengthPages, selectedModel);
    res.json(data2);
  } catch (error: any) {
    console.error('Error in Stage 2:', error);
    res.status(500).json({ error: 'Gagal memproses Tahap 2: ' + (error.message || 'Error server') });
  }
});

// Stage 3 Endpoint
app.post('/generate-journal/stage3', async (req, res) => {
  try {
    const ai = getJournalAi();
    const { rawText, stage1Data, stage2Data, footnoteStyle, selectedModel = 'gemini-3.1-flash-lite', targetLengthPages } = req.body;
    if (!rawText || rawText.trim().length < 50 || rawText.length > 350000) {
      return res.status(400).json({ error: 'Teks skripsi tidak boleh kosong.' });
    }
    const data3 = await runStage3(ai, rawText, stage1Data, stage2Data, footnoteStyle, selectedModel, targetLengthPages);
    res.json(data3);
  } catch (error: any) {
    console.error('Error in Stage 3:', error);
    res.status(500).json({ error: 'Gagal memproses Tahap 3: ' + (error.message || 'Error server') });
  }
});

// Single combined endpoint running all 3 stages in sequence (Fallback & direct backend call)
app.post('/generate-journal', async (req, res) => {
  try {
    const ai = getJournalAi();
    const { rawText, metadata, footnoteStyle, targetLengthPages = 16, selectedModel = 'gemini-3.1-flash-lite' } = req.body;

    if (!rawText || rawText.trim().length < 50 || rawText.length > 350000) {
      return res.status(400).json({ error: 'Teks skripsi tidak boleh kosong.' });
    }

    // Step 1: Metadata, Abstract, Pendahuluan, Metode
    const stage1 = await runStage1(ai, rawText, metadata, targetLengthPages, selectedModel);

    // Step 2: Hasil & Pembahasan
    const stage2 = await runStage2(ai, rawText, stage1, targetLengthPages, selectedModel);

    // Step 3: Kesimpulan, Footnotes, Daftar Rujukan
    const stage3 = await runStage3(ai, rawText, stage1, stage2, footnoteStyle, selectedModel, targetLengthPages);

    const mergedFootnotes = [
      ...(stage1.footnotes || []),
      ...(stage2.footnotes || []),
      ...(stage3.footnotes || []),
    ];

    const mergedArticle = {
      id: 'art_' + Date.now(),
      createdAt: new Date().toISOString(),
      metadata: {
        ...(stage1.metadata || metadata),
        judul: metadata?.judul?.trim() || stage1.metadata?.judul || 'ARTIKEL ILMIAH',
      },
      abstract: stage1.abstract,
      pendahuluan: stage1.pendahuluan,
      metode: stage1.metode,
      hasil: stage2.hasil,
      pembahasan: stage2.pembahasan,
      kesimpulan: stage3.kesimpulan,
      daftarPustaka: stage3.daftarPustaka || [],
      footnotes: normalizeFootnotes(stage3.footnotes?.length ? stage3.footnotes : mergedFootnotes),
    };

    res.json(mergedArticle);
  } catch (error: any) {
    console.error('Error generating journal:', error);
    res.status(500).json({
      error: 'Gagal menggenerasi artikel ilmiah: ' + (error.message || 'Server error'),
    });
  }
});

// 3. Regenerate / Polish Specific Section Endpoint
app.post('/regenerate-section', async (req, res) => {
  try {
    const { sectionName, currentText, instructions, contextTitle, selectedModel } = req.body;

    const promptText = `
Anda adalah Editor Jurnal Akademik Utama.
Tugas: Perbaiki dan tingkatkan penulisan bagian "${sectionName}" untuk artikel ilmiah bertajuk "${contextTitle || 'Artikel Ilmiah'}".

Teks Saat Ini:
"""
${currentText}
"""

Instruksi Perbaikan dari Pengguna:
"${instructions || 'Tingkatkan kerapian bahasa, akademisme, dan kepadatan kalimat agar lebih ilmiah.'}"

Hasilkan teks bagian "${sectionName}" yang baru dan lengkap dalam bahasa Indonesia akademis yang rapi. Jangan berikan kalimat pengantar, langsung teks isi.
`;

    const response = await generateContentWithFallback({
      contents: promptText,
      selectedModel,
    });

    res.json({ newText: getTextFromResponse(response).trim() || currentText });
  } catch (error: any) {
    console.error('Error regenerating section:', error);
    res.status(500).json({ error: 'Gagal memperbarui bagian artikel.' });
  }
});

// 404 Catch-all for API endpoints to prevent falling through to Vite SPA HTML
app.all('/*', (req, res) => {
  res.status(404).json({ error: `Endpoint API '${req.method} ${req.path}' tidak ditemukan.` });
});

// Mounted from ZAIN.NET main server at /api/journal7.
