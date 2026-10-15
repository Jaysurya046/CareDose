# CareDose - Claude Code Architecture & Guidelines

## Mission & Architecture
CareDose is an accessible, local-first web application designed for family caregivers and patients to manage daily medication schedules, prevent dangerous drug-drug interactions, and print emergency medical sheets for first responders.

- **Stack**: Vite + TypeScript + Vanilla CSS Design System.
- **Privacy**: 100% Client-Side / Local-First (`localStorage`). No patient health data is ever transmitted over the network.
- **APIs**: US National Library of Medicine (NIH RxNorm) for drug autocomplete, plus an embedded offline pharmacological safety matrix.

## Token Economy & Memory Rules
1. **Targeted Reading**: Keep files under 200 lines. Read and edit specific modules rather than whole directories.
2. **Deterministic Engine**: Drug interaction checks are pure functions in `src/engine/`. Test using `npm run test` or direct test scripts.
3. **Patching Over Rewriting**: Use surgical edits to preserve working UI logic.

## Anti-Slop UI Manifesto (Strict Quality Standards)
- **NO Slop**: No generic indigo/purple linear gradients, no oversized blurred drop shadows, no generic empty card layouts.
- **Clinical Minimalism**: High visual contrast, crisp 1px borders (`var(--border)`), calm trustworthy healthcare slate & teal, clear status colors (Emerald `#059669`, Amber `#D97706`, Ruby `#E11D48`).
- **Tactile Pill Badges**: Realistic physical pill shapes (Capsule, Round, Oval, Split) and pill colors so elderly patients can match what's on the screen with physical pills in their hands.
- **WCAG AAA Compliance**: High-contrast mode toggle, dynamic font-size scaler (100%, 125%, 150%), min 48px touch targets, full keyboard accessibility with explicit focus rings.
- **First-Class Print Engine**: Dedicated `@media print` layout engineered for standard 8.5x11 and A4 physical paper.
