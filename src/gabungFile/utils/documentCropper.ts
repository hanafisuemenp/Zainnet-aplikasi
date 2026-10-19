/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Auto-Crop & Deskew Engine for Student Document Attachments (Menu No 10)
 * Automatically detects document paper boundaries, crops out table/background,
 * and corrects skewed/tilted camera angles.
 */

export interface DocumentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number; // degrees, positive = clockwise
  hasTable: boolean; // true if significant background (table/desk) is detected
  confidence: number;
}

export interface CropResult {
  file: File;
  dataUrl: string;
  width: number;
  height: number;
  aspectRatio: number;
  angle: number;
  bounds: { x: number; y: number; width: number; height: number };
  isCropped: boolean;
  enhancedContrast: boolean;
}

/**
 * Loads an image from a DataURL or URL
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Converts a File to DataURL
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Analyzes an image to detect paper boundaries (excluding table/desk)
 * and tilt/skew angle in degrees.
 */
export async function detectDocumentBounds(imageSource: HTMLImageElement | string): Promise<DocumentBounds> {
  const img = typeof imageSource === 'string' ? await loadImage(imageSource) : imageSource;
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;

  // Use a fast downscaled thumbnail for pixel analysis (~500px max dimension)
  const maxDim = 500;
  const scale = Math.min(1, maxDim / Math.max(origW, origH));
  const aW = Math.max(100, Math.round(origW * scale));
  const aH = Math.max(100, Math.round(origH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = aW;
  canvas.height = aH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return {
      x: 0,
      y: 0,
      width: origW,
      height: origH,
      angle: 0,
      hasTable: false,
      confidence: 0,
    };
  }

  ctx.drawImage(img, 0, 0, aW, aH);
  const imgData = ctx.getImageData(0, 0, aW, aH);
  const data = imgData.data;

  // 1. Sample outer border perimeter (5% margin) to estimate background table color/lightness
  const borderSizeX = Math.max(2, Math.round(aW * 0.05));
  const borderSizeY = Math.max(2, Math.round(aH * 0.05));
  let bgR = 0, bgG = 0, bgB = 0, borderSamples = 0;

  for (let y = 0; y < aH; y += 4) {
    for (let x = 0; x < aW; x += 4) {
      if (x < borderSizeX || x > aW - borderSizeX || y < borderSizeY || y > aH - borderSizeY) {
        const idx = (y * aW + x) * 4;
        bgR += data[idx];
        bgG += data[idx + 1];
        bgB += data[idx + 2];
        borderSamples++;
      }
    }
  }

  bgR = borderSamples > 0 ? bgR / borderSamples : 100;
  bgG = borderSamples > 0 ? bgG / borderSamples : 100;
  bgB = borderSamples > 0 ? bgB / borderSamples : 100;
  const bgLightness = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;

  // Function to classify if a pixel belongs to white/light document paper
  const isPaperPixel = (x: number, y: number): boolean => {
    const idx = (y * aW + x) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    const colorDist = Math.hypot(r - bgR, g - bgG, b - bgB);

    // Document paper is typically bright (L > 145) and distinct from table background
    if (bgLightness < 150) {
      // Dark / wooden / colored table
      return l > 140 && (l > bgLightness + 25 || colorDist > 30);
    } else {
      // Light desk / floor: check color distance and saturation
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;
      return l > 165 && (colorDist > 25 || saturation < 0.12);
    }
  };

  // 2. Measure Row & Column Document Densities (Projections)
  let minY = aH;
  let maxY = 0;
  const rowThreshold = (aW / 4) * 0.18; // At least 18% of row must be paper

  for (let y = 0; y < aH; y += 4) {
    let rowCount = 0;
    for (let x = 0; x < aW; x += 4) {
      if (isPaperPixel(x, y)) rowCount++;
    }
    if (rowCount > rowThreshold) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  let minX = aW;
  let maxX = 0;
  const colThreshold = (aH / 4) * 0.18; // At least 18% of column must be paper

  for (let x = 0; x < aW; x += 4) {
    let colCount = 0;
    for (let y = 0; y < aH; y += 4) {
      if (isPaperPixel(x, y)) colCount++;
    }
    if (colCount > colThreshold) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }

  // Fallback if paper detection couldn't find distinct margins
  if (minX >= maxX || minY >= maxY || (maxX - minX < aW * 0.4) || (maxY - minY < aH * 0.4)) {
    minX = 0;
    maxX = aW;
    minY = 0;
    maxY = aH;
  }

  // 3. Skew Angle Detection (Linear regression on the top boundary slope)
  const topEdgePoints: { x: number; y: number }[] = [];
  const startX = Math.round(minX + (maxX - minX) * 0.2);
  const endX = Math.round(minX + (maxX - minX) * 0.8);
  const stepX = Math.max(4, Math.round((endX - startX) / 16));

  for (let x = startX; x <= endX; x += stepX) {
    for (let y = Math.max(0, minY - 15); y < Math.min(aH, minY + (maxY - minY) * 0.4); y += 2) {
      if (isPaperPixel(x, y)) {
        topEdgePoints.push({ x, y });
        break;
      }
    }
  }

  let detectedAngle = 0;
  if (topEdgePoints.length >= 5) {
    let sX = 0, sY = 0, sXY = 0, sX2 = 0;
    const n = topEdgePoints.length;
    for (const p of topEdgePoints) {
      sX += p.x;
      sY += p.y;
      sXY += p.x * p.y;
      sX2 += p.x * p.x;
    }
    const denom = n * sX2 - sX * sX;
    if (Math.abs(denom) > 1e-5) {
      const slope = (n * sXY - sX * sY) / denom;
      const angleDeg = (Math.atan(slope) * 180) / Math.PI;
      // Clamp reasonable skew angle (-25 to +25 degrees)
      if (Math.abs(angleDeg) <= 25) {
        detectedAngle = Math.round(angleDeg * 10) / 10;
      }
    }
  }

  // 4. Map back to full resolution with 1% safety margin
  const invScale = 1 / scale;
  const marginX = Math.round(origW * 0.01);
  const marginY = Math.round(origH * 0.01);

  const fullX = Math.max(0, Math.round(minX * invScale) - marginX);
  const fullY = Math.max(0, Math.round(minY * invScale) - marginY);
  const fullX2 = Math.min(origW, Math.round(maxX * invScale) + marginX);
  const fullY2 = Math.min(origH, Math.round(maxY * invScale) + marginY);
  const fullW = Math.max(100, fullX2 - fullX);
  const fullH = Math.max(100, fullY2 - fullY);

  // Check if significant table is present (at least 2% margin on any edge or tilt >= 0.5 deg)
  const leftMarginRatio = fullX / origW;
  const topMarginRatio = fullY / origH;
  const rightMarginRatio = (origW - fullX2) / origW;
  const bottomMarginRatio = (origH - fullY2) / origH;
  const areaRatio = (fullW * fullH) / (origW * origH);

  const hasTableMargin =
    leftMarginRatio > 0.02 ||
    topMarginRatio > 0.02 ||
    rightMarginRatio > 0.02 ||
    bottomMarginRatio > 0.02 ||
    areaRatio < 0.96;

  const hasSignificantTilt = Math.abs(detectedAngle) >= 0.5;
  const hasTable = hasTableMargin || hasSignificantTilt;

  return {
    x: fullX,
    y: fullY,
    width: fullW,
    height: fullH,
    angle: detectedAngle,
    hasTable,
    confidence: hasTable ? 0.95 : 0.8,
  };
}

/**
 * Crops and deskews an image according to specified bounds and rotation angle.
 * Produces a high-quality JPEG File & DataURL.
 */
export async function cropAndDeskewImage(
  imageSource: HTMLImageElement | string,
  options: {
    bounds?: { x: number; y: number; width: number; height: number };
    angle?: number; // tilt angle in degrees to straighten
    enhanceContrast?: boolean;
    fileName?: string;
  } = {}
): Promise<CropResult> {
  const img = typeof imageSource === 'string' ? await loadImage(imageSource) : imageSource;
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;

  const bounds = options.bounds || { x: 0, y: 0, width: origW, height: origH };
  const angle = options.angle ?? 0;
  const enhance = !!options.enhanceContrast;

  // Create canvas for the cropped area
  const cropW = Math.max(50, Math.min(origW, Math.round(bounds.width)));
  const cropH = Math.max(50, Math.min(origH, Math.round(bounds.height)));

  const outCanvas = document.createElement('canvas');
  outCanvas.width = cropW;
  outCanvas.height = cropH;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) throw new Error('Gagal membuat 2D Canvas context.');

  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';

  // If angle is non-zero, deskew around the center of the cropped document
  if (Math.abs(angle) > 0.1) {
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    outCtx.save();
    outCtx.translate(cropW / 2, cropH / 2);
    // Rotate in reverse of tilt to straighten
    outCtx.rotate((-angle * Math.PI) / 180);
    outCtx.drawImage(
      img,
      -centerX,
      -centerY
    );
    outCtx.restore();
  } else {
    // Standard fast direct crop
    outCtx.drawImage(
      img,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      0,
      0,
      cropW,
      cropH
    );
  }

  // Optional: Enhance document contrast & paper whiteness (Document Scanner Filter)
  if (enhance) {
    const imgData = outCtx.getImageData(0, 0, cropW, cropH);
    const d = imgData.data;
    // Stretch contrast slightly: boost highlights towards 255, darken text
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      if (l > 175) {
        // Brighten paper
        const boost = Math.min(255, l + (255 - l) * 0.45);
        const factor = boost / (l || 1);
        d[i] = Math.min(255, r * factor);
        d[i + 1] = Math.min(255, g * factor);
        d[i + 2] = Math.min(255, b * factor);
      } else if (l < 110) {
        // Darken text for high legibility
        d[i] = Math.max(0, r * 0.85);
        d[i + 1] = Math.max(0, g * 0.85);
        d[i + 2] = Math.max(0, b * 0.85);
      }
    }
    outCtx.putImageData(imgData, 0, 0);
  }

  // Export to Blob & File
  const quality = 0.95;
  const blob = await new Promise<Blob>((resolve, reject) => {
    outCanvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Gagal menghasilkan file blob gambar hasil crop'));
      },
      'image/jpeg',
      quality
    );
  });

  const baseName = (options.fileName || 'dokumen').replace(/\.[^/.]+$/, '');
  const outFileName = `${baseName}_autocrop.jpg`;
  const outFile = new File([blob], outFileName, { type: 'image/jpeg' });
  const dataUrl = outCanvas.toDataURL('image/jpeg', quality);

  const isCropped = bounds.width < origW * 0.98 || bounds.height < origH * 0.98 || Math.abs(angle) > 0.5;

  return {
    file: outFile,
    dataUrl,
    width: cropW,
    height: cropH,
    aspectRatio: cropW / cropH,
    angle,
    bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
    isCropped,
    enhancedContrast: enhance,
  };
}

