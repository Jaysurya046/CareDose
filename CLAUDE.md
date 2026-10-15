# CareDose — Claude Code Project Guidelines

> **Project:** CareDose  
> **Architecture:** Local-first, client-side healthcare application  
> **Stack:** Vite · TypeScript · Vanilla CSS  
> **Priority:** Patient Safety > Data Privacy > Accessibility > Reliability > Visual Polish

## 1. Mission & Product Philosophy

CareDose is an accessible, privacy-conscious medication management application designed for patients, elderly users, and family caregivers.

### Core Capabilities
- **Medication Management:** Add, edit, organize, and track medication schedules.
- **Interaction Screening:** Identify potential drug-drug interactions using a curated offline safety dataset.
- **Medication Recognition:** Display recognizable pill illustrations based on user-entered appearance details.
- **Emergency Medical Sheet:** Generate print-ready medication summaries for caregivers and emergency responders.
- **Accessibility:** Provide a comfortable experience for elderly users and people with visual or motor impairments.

### Product Principles
1. **Safety First:** Never present incomplete medical information as a definitive safety conclusion.
2. **Local by Default:** Keep patient profiles, schedules, and health records on the user's device.
3. **Clarity Over Cleverness:** Prioritize understandable interfaces over decorative complexity.
4. **Offline Resilience:** Core medication management must function without internet access.
5. **Low Cognitive Load:** Keep navigation predictable, language simple, and critical actions obvious.

---

## 2. Technical Architecture

### Technology Stack
- **Frontend:** Vite + TypeScript
- **Styling:** Vanilla CSS with centralized design tokens and reusable components
- **Persistence:** Browser `localStorage`
- **Drug Search:** NIH RxNorm/RxNav terminology API
- **Interaction Engine:** Local, deterministic, curated interaction dataset
- **Testing:** Existing project test framework; prefer focused unit tests
- **Printing:** Native browser print functionality with dedicated CSS

### Suggested Module Boundaries

```text
src/
├── components/       # Reusable UI elements
├── features/         # Medication, schedule, safety, emergency sheet
├── engine/           # Pure medication safety and scheduling logic
├── data/             # Curated offline reference data
├── services/         # RxNorm API integration
├── storage/          # Persistence, validation, migrations
├── styles/           # Design tokens, layout, accessibility, print
├── types/            # Shared TypeScript interfaces
└── utils/            # Shared pure utilities
```

Adapt to the existing repository. Never reorganize working code solely to match this structure.

### Architecture Rules
- Keep business logic separate from presentation logic.
- Implement interaction screening as pure, deterministic functions.
- Use explicit TypeScript types; avoid `any` unless unavoidable and justified.
- Validate external API responses and persisted data before use.
- Centralize storage access and handle corrupted or missing records.
- Version persisted data schemas and support safe migrations.
- Avoid unnecessary dependencies, frameworks, and abstractions.
- Preserve existing functionality during refactoring.

---

## 3. Privacy & Security Requirements

**Privacy is a fundamental product requirement, not an optional feature.**

- Store patient names, medication lists, schedules, and emergency details locally.
- Never transmit patient profiles or complete medication lists to third-party services.
- Remote RxNorm autocomplete may transmit the specific search term entered by the user. Do not attach patient identifiers or unrelated health information.
- Keep interaction screening entirely local.
- Do not introduce analytics, tracking scripts, remote logging, or telemetry without explicit approval.
- Never log sensitive health records to the console in production.
- Provide clear export and permanent local-data deletion controls.
- Treat `localStorage` as unencrypted browser storage, **not a secure medical vault**.
- Do not claim HIPAA compliance, encryption, or absolute privacy without verified implementation.

**Network failure:** Medication lists, saved schedules, interaction screening, and emergency sheets must remain usable independently of RxNorm availability.

---

## 4. Medication Safety & Interaction Engine

Location: `src/engine/`

### Mandatory Safety Rules
1. Normalize medication identifiers using available RxNorm terminology where applicable.
2. Prefer ingredient-level matching for interaction rules.
3. Use only curated interaction records with documented sources.
4. Preserve interaction severity, evidence limitations, and source information.
5. Never invent interaction severity, clinical advice, contraindications, or dosage recommendations.
6. Distinguish clearly between:
   - Known interaction detected
   - No interaction found in the available dataset
   - Interaction not assessed / insufficient information
