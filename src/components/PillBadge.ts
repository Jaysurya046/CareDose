import type { PillVisual } from '../types';

export function createPillBadgeHTML(visual: PillVisual, size: 'normal' | 'large' = 'normal'): string {
  const shapeClass = `shape-${visual.shape}`;
  const colorClass = `pill-color-${visual.color}`;
  const scaleStyle = size === 'large' ? 'transform: scale(1.3); transform-origin: center;' : '';

  return `
    <span class="pill-token ${shapeClass} ${colorClass}" style="${scaleStyle}" aria-label="${visual.color} ${visual.shape} pill" title="${visual.color} ${visual.shape}"></span>
  `;
}