/**
 * Automatically detects table background or skew on a raw uploaded photo,
 * and crops/straightens it if necessary.
 */
export async function autoProcessDocumentPhoto(
  file: File
): Promise<{
  file: File;
  dataUrl: string;
  width: number;
  height: number;
  aspectRatio: number;
  isCropped: boolean;
  deskewAngle: number;
  originalFile: File;
  originalDataUrl: string;
  cropBounds?: { x: number; y: number; width: number; height: number };
}> {
  const originalDataUrl = await fileToDataUrl(file);
  const img = await loadImage(originalDataUrl);
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;

  // Run auto-detection
  const detection = await detectDocumentBounds(img);

  // If table was detected or document is tilted >= 0.5 degrees, execute auto-crop and deskew
  if (detection.hasTable || Math.abs(detection.angle) >= 0.5) {
    const cropped = await cropAndDeskewImage(img, {
      bounds: {
        x: detection.x,
        y: detection.y,
        width: detection.width,
        height: detection.height,
      },
      angle: detection.angle,
      enhanceContrast: false,
      fileName: file.name,
    });

    return {
      file: cropped.file,
      dataUrl: cropped.dataUrl,
      width: cropped.width,
      height: cropped.height,
      aspectRatio: cropped.aspectRatio,
      isCropped: true,
      deskewAngle: detection.angle,
      originalFile: file,
      originalDataUrl,
      cropBounds: {
        x: detection.x,
        y: detection.y,
        width: detection.width,
        height: detection.height,
      },
    };
  }

  // No significant table or tilt detected: keep clean original
  return {
    file,
    dataUrl: originalDataUrl,
    width: origW,
    height: origH,
    aspectRatio: origW / origH,
    isCropped: false,
    deskewAngle: 0,
    originalFile: file,
    originalDataUrl,
  };
}
