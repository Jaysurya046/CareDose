# CareDose — Private, Local-First Medication Management & Safety Watchdog

> **CareDose** is an accessible, privacy-first medication management application designed for patients, elderly users, and family caregivers. It runs entirely on-device, providing intelligent prescription transcription assistance, automated drug-drug interaction screening, smart reminders, and a 1-click printable Emergency Medical Fridge Sheet.

---

## 🌟 Core Product Principles

1. **Patient Safety First:** CareDose assists with prescription organization and transcription. It **never guesses or invents clinical instructions**. Unresolved handwriting or ambiguous dosages strictly block active reminder scheduling until verified.
2. **Local by Default:** All patient profiles, medication schedules, adherence logs, and prescription document scans remain strictly on the user's device. No images, OCR text, or health data are transmitted to external servers or cloud APIs.
3. **Low Cognitive Load & Anti-Slop Design:** Built with high-contrast, clinical minimalism (trustworthy slate and healthcare teal). No decorative clutter, unnecessary animations, or ambiguous icon-only buttons.
4. **Accessible to All Generations:** Complies with WCAG 2.2 AA standards with font scaling presets (100%, 125%, 150%), high-contrast viewing mode, 48×48px touch targets, and full keyboard navigation.

---

## 🚀 Key Features

### 1. Daily Pillbox & Adherence Tracking
- Grouped by intuitive administration slots: **Morning**, **Midday**, **Evening**, and **Bedtime**.
- One-click dose marking with time-stamped adherence logging.
- Tactile visual pill badges (capsules, round, oval, and scored tablets) customizable by color to serve as recognizable visual memory aids.
- Daily progress summary with completion percentage.

### 2. Intelligent Prescription Scan & Safe Import (Phase 3)
- **Local-First Document Processing:** Upload prescription images (JPG, PNG, WebP) or digital/scanned multi-page PDFs (up to 5 pages, 10 MB limit) directly from your device or mobile camera.
- **Printed OCR & Ambiguity Detection:** Uses on-device Tesseract.js and PDF.js in isolated Web Workers.
- **Handwriting Recognition Abstraction:** Cautiously detects cursive, faded ink, low-confidence segments, and doctor signatures. If handwriting is illegible, CareDose flags it rather than making dangerous guesses.
- **Two-Column Review Workspace:**
  - **Left:** Original prescription viewer with zoom (`+`, `-`, `Reset`), pan, page navigation, and dynamic bounding-box highlights over the source text.
  - **Right:** Editable clinical fields (name, strength, dose quantity, form, frequency, slots, instructions, prescriber) with status tags (`Needs Review`, `Text Unclear`, `Unreadable`, `Confirmed`, `Clarified`).
  - **Mobile:** Tabbed switcher (`📄 Original Document` vs `💊 Extracted Medications`) preserving form edits seamlessly.
- **Prescriber/Pharmacist Clarification:** Record user-declared clarifications directly on ambiguous prescriptions.
- **Safe Import Pipeline:** Reconciles duplicates against your cabinet, verifies required fields, and badges imported records with a non-misleading **"User-Confirmed Rx"** tag.

### 3. Clinical Safety Watchdog
- Instantaneous, offline screening for potential drug-drug interactions using a curated clinical interaction dataset.
- Clear distinction between:
  - ⚠️ **Known interaction detected** (with clinical action guidelines and severity levels: Critical, Caution, Mild).
  - 🛡️ **No listed interaction found in local dataset** (with clear disclosure that this does not prove clinical safety).
  - ℹ️ **Interaction not assessed / Insufficient medications**.
- Pure deterministic engine with zero network dependencies.

### 4. Smart Medication Reminders
- Proactive reminders utilizing the native browser Notifications API and in-app banner alerts.
- Configurable snooze options (5, 10, or 15 minutes) and customizable slot clock times.
- Privacy guard option to hide sensitive medication names in lock-screen notifications.
- Automatically clears snoozed alerts when a dose is recorded in the Daily Pillbox.

### 5. Emergency Medical Fridge Sheet
- Print-ready summary designed for caregivers, family members, and first responders.
- Dedicated `@media print` black-and-white stylesheet optimized for standard Letter and A4 paper.
- Summarizes emergency contacts, blood type, known drug allergies, physician details, and complete active medication regimens with instructions.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Frontend Framework** | Vite + TypeScript |
| **Styling** | Vanilla CSS (Centralized Design Tokens, Anti-Slop System) |
| **Document Processing & OCR** | PDF.js (`pdfjs-dist`) + Tesseract.js (`tesseract.js`) |
| **Persistence** | LocalStorage with schema versioning, migrations, and validation |
| **Terminology & Autocomplete** | Curated offline catalog + optional NIH RxNav/RxNorm API |
| **Safety Engine** | Deterministic, pure TypeScript interaction evaluation |
| **Testing** | Vitest (40 unit and integration tests) |

