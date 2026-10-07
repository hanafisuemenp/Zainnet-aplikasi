/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createWorker } from 'tesseract.js';

let workerPromise: Promise<unknown> | null = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      try {
        const worker = await createWorker('eng');
        return worker;
      } catch (err) {
        console.warn('OCR Worker initialization failed or network unavailable:', err);
        return null;
      }
    })();
  }
  return workerPromise;
}

/**
 * Extracts text from the top 35% of the image where document headers/titles are printed.
 */
export async function performQuickHeaderOcr(file: File): Promise<string> {
  return new Promise((resolve) => {
    // 8-second safety timeout so UI never hangs
    const timeout = setTimeout(() => {
      resolve('');
    }, 8000);

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = async () => {
      try {
        // Create canvas of top 35%
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          clearTimeout(timeout);
          URL.revokeObjectURL(url);
          return resolve('');
        }

        const cropHeight = Math.floor(img.height * 0.35);
        canvas.width = Math.min(img.width, 1400);
        canvas.height = Math.floor(canvas.width * (cropHeight / img.width));

        // High contrast grayscale for OCR accuracy
        ctx.drawImage(img, 0, 0, img.width, cropHeight, 0, 0, canvas.width, canvas.height);

        const worker = (await getWorker()) as {
          recognize: (img: HTMLCanvasElement) => Promise<{ data: { text: string } }>;
        } | null;

        if (!worker) {
          clearTimeout(timeout);
          URL.revokeObjectURL(url);
          return resolve('');
        }

        const ret = await worker.recognize(canvas);
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        resolve(ret.data.text.trim());
      } catch (e) {
        console.warn('OCR failed for image:', e);
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        resolve('');
      }
    };

    img.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      resolve('');
    };

    img.src = url;
  });
}
