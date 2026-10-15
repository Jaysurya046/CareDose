/**
 * Local-First OCR Service using Tesseract.js.
 * Strictly executes on-device without any cloud connectivity.
 * 
 * IMPORTANT: OCR confidence metadata is a purely visual segmentation metric,
 * NOT clinical correctness. It is never used to confirm medical identity.
 */

import type { TextRecognitionResult, TextRecognitionSegment } from '../types';

export interface OcrProgressInfo {
  status: string;
  progress: number; // 0 to 1
}

let activeWorker: any = null;
let isCancelled = false;

/**
 * Initializes and retrieves a Tesseract.js worker instance.
 */
async function getOcrWorker(onProgress?: (info: OcrProgressInfo) => void) {
  if (activeWorker) {
    return activeWorker;
  }

  const { createWorker } = await import('tesseract.js');

  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (onProgress && typeof m.progress === 'number') {
        let label = m.status;
        if (m.status === 'recognizing text') label = 'Recognizing printed text...';
        else if (m.status === 'loading tesseract core') label = 'Loading recognition engine...';
        else if (m.status === 'loading language traineddata') label = 'Loading language data...';
        else if (m.status === 'initializing tesseract') label = 'Initializing engine...';

        onProgress({
          status: label,
          progress: Math.max(0, Math.min(1, m.progress))
        });
      }
    }
  });

  activeWorker = worker;
  return activeWorker;
}

/**
 * Cancels any active OCR recognition job and cleans up worker resources.
 */
export async function cancelOcr(): Promise<void> {
  isCancelled = true;
  if (activeWorker) {
    try {
      await activeWorker.terminate();
    } catch {
      // Ignore cleanup error
    }
    activeWorker = null;
  }
}

/**
 * Runs local OCR on an image source (data URL, Blob, or Canvas).
 */
export async function recognizePrintedText(
  imageSource: string | Blob | HTMLCanvasElement,
  onProgress?: (info: OcrProgressInfo) => void
): Promise<TextRecognitionResult> {
  isCancelled = false;

  const worker = await getOcrWorker(onProgress);

  if (isCancelled) {
    throw new Error('OCR recognition was cancelled by user');
  }

  const result = await worker.recognize(imageSource);

  if (isCancelled) {
    throw new Error('OCR recognition was cancelled by user');
  }

  const rawText = result.data.text || '';
  const overallConfidence = typeof result.data.confidence === 'number' ? result.data.confidence : undefined;

  // Extract structured word and line segments with bounding boxes
  const segments: TextRecognitionSegment[] = [];

  if (Array.isArray(result.data.words)) {
    for (const w of result.data.words) {
      if (!w.text || !w.text.trim()) continue;

      const bbox = w.bbox ? {
        x: Math.round(w.bbox.x0),
        y: Math.round(w.bbox.y0),
        width: Math.round(w.bbox.x1 - w.bbox.x0),
        height: Math.round(w.bbox.y1 - w.bbox.y0)
      } : undefined;

      // Words with very low OCR confidence or high character anomalies
      // are potential handwriting candidates or damaged text
      const isUnclear = (typeof w.confidence === 'number' && w.confidence < 60);

      segments.push({
        text: w.text.trim(),
        confidence: w.confidence,
        bbox,
        isHandwritingCandidate: isUnclear
      });
    }
  }

  return {
    text: rawText,
    source: 'ocr',
    confidence: overallConfidence,
    segments
  };
}

/**
 * Terminates the OCR worker to release memory when scanning session closes.
 */
export async function terminateOcrWorker(): Promise<void> {
  if (activeWorker) {
    try {
      await activeWorker.terminate();
    } catch {
      // Ignore
    }
    activeWorker = null;
  }
}