---

## 📂 Project Structure

```text
src/
├── components/          # Reusable UI components
│   ├── DailyTimeline.ts            # Pillbox view & dose tracker
│   ├── MedicationCabinet.ts        # Regimen list & search
│   ├── PrescriptionUploadModal.ts  # File upload & preprocessing
│   ├── PrescriptionReviewModal.ts  # Two-column document review
│   ├── PrescriptionImportSummary.ts# Duplicate reconciliation & import
│   ├── ReminderBanner.ts           # In-app proactive reminder alerts
│   ├── ReminderSettings.ts         # User reminder preferences modal
│   ├── SafetyWatchdogBanner.ts     # Clinical interaction alerts
│   ├── FridgeSheet.ts              # Emergency sheet preview
│   └── Header.ts                   # Navigation & accessibility toggles
├── data/                # Curated offline healthcare datasets
│   ├── commonDrugs.ts              # Fast offline drug formulary
│   ├── defaultData.ts              # Seed data for new profiles
│   └── interactionRules.ts         # Clinical interaction matrix
├── engine/              # Pure business logic and safety checks
│   ├── prescriptionParser.ts       # Prescription parsing & ambiguity rules
│   ├── watchdog.ts                 # Deterministic drug interaction engine
│   ├── reminderScheduler.ts        # Next dose & reminder calculations
│   └── reminderCoordinator.ts      # Proactive reminder polling & delivery
├── services/            # Local document & API services
│   ├── ocrService.ts               # Tesseract.js worker controller
│   ├── pdfExtractor.ts             # PDF.js text & canvas renderer
│   ├── imagePreprocessor.ts        # Canvas contrast & rotation
│   ├── handwritingService.ts       # HTR abstraction & uncertainty flags
│   ├── notificationService.ts      # Browser Notification API wrapper
│   └── rxnorm.ts                   # Optional NIH RxNorm search
├── storage/             # Resilient local storage layer
│   └── storage.ts                  # Schema migrations, backups & wipe
├── store/               # In-memory reactive observable state
│   └── medStore.ts                 # Centralized state management
├── styles/              # Design tokens & modular CSS
│   ├── theme.css                   # Color tokens, fonts, radii
│   ├── layout.css                  # Grid, container, header
│   ├── components.css              # Cards, badges, buttons, inputs
│   ├── views.css                   # Cabinet, timeline, settings
│   ├── prescriptionScan.css        # Document review & upload styles
│   └── print.css                   # Emergency fridge sheet print styles
└── types/               # Strict TypeScript definitions
    └── index.ts                    # Shared types & safety interfaces
```

---

## ⚡ Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18.0 or higher recommended)
- `npm` (version 9.0 or higher)

### Installation
```bash
# Clone repository
git clone https://github.com/Jaysurya046/CareDose.git
cd openR_CC

# Install dependencies
npm install
```

### Running Locally
```bash
# Start Vite development server
npm run dev
```
Open your browser and navigate to `http://localhost:5173/`.

### Running Tests
```bash
# Run unit & integration test suites
npm run test
```

### Production Build
```bash
# Run TypeScript type check and compile bundle
npm run build
```

---

## ⌨️ Accessibility Keyboard Shortcuts

- <kbd>Alt</kbd> + <kbd>1</kbd>: Jump to **Daily Pillbox**
- <kbd>Alt</kbd> + <kbd>2</kbd>: Jump to **Medication Cabinet**
- <kbd>Alt</kbd> + <kbd>3</kbd>: Jump to **Emergency Fridge Sheet**
- <kbd>Tab</kbd> / <kbd>Shift</kbd> + <kbd>Tab</kbd>: Accessible sequential focus across all controls
- <kbd>Escape</kbd>: Close open modals and dialogs

---

## 🔒 Privacy & Security Commitments

- **No Remote Telemetry:** No user activity, keystrokes, or health decisions are tracked.
- **Client-Side Image Processing:** All document analysis via Tesseract and PDF.js executes in your browser's local sandbox. Prescription images are never uploaded to any server.
- **Data Export & Wipe:** You can export your complete health data as a JSON backup or permanently wipe all local records at any time from the Medication Cabinet.

---

## ⚕️ Medical Disclaimer

*CareDose is an organizational tool and transcription assistant designed to support patient self-care and caregiver coordination. It is **not** a licensed medical diagnostic device and does not substitute for professional medical advice, diagnosis, or clinical evaluation by a qualified healthcare provider or licensed pharmacist. Always verify prescribed regimens with your physician or pharmacist.*
