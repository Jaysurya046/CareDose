/**
 * Local-First PDF Text Extraction and Page Rendering Service.
 * Uses pdfjs-dist entirely on-device without remote calls.
 */

import type { TextRecognitionSegment } from '../types';

export interface ExtractedPdfPage {
  pageNumber: number;
  width: number;
  height: number;
  hasSelectableText: boolean;
  selectableText: string;
  segments: TextRecognitionSegment[];
  imageDataUrl: string;
}

export interface PdfExtractionResult {
  pageCount: number;
  pages: ExtractedPdfPage[];
  exceededPageLimit: boolean;
}

const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB limit
const MAX_PDF_PAGES = 5; // Max 5 pages

let pdfjsInitialized = false;

async function getPdfJsLib() {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfjsInitialized && typeof window !== 'undefined') {
    // Configure worker locally using standard Vite asset URL
    try {
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();
      }
    } catch {
      // Fallback if URL resolution fails
    }
    pdfjsInitialized = true;
  }
  return pdfjs;
}

/**
 * Extracts selectable text and renders visual page previews for local OCR.
 */
export async function processPdfDocument(
  file: File,
  onProgress?: (progressText: string, current: number, total: number) => void
): Promise<PdfExtractionResult> {
  if (file.size > MAX_PDF_SIZE_BYTES) {
    throw new Error(
      `File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 10 MB limit for on-device processing.`
    );
  }

  const pdfjs = await getPdfJsLib();
  const arrayBuffer = await file.arrayBuffer();

  let pdfDoc;
  try {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(arrayBuffer),
      useWorkerFetch: false,
      useSystemFonts: true
    });
    pdfDoc = await loadingTask.promise;
  } catch (err: unknown) {
    const errorMsg = (err instanceof Error) ? err.message : String(err);
    if (errorMsg.toLowerCase().includes('password')) {
      throw new Error('This PDF is encrypted with a password. Please provide an unencrypted prescription document.');
    }
    throw new Error(`Failed to parse PDF document: ${errorMsg}`);
  }

  const totalPagesInDoc = pdfDoc.numPages;
  const pagesToProcess = Math.min(totalPagesInDoc, MAX_PDF_PAGES);
  const exceededPageLimit = totalPagesInDoc > MAX_PDF_PAGES;

  const pages: ExtractedPdfPage[] = [];

  for (let pageNum = 1; pageNum <= pagesToProcess; pageNum++) {
    if (onProgress) {
      onProgress(`Processing page ${pageNum} of ${pagesToProcess}...`, pageNum, pagesToProcess);
    }

    const page = await pdfDoc.getPage(pageNum);
    // Standard rendering scale for high OCR and preview fidelity (2.0x DPI)
    const viewport = page.getViewport({ scale: 2.0 });

    // 1. Render to canvas for UI preview & OCR
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error(`Unable to obtain 2D canvas context for page ${pageNum}`);
    }

    // Fill white background for clean rendering
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvas,
      canvasContext: ctx,
      viewport
    }).promise;

    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.90);

    // 2. Extract native selectable text
    const textContent = await page.getTextContent();
    const textSegments: TextRecognitionSegment[] = [];
    const textLines: string[] = [];

    let currentLine = '';
    let lastY: number | null = null;

    for (const item of textContent.items) {
      if ('str' in item && typeof item.str === 'string') {
        const str = item.str;
        if (!str.trim()) continue;

        // Approximate position from item transform matrix [scaleX, skewY, skewX, scaleY, transX, transY]
        const tx = item.transform[4] * 2.0;
        const ty = (page.view[3] - item.transform[5]) * 2.0; // Invert Y
        const itemWidth = (item.width || 50) * 2.0;
        const itemHeight = (item.height || 14) * 2.0;

        textSegments.push({
          text: str,
          bbox: {
            x: Math.max(0, Math.round(tx)),
            y: Math.max(0, Math.round(ty)),
            width: Math.round(itemWidth),
            height: Math.round(itemHeight),
            page: pageNum
          }
        });

        if (lastY !== null && Math.abs(ty - lastY) > 10) {
          if (currentLine.trim()) textLines.push(currentLine.trim());
          currentLine = str;
        } else {
          currentLine += (currentLine ? ' ' : '') + str;
        }
        lastY = ty;
      }
    }
    if (currentLine.trim()) {
      textLines.push(currentLine.trim());
    }

    const selectableText = textLines.join('\n');
    const hasSelectableText = selectableText.trim().length > 30; // Threshold for substantive native text

    pages.push({
      pageNumber: pageNum,
      width: canvas.width,
      height: canvas.height,
      hasSelectableText,
      selectableText,
      segments: textSegments,
      imageDataUrl
    });
  }

  return {
    pageCount: pagesToProcess,
    pages,
    exceededPageLimit
  };
}
