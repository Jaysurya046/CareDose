/**
 * Local-First Image Preprocessing for Prescription Recognition.
 * Operates purely on client-side HTML5 Canvas.
 * No data or images are ever transmitted to external servers.
 */

export interface PreprocessOptions {
  rotateDegrees?: number; // 0, 90, 180, 270
  grayscale?: boolean;
  enhanceContrast?: boolean;
  adaptiveBinarization?: boolean;
  maxDimension?: number;
  cropRegion?: { x: number; y: number; width: number; height: number };
}

/**
 * Loads a File or Blob into an HTMLImageElement safely.
 */
export function loadImageFromFile(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load image: ${err}`));
    };
    img.src = url;
  });
}

/**
 * Preprocesses an image using client-side canvas transformations.
 * Optimizes printed text sharpness and readability without distorting character morphology.
 */
export async function preprocessImage(
  imageSource: HTMLImageElement | HTMLCanvasElement,
  options: PreprocessOptions = {}
): Promise<{ dataUrl: string; blob: Blob; width: number; height: number }> {
  const {
    rotateDegrees = 0,
    grayscale = true,
    enhanceContrast = true,
    adaptiveBinarization = false,
    maxDimension = 2048,
    cropRegion
  } = options;

  let srcWidth = imageSource instanceof HTMLImageElement ? imageSource.naturalWidth : imageSource.width;
  let srcHeight = imageSource instanceof HTMLImageElement ? imageSource.naturalHeight : imageSource.height;

  // Handle cropping if requested
  const sx = cropRegion ? Math.max(0, cropRegion.x) : 0;
  const sy = cropRegion ? Math.max(0, cropRegion.y) : 0;
  const sw = cropRegion ? Math.min(srcWidth - sx, cropRegion.width) : srcWidth;
  const sh = cropRegion ? Math.min(srcHeight - sy, cropRegion.height) : srcHeight;

  // Compute scaled dimensions respecting maxDimension
  let scale = 1;
  const largest = Math.max(sw, sh);
  if (largest > maxDimension) {
    scale = maxDimension / largest;
  }
  const scaledWidth = Math.round(sw * scale);
  const scaledHeight = Math.round(sh * scale);

  // Setup canvas with rotation consideration
  const canvas = document.createElement('canvas');
  const isRotated90 = (rotateDegrees % 180 !== 0);
  canvas.width = isRotated90 ? scaledHeight : scaledWidth;
  canvas.height = isRotated90 ? scaledWidth : scaledHeight;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Failed to get 2D canvas context for image preprocessing');
  }

  // Clear canvas
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Apply rotation and draw
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotateDegrees * Math.PI) / 180);
  ctx.drawImage(
    imageSource,
    sx, sy, sw, sh,
    -scaledWidth / 2,
    -scaledHeight / 2,
    scaledWidth,
    scaledHeight
  );
  ctx.restore();

  // Pixel-level adjustments if grayscale or contrast enhancement enabled
  if (grayscale || enhanceContrast || adaptiveBinarization) {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    const w = canvas.width;
    const h = canvas.height;

    // Convert to grayscale luminance array
    const lums = new Uint8Array(w * h);
    let minLum = 255;
    let maxLum = 0;

    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const lum = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      lums[j] = lum;
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
    }

    const range = Math.max(maxLum - minLum, 1);

    if (adaptiveBinarization) {
      // Local window thresholding for extracting faint ink from form background
      const windowSize = 16;
      const halfWin = Math.floor(windowSize / 2);

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = y * w + x;
          const pixelLum = lums[idx];

          // Compute local mean in sliding window
          let sum = 0;
          let count = 0;
          for (let dy = -halfWin; dy <= halfWin; dy += 4) {
            const ny = y + dy;
            if (ny < 0 || ny >= h) continue;
            for (let dx = -halfWin; dx <= halfWin; dx += 4) {
              const nx = x + dx;
              if (nx < 0 || nx >= w) continue;
              sum += lums[ny * w + nx];
              count++;
            }
          }
          const localMean = count > 0 ? (sum / count) : 128;
          // If pixel is sufficiently darker than local paper background, emphasize ink (0), else clean white (255)
          const val = pixelLum < (localMean * 0.88) ? Math.max(0, pixelLum * 0.7) : 255;

          const pIdx = idx * 4;
          d[pIdx] = val;
          d[pIdx + 1] = val;
          d[pIdx + 2] = val;
        }
      }
    } else {
      // Standard linear contrast stretch
      for (let i = 0; i < d.length; i += 4) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        let adjusted = lum;

        if (enhanceContrast) {
          adjusted = ((lum - minLum) / range) * 255;
          adjusted = adjusted < 128 
            ? Math.max(0, adjusted * 0.9) 
            : Math.min(255, adjusted * 1.05);
        }

        const finalVal = Math.round(adjusted);
        d[i] = finalVal;
        d[i + 1] = finalVal;
        d[i + 2] = finalVal;
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Canvas toBlob conversion failed'));
      },
      'image/jpeg',
      0.92
    );
  });

  return {
    dataUrl,
    blob,
    width: canvas.width,
    height: canvas.height
  };
}

/**
 * Crops a sub-region from an image or canvas source and returns a new standalone canvas.
 * Used for targeted region-assisted handwriting extraction and interactive transcription.
 */
export function cropCanvasRegion(
  source: HTMLImageElement | HTMLCanvasElement,
  region: { x: number; y: number; width: number; height: number }
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const w = Math.max(10, Math.round(region.width));
  const h = Math.max(10, Math.round(region.height));
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(
      source,
      Math.max(0, region.x),
      Math.max(0, region.y),
      region.width,
      region.height,
      0,
      0,
      w,
      h
    );
  }
  return canvas;
}
