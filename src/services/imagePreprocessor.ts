/**
 * Local-First Image Preprocessing for Prescription Recognition.
 * Operates purely on client-side HTML5 Canvas.
 * No data or images are ever transmitted to external servers.
 */

export interface PreprocessOptions {
  rotateDegrees?: number; // 0, 90, 180, 270
  grayscale?: boolean;
  enhanceContrast?: boolean;
  maxDimension?: number;
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
    maxDimension = 2048
  } = options;

  let srcWidth = imageSource instanceof HTMLImageElement ? imageSource.naturalWidth : imageSource.width;
  let srcHeight = imageSource instanceof HTMLImageElement ? imageSource.naturalHeight : imageSource.height;

  // Compute scaled dimensions respecting maxDimension
  let scale = 1;
  const largest = Math.max(srcWidth, srcHeight);
  if (largest > maxDimension) {
    scale = maxDimension / largest;
  }
  const scaledWidth = Math.round(srcWidth * scale);
  const scaledHeight = Math.round(srcHeight * scale);

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

  // Apply rotation
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotateDegrees * Math.PI) / 180);
  ctx.drawImage(
    imageSource,
    -scaledWidth / 2,
    -scaledHeight / 2,
    scaledWidth,
    scaledHeight
  );
  ctx.restore();

  // Pixel-level adjustments if grayscale or contrast enhancement enabled
  if (grayscale || enhanceContrast) {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;

    // First pass: Compute luminance and min/max for dynamic contrast stretching
    let minLum = 255;
    let maxLum = 0;

    for (let i = 0; i < d.length; i += 4) {
      // Human perceptual luminance formula
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
    }

    const range = Math.max(maxLum - minLum, 1);

    // Second pass: apply linear contrast stretch and convert to high-clarity grayscale
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      let adjusted = lum;

      if (enhanceContrast) {
        // Stretch contrast to use full 0-255 spectrum
        adjusted = ((lum - minLum) / range) * 255;
        // Subtle S-curve to darken ink while keeping paper background clean
        adjusted = adjusted < 128 
          ? Math.max(0, adjusted * 0.9) 
          : Math.min(255, adjusted * 1.05);
      }

      const finalVal = Math.round(adjusted);
      d[i] = finalVal;     // R
      d[i + 1] = finalVal; // G
      d[i + 2] = finalVal; // B
      // d[i + 3] (Alpha) unchanged
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