7. Never interpret missing data as evidence that two drugs are safe together.
8. Never recommend stopping, replacing, or adjusting prescribed medication without clinical guidance.

### Engine Requirements
- Pure functions with predictable inputs and outputs.
- No network calls or DOM access inside safety logic.
- Deterministic behavior for identical inputs.
- Explicit handling of unknown medications and missing identifiers.
- Dedicated tests for known interactions, missing data, duplicates, and normalization.

### Medical Disclaimer
Interaction screening is informational and **not a substitute for a pharmacist or qualified healthcare professional**.

Use calm, factual warning language. Avoid unnecessary alarm or false reassurance.

---

## 5. Anti-Slop UI & Design System

**Visual Direction:** Clinical minimalism, accessibility, clarity, and professional healthcare credibility.

### Design Language
- Clean, structured layouts with deliberate spacing.
- Light, neutral surfaces with trustworthy slate and teal accents.
- Crisp 1px borders and subtle, functional elevation.
- Strong typographic hierarchy and restrained visual decoration.
- Consistent component sizes, alignment, and spacing.

### Color Tokens

| Purpose | Color |
|---|---|
| Primary / Healthcare Teal | `#0F766E` |
| Success | `#059669` |
| Warning | `#D97706` |
| Critical / Danger | `#E11D48` |
| Primary Text | `#0F172A` |
| Secondary Text | `#475569` |
| Border | `#CBD5E1` |
| Background | `#F8FAFC` |

Define these through CSS custom properties rather than scattered hardcoded values.

All foreground/background combinations must be checked for accessible contrast. Do not assume the palette is automatically WCAG compliant.

### Strictly Avoid
- Generic purple/indigo gradients.
- Excessive glassmorphism or blurred backgrounds.
- Oversized shadows, decorative blobs, and unnecessary animations.
- Endless identical card grids without information hierarchy.
- Tiny labels, low-contrast placeholder text, and icon-only ambiguous buttons.
- Emojis as substitutes for professional interface icons.
- Decorative dashboards that bury essential tasks.

### Preferred UI Patterns
- Clear page titles and concise supporting descriptions.
- Purposeful sections instead of excessive nested cards.
- Dense but readable medication tables or lists.
- Clear primary actions with restrained secondary controls.
- Useful empty states explaining the next action.
- Inline validation and actionable error messages.
- Responsive layouts without unnecessary mobile-only abstractions.

**Design Decision Rule:** Every visual element must improve readability, navigation, comprehension, or task completion.

---

## 6. Medication Visualization

Provide tactile, recognizable pill illustrations supporting:

- Capsule
- Round tablet
- Oval tablet
- Scored / split tablet

### Requirements
- Support user-specified pill colors and shapes.
- Use consistent proportions and recognizable silhouettes.
- Maintain clarity at small sizes and across themes.
- Include accessible text labels independent of color.
- Do not rely exclusively on visual appearance to distinguish medications.
- Never present generated illustrations as verified pill identification.

Pill illustrations are **visual memory aids**, not authoritative medication identification tools.

---

## 7. Accessibility Standards

**Target:** WCAG 2.2 AA as the minimum development baseline; pursue AAA criteria wherever practical and verifiable.

### Mandatory Requirements
- Support text scaling presets: **100%, 125%, 150%**.
- Provide a high-contrast viewing mode.
- Aim for minimum **48 × 48px** interactive touch targets.
- Support full keyboard navigation.
- Show visible focus indicators on interactive elements.
- Use semantic HTML and meaningful accessible names.
- Associate form labels and validation errors correctly.
- Never communicate medication severity using color alone.
- Respect `prefers-reduced-motion`.
- Avoid unnecessary time-limited interactions.
- Ensure responsive content does not require horizontal scrolling at common mobile widths.

### Elderly-Friendly Interaction
- Prioritize large, readable text.
- Use familiar action labels.
- Minimize multi-step forms.
- Avoid hidden actions and ambiguous gestures.
- Confirm destructive operations.
- Keep essential medication details visible without requiring hover.

Accessibility must be tested, not assumed.

---

## 8. Emergency Sheet & Print Engine

Printing is a **first-class feature**, not an afterthought.

