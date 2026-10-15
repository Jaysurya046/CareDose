import type { PillShape, PillColor, PillVisual } from '../types';
import { createPillBadgeHTML } from './PillBadge';

const SHAPES: PillShape[] = ['round', 'capsule', 'oval', 'split'];
const COLORS: PillColor[] = ['white', 'pink', 'blue', 'yellow', 'orange', 'green', 'purple', 'red'];

export interface PillVisualSelectorState {
  shape: PillShape;
  color: PillColor;
}

/**
 * Renders the pill visual appearance picker and binds interactive selection events.
 */
export function renderPillVisualSelector(
  container: HTMLElement,
  initial: PillVisual,
  onChange: (visual: PillVisual) => void
): () => PillVisual {
  let currentShape: PillShape = initial.shape || 'round';
  let currentColor: PillColor = initial.color || 'white';

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
      <label class="form-label" style="margin-bottom: 0;">Physical Pill Appearance Badge</label>
      <div id="live-pill-preview" style="display: flex; align-items: center; gap: 0.5rem;">
        <span style="font-size: 0.8125rem; color: var(--text-muted);">Preview:</span>
        <div id="preview-badge-slot">
          ${createPillBadgeHTML({ shape: currentShape, color: currentColor }, 'large')}
        </div>
      </div>
    </div>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
      <div>
        <span class="form-hint" style="display: block; margin-bottom: 0.25rem;">Pill Shape:</span>
        <div class="shape-selector" id="shape-selector">
          ${SHAPES.map(s => `
            <button type="button" class="btn btn-secondary btn-sm shape-opt ${s === currentShape ? 'selected' : ''}" data-shape="${s}">
              ${s}
            </button>
          `).join('')}
        </div>
      </div>

      <div>
        <span class="form-hint" style="display: block; margin-bottom: 0.25rem;">Pill Color:</span>
        <div class="color-selector" id="color-selector">
          ${COLORS.map(c => `
            <button type="button" class="color-opt ${c === currentColor ? 'selected' : ''}" data-color="${c}" title="${c}" aria-label="${c} color">
              <span class="pill-token shape-round pill-color-${c}"></span>
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  const badgeSlot = container.querySelector('#preview-badge-slot') as HTMLElement;

  const updatePreview = () => {
    badgeSlot.innerHTML = createPillBadgeHTML({ shape: currentShape, color: currentColor }, 'large');
    onChange({ shape: currentShape, color: currentColor });
  };

  container.querySelectorAll('.shape-opt').forEach(btn => {
    btn.addEventListener('click', (e) => {
      container.querySelectorAll('.shape-opt').forEach(b => b.classList.remove('selected'));
      const target = e.currentTarget as HTMLElement;
      target.classList.add('selected');
      currentShape = target.dataset.shape as PillShape;
      updatePreview();
    });
  });

  container.querySelectorAll('.color-opt').forEach(btn => {
    btn.addEventListener('click', (e) => {
      container.querySelectorAll('.color-opt').forEach(b => b.classList.remove('selected'));
      const target = e.currentTarget as HTMLElement;
      target.classList.add('selected');
      currentColor = target.dataset.color as PillColor;
      updatePreview();
    });
  });

  return () => ({ shape: currentShape, color: currentColor });
}
