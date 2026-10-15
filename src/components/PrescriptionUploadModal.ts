/**
 * CareDose — Prescription Upload & On-Device Processing Modal.
 * Local-First, Zero Cloud Transmission, Accessible Controls.
 */

import type { PrescriptionScanSession, TextRecognitionSegment } from '../types';
import { generateLocalId } from '../utils/sanitize';
import { loadImageFromFile, preprocessImage } from '../services/imagePreprocessor';
import { processPdfDocument } from '../services/pdfExtractor';
import { recognizePrintedText, cancelOcr } from '../services/ocrService';
import { analyzeHandwritingEvidence, reconcileRecognitionEvidence } from '../services/handwritingService';
import { parsePrescriptionText } from '../engine/prescriptionParser';
import { openPrescriptionReviewModal } from './PrescriptionReviewModal';
import { openMedicationModal } from './MedicationModal';

export function openPrescriptionUploadModal(onSuccess?: () => void): void {
  // Remove any existing modal
  const existing = document.getElementById('rx-upload-modal');
  if (existing) existing.remove();

  const modalBackdrop = document.createElement('div');
  modalBackdrop.id = 'rx-upload-modal';
  modalBackdrop.className = 'rx-modal-backdrop';
  modalBackdrop.setAttribute('role', 'dialog');
  modalBackdrop.setAttribute('aria-modal', 'true');
  modalBackdrop.setAttribute('aria-labelledby', 'rx-upload-title');

  let selectedFile: File | null = null;
  let currentRotation = 0;
  let useHighContrast = true;
  let isScanning = false;
  let previewDataUrl: string | null = null;

  modalBackdrop.innerHTML = `
    <div class="rx-modal-card upload-dialog" tabindex="-1">
      <div class="rx-modal-header">
        <div class="rx-modal-title-group">
          <h2 id="rx-upload-title">Scan Prescription</h2>
          <p>Local-first prescription digitizer. All image processing stays on your device.</p>
        </div>
        <button type="button" class="rx-modal-close-btn" id="btn-close-upload" aria-label="Close prescription scanner">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="rx-upload-body" id="rx-modal-content">
        <!-- Dropzone Initial State -->
        <div id="rx-dropzone-view">
          <div class="rx-dropzone" id="rx-dropzone" role="button" tabindex="0" aria-label="Upload prescription image or PDF. Click or drag and drop.">
            <div class="rx-dropzone-icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
            </div>
            <div class="rx-dropzone-text">
              <h3>Drop prescription document here</h3>
              <p>Supports JPG, PNG, WebP, or PDF (Max 10 MB, up to 5 pages)</p>
            </div>
            <input type="file" id="rx-file-input" accept="image/jpeg,image/png,image/webp,application/pdf" style="display: none;" />
            <input type="file" id="rx-camera-input" accept="image/*" capture="environment" style="display: none;" />
          </div>

          <div class="rx-upload-actions-grid" style="margin-top: 1rem;">
            <button type="button" class="btn btn-secondary" id="btn-trigger-picker">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
              <span>Upload Document</span>
            </button>
            <button type="button" class="btn btn-secondary" id="btn-trigger-camera">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="4"></circle>
              </svg>
              <span>Take Photo</span>
            </button>
          </div>

          <div style="text-align: center; margin-top: 1.25rem;">
            <button type="button" class="btn btn-link" id="btn-enter-manually" style="font-size: 0.875rem; color: var(--text-muted);">
              Or enter prescription details manually
            </button>
          </div>
        </div>

        <!-- File Selected Preview & Enhancement State -->
        <div id="rx-preview-view" style="display: none;">
          <div class="rx-preview-container">
            <div class="rx-preproc-toolbar">
              <span id="rx-file-name-label" style="font-size: 0.875rem; font-weight: 600; color: var(--text-main);"></span>
              <div style="display: flex; gap: 0.5rem;">
                <button type="button" class="btn btn-secondary btn-sm" id="btn-rotate-img" title="Rotate document 90 degrees">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                  </svg>
                  <span>Rotate</span>
                </button>
                <button type="button" class="btn btn-secondary btn-sm" id="btn-contrast-toggle" title="Toggle high contrast grayscale enhancement">
                  <span>Contrast: High</span>
                </button>
                <button type="button" class="btn btn-secondary btn-sm" id="btn-replace-file" style="color: var(--status-critical-text);">
                  <span>Replace</span>
                </button>
              </div>
            </div>

            <div class="rx-preview-box">
              <img id="rx-preview-img" alt="Prescription preview for local analysis" />
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1rem;">
            <button type="button" class="btn btn-secondary" id="btn-cancel-preview">Cancel</button>
            <button type="button" class="btn btn-primary" id="btn-start-scan">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              <span>Scan &amp; Extract Medications</span>
            </button>
          </div>
        </div>

        <!-- Processing Progress State -->
        <div id="rx-progress-view" style="display: none;">
          <div class="rx-progress-wrap">
            <div class="rx-progress-bar-bg" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
              <div class="rx-progress-bar-fill" id="rx-progress-fill" style="width: 5%;"></div>
            </div>
            <div class="rx-progress-status" id="rx-progress-text">Initializing on-device engine...</div>
            <p style="font-size: 0.8125rem; color: var(--text-muted); max-width: 420px;">
              Your prescription is processed entirely within this browser. No images are uploaded to any server or AI service.
            </p>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-scan" style="margin-top: 0.5rem;">
              Cancel Scan
            </button>
          </div>
        </div>

        <!-- Error State -->
        <div id="rx-error-view" style="display: none;">
          <div class="rx-notice-banner notice-critical">
            <div>
              <strong style="display: block;">Unable to Process Prescription</strong>
              <span id="rx-error-message"></span>
            </div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-retry-upload" style="margin-top: 1rem;">
            Try Another Document
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modalBackdrop);

  // Focus trap / keyboard escape handler
  const closeBtn = modalBackdrop.querySelector('#btn-close-upload') as HTMLButtonElement;
  closeBtn?.focus();

  const cleanup = () => {
    if (isScanning) {
      cancelOcr();
    }
    modalBackdrop.remove();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !isScanning) {
      cleanup();
      window.removeEventListener('keydown', onKeyDown);
    }
  };
  window.addEventListener('keydown', onKeyDown);

  closeBtn.addEventListener('click', () => {
    cleanup();
    window.removeEventListener('keydown', onKeyDown);
  });

  // Views references
  const dropzoneView = modalBackdrop.querySelector('#rx-dropzone-view') as HTMLElement;
  const previewView = modalBackdrop.querySelector('#rx-preview-view') as HTMLElement;
  const progressView = modalBackdrop.querySelector('#rx-progress-view') as HTMLElement;
  const errorView = modalBackdrop.querySelector('#rx-error-view') as HTMLElement;

  const fileInput = modalBackdrop.querySelector('#rx-file-input') as HTMLInputElement;
  const cameraInput = modalBackdrop.querySelector('#rx-camera-input') as HTMLInputElement;
  const dropzone = modalBackdrop.querySelector('#rx-dropzone') as HTMLElement;
  const previewImg = modalBackdrop.querySelector('#rx-preview-img') as HTMLImageElement;
  const fileNameLabel = modalBackdrop.querySelector('#rx-file-name-label') as HTMLElement;

  const progressFill = modalBackdrop.querySelector('#rx-progress-fill') as HTMLElement;
  const progressText = modalBackdrop.querySelector('#rx-progress-text') as HTMLElement;
  const errorMessage = modalBackdrop.querySelector('#rx-error-message') as HTMLElement;

  const showView = (view: 'dropzone' | 'preview' | 'progress' | 'error') => {
    dropzoneView.style.display = view === 'dropzone' ? 'block' : 'none';
    previewView.style.display = view === 'preview' ? 'block' : 'none';
    progressView.style.display = view === 'progress' ? 'block' : 'none';
    errorView.style.display = view === 'error' ? 'block' : 'none';
  };

  const showError = (msg: string) => {
    errorMessage.textContent = msg;
    showView('error');
  };

  // Manual entry shortcut
  modalBackdrop.querySelector('#btn-enter-manually')?.addEventListener('click', () => {
    cleanup();
    openMedicationModal(undefined, onSuccess);
  });

  modalBackdrop.querySelector('#btn-retry-upload')?.addEventListener('click', () => {
    selectedFile = null;
    showView('dropzone');
  });

  // File selection handling
  const handleFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      showError(`File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 10 MB limit.`);
      return;
    }

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(file.name);

    if (!isPdf && !isImage) {
      showError('Please upload an image file (JPG, PNG, WebP) or a PDF document.');
      return;
    }

    selectedFile = file;
    fileNameLabel.textContent = `${file.name} (${(file.size / 1024).toFixed(0)} KB)`;

    if (isImage) {
      try {
        const img = await loadImageFromFile(file);
        const { dataUrl } = await preprocessImage(img, {
          rotateDegrees: currentRotation,
          grayscale: useHighContrast,
          enhanceContrast: useHighContrast
        });
        previewDataUrl = dataUrl;
        previewImg.src = dataUrl;
        showView('preview');
      } catch (err: any) {
        showError(`Failed to load image: ${err.message || err}`);
      }
    } else {
      // PDF document preview: render page 1 thumbnail
      try {
        progressText.textContent = 'Rendering PDF document preview...';
        showView('progress');
        const pdfResult = await processPdfDocument(file);
        if (pdfResult.pages.length > 0) {
          previewDataUrl = pdfResult.pages[0].imageDataUrl;
          previewImg.src = previewDataUrl;
          showView('preview');
        } else {
          showError('No pages could be extracted from this PDF.');
        }
      } catch (err: any) {
        showError(`PDF error: ${err.message || err}`);
      }
    }
  };

  // Dropzone drag-and-drop
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('is-dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('is-dragover');
    if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  dropzone.addEventListener('click', () => fileInput.click());
  modalBackdrop.querySelector('#btn-trigger-picker')?.addEventListener('click', () => fileInput.click());
  modalBackdrop.querySelector('#btn-trigger-camera')?.addEventListener('click', () => cameraInput.click());

  fileInput.addEventListener('change', () => {
    if (fileInput.files?.[0]) handleFile(fileInput.files[0]);
  });
  cameraInput.addEventListener('change', () => {
    if (cameraInput.files?.[0]) handleFile(cameraInput.files[0]);
  });

  // Preprocessing controls
  modalBackdrop.querySelector('#btn-rotate-img')?.addEventListener('click', async () => {
    if (!selectedFile || selectedFile.type === 'application/pdf') return;
    currentRotation = (currentRotation + 90) % 360;
    const img = await loadImageFromFile(selectedFile);
    const { dataUrl } = await preprocessImage(img, {
      rotateDegrees: currentRotation,
      grayscale: useHighContrast,
      enhanceContrast: useHighContrast
    });
    previewDataUrl = dataUrl;
    previewImg.src = dataUrl;
  });

  const contrastBtn = modalBackdrop.querySelector('#btn-contrast-toggle') as HTMLButtonElement;
  contrastBtn?.addEventListener('click', async () => {
    if (!selectedFile || selectedFile.type === 'application/pdf') return;
    useHighContrast = !useHighContrast;
    contrastBtn.textContent = useHighContrast ? 'Contrast: High' : 'Contrast: Normal';
    const img = await loadImageFromFile(selectedFile);
    const { dataUrl } = await preprocessImage(img, {
      rotateDegrees: currentRotation,
      grayscale: useHighContrast,
      enhanceContrast: useHighContrast
    });
    previewDataUrl = dataUrl;
    previewImg.src = dataUrl;
  });

  modalBackdrop.querySelector('#btn-replace-file')?.addEventListener('click', () => {
    selectedFile = null;
    showView('dropzone');
  });

  modalBackdrop.querySelector('#btn-cancel-preview')?.addEventListener('click', () => {
    cleanup();
  });

  modalBackdrop.querySelector('#btn-cancel-scan')?.addEventListener('click', () => {
    cancelOcr();
    isScanning = false;
    showView('preview');
  });

  // Start Scan & Analysis
  modalBackdrop.querySelector('#btn-start-scan')?.addEventListener('click', async () => {
    if (!selectedFile) return;

    isScanning = true;
    showView('progress');
    progressFill.style.width = '10%';
    progressText.textContent = 'Preparing prescription image...';

    const sessionId = generateLocalId('session');
    const isPdf = selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf');

    try {
      let pagesData: Array<{
        pageNumber: number;
        imageDataUrl: string;
        rawText: string;
        segments: TextRecognitionSegment[];
      }> = [];

      if (isPdf) {
        progressText.textContent = 'Extracting pages from PDF document...';
        progressFill.style.width = '20%';

        const pdfResult = await processPdfDocument(selectedFile, (status, curr, total) => {
          progressText.textContent = status;
          progressFill.style.width = `${Math.round(20 + (curr / total) * 30)}%`;
        });

        // For each page, if it has native text use it; otherwise run OCR on canvas
        for (let i = 0; i < pdfResult.pages.length; i++) {
          const page = pdfResult.pages[i];
          let pageText = page.selectableText;
          let pageSegments = page.segments;

          if (!page.hasSelectableText) {
            progressText.textContent = `Running local OCR on scanned PDF page ${page.pageNumber}...`;
            const ocrResult = await recognizePrintedText(page.imageDataUrl, (info) => {
              progressText.textContent = `Page ${page.pageNumber}: ${info.status}`;
            });
            pageText = ocrResult.text;
            pageSegments = ocrResult.segments || [];
          }

          pagesData.push({
            pageNumber: page.pageNumber,
            imageDataUrl: page.imageDataUrl,
            rawText: pageText,
            segments: pageSegments
          });
        }
      } else {
        // Image Processing
        progressFill.style.width = '25%';
        progressText.textContent = 'Preprocessing image for recognition...';

        const rawImg = await loadImageFromFile(selectedFile);
        const preprocessed = await preprocessImage(rawImg, {
          rotateDegrees: currentRotation,
          grayscale: useHighContrast,
          enhanceContrast: useHighContrast
        });

        progressFill.style.width = '40%';
        progressText.textContent = 'Running printed-text recognition engine...';

        const ocrResult = await recognizePrintedText(preprocessed.dataUrl, (info) => {
          progressText.textContent = info.status;
          progressFill.style.width = `${Math.round(40 + info.progress * 35)}%`;
        });

        // Analyze handwriting evidence and cursive stroke characteristics
        progressFill.style.width = '80%';
        progressText.textContent = 'Checking for handwritten clinical annotations...';

        // Reconcile OCR segments with handwriting analysis
        const canvas = document.createElement('canvas');
        canvas.width = preprocessed.width;
        canvas.height = preprocessed.height;

        const hwAnalysis = await analyzeHandwritingEvidence(canvas, ocrResult.segments || []);
        const { reconciledText, annotatedSegments } = reconcileRecognitionEvidence(
          ocrResult.text,
          ocrResult.segments || [],
          hwAnalysis
        );

        pagesData.push({
          pageNumber: 1,
          imageDataUrl: preprocessed.dataUrl,
          rawText: reconciledText,
          segments: annotatedSegments
        });
      }

      progressFill.style.width = '90%';
      progressText.textContent = 'Extracting medication fields and checking ambiguities...';

      // Combine text from all pages
      const combinedText = pagesData.map(p => p.rawText).join('\n\n');
      const allSegments = pagesData.flatMap(p => p.segments);

      const drafts = parsePrescriptionText(combinedText, allSegments);

      progressFill.style.width = '100%';
      isScanning = false;

      const scanSession: PrescriptionScanSession = {
        id: sessionId,
        fileName: selectedFile.name,
        fileType: isPdf ? 'pdf' : 'image',
        fileSize: selectedFile.size,
        pageCount: pagesData.length,
        currentPage: 1,
        pages: pagesData,
        drafts,
        createdAt: new Date().toISOString()
      };

      // Close upload modal and transition into Verification Review Workspace
      cleanup();
      openPrescriptionReviewModal(scanSession, onSuccess);

    } catch (err: any) {
      isScanning = false;
      showError(err.message || 'An error occurred during local document analysis.');
    }
  });
}