### Requirements
- Provide dedicated `@media print` styling.
- Support A4 and US Letter paper sizes.
- Use print-safe black-and-white layouts.
- Remove navigation, buttons, and decorative UI.
- Avoid splitting medication rows across pages where practical.
- Maintain readable font sizes and clear section headings.
- Display explicitly provided emergency contacts and medical details.
- Clearly identify the date the sheet was generated.
- Avoid printing information not included or approved by the user.
- Handle missing fields gracefully without fabricating data.

### Print Quality Goal
The printed sheet should remain understandable to a responder who has never used CareDose.

---

## 9. Performance & Reliability

- Keep initial bundle size small.
- Prefer native browser capabilities over additional libraries.
- Debounce remote medication autocomplete requests.
- Handle API timeouts, rate limits, and unavailable results gracefully.
- Never block local medication management because of API failures.
- Handle schedule calculations carefully around time zones, date changes, and daylight-saving transitions.
- Prevent silent data loss.
- Provide explicit feedback after saving or deleting important records.
- Avoid unnecessary rerenders and expensive synchronous operations.

---

## 10. Claude Code Workflow & Token Economy

### Before Editing
1. Understand the specific task and identify relevant files.
2. Read `package.json` and existing conventions when necessary.
3. Inspect targeted files instead of loading entire directories.
4. Reuse existing functions, components, and design tokens.
5. For substantial changes, state a short implementation plan.
6. Prefer the smallest implementation that fully solves the task.

### During Implementation
- Make surgical patches instead of rewriting working modules.
- Keep modules focused; aim for **under 200 lines per file** where practical.
- Do not split cohesive code merely to meet a line count.
- Avoid unrelated refactoring.
- Do not introduce unnecessary dependencies.
- Do not duplicate business logic.
- Maintain TypeScript type safety.
- Keep UI, storage, API, and interaction logic separated.
- Update existing tests when behavior changes.

### Token Efficiency
- Avoid rereading unchanged files.
- Search for symbols and references before opening large files.
- Prefer focused commands and targeted output.
- Do not repeatedly inspect dependency folders, build output, or generated files.
- Provide concise progress updates rather than lengthy reasoning.
- Do not generate redundant documentation after every minor change.
- Summarize decisions and remaining issues when finishing complex work.

### Safety Constraints
- Do not delete user data without explicit authorization.
- Do not silently modify medication safety rules.
- Do not replace verified source data with invented examples.
- Do not change dependencies, architecture, or data schemas without a concrete reason.
- Never claim a test passed unless it actually ran.

---

## 11. Testing & Quality Gates

Before completing a meaningful change:

- **Type Safety:** Run the project's TypeScript checks.
- **Build:** Run `npm run build` when applicable.
- **Tests:** Run relevant existing tests or `npm run test` if available.
- **Interaction Engine:** Validate known, unknown, and missing-data scenarios.
- **Accessibility:** Check labels, keyboard interaction, focus states, and contrast.
- **Responsiveness:** Review mobile and desktop layouts for significant UI changes.
- **Printing:** Verify actual print layout when emergency-sheet behavior changes.
- **Privacy:** Confirm new functionality does not unexpectedly transmit sensitive data.

Check `package.json` for available scripts. Do not invent successful test results or assume every script exists.

**Completion Report:** Briefly state what changed, what was tested, and any remaining limitations.

---

## 12. Definition of Done

A task is complete only when:

1. The requested behavior works.
2. Existing functionality remains intact.
3. No known critical TypeScript or build errors were introduced.
4. Medication safety logic remains deterministic and appropriately cautious.
5. Sensitive data remains protected according to the local-first architecture.
6. The UI follows CareDose design and accessibility standards.
7. Relevant tests have passed, or untested areas are clearly disclosed.
8. The implementation is maintainable without unnecessary complexity.

---

## 13. Final Engineering Principles

**Build CareDose as a trustworthy, usable healthcare companion — not a flashy demo.**

- Patient safety over feature quantity.
- Privacy over convenience.
- Accessibility over decoration.
- Clarity over cleverness.
- Verified information over confident guesses.
- Small, targeted changes over unnecessary rewrites.
- Real functionality over visual mockups.

When requirements conflict, prioritize safety, privacy, accessibility, and existing working behavior. Ask for clarification only when proceeding would create a material safety risk or require an irreversible decision.