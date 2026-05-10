/**
 * Tooltip adapters for TDF and stimulus editors.
 *
 * Field-level tooltip content is owned by the canonical field registry. This
 * module only projects registry metadata and provides editor display helpers.
 */

import {
  createDeliveryParamTooltipMap,
  createStimTooltipMap,
  createTdfTooltipMap,
} from '../../common/fieldRegistry';

export const TDF_TOOLTIPS = {
  ...createTdfTooltipMap(),
  ...createDeliveryParamTooltipMap(),
};

export const STIM_TOOLTIPS = {
  ...createStimTooltipMap(),
};

export function getTooltipMode() {
  return localStorage.getItem('tooltipMode') || 'none';
}

export function setTooltipMode(mode: 'none' | 'brief' | 'verbose'): void {
  localStorage.setItem('tooltipMode', mode);
}

type TooltipEntry = {
  brief?: string;
  verbose?: string;
  [mode: string]: string | undefined;
};
type TooltipMap = Record<string, TooltipEntry>;

export function injectDescriptions(
  schema: Record<string, unknown>,
  tooltips: TooltipMap,
  mode: 'none' | 'brief' | 'verbose'
): Record<string, unknown> {
  const schemaClone = JSON.parse(JSON.stringify(schema));
  const effectiveMode = mode === 'none' ? 'brief' : mode;

  const inject = (obj: Record<string, unknown> | null, path = ''): void => {
    if (!obj || typeof obj !== 'object') return;

    if (obj.properties) {
      for (const [key, value] of Object.entries(obj.properties as Record<string, Record<string, unknown>>)) {
        const fieldPath = path ? `${path}.${key}` : key;
        if (tooltips[fieldPath]) {
          (value as { description?: string }).description = tooltips[fieldPath][effectiveMode] ?? '';
        }
        inject(value, fieldPath);
      }
    }

    if (obj.items) {
      inject(obj.items as Record<string, unknown>, `${path}[]`);
    }
  };

  inject(schemaClone);
  return schemaClone;
}

export function buildDescriptionCache(container: HTMLElement, tooltips: TooltipMap): void {
  if (!container) return;

  const descElements = container.querySelectorAll(
    '.form-text, .je-desc, p.help-block, small.text-muted, [data-schemapath] > p'
  );

  descElements.forEach((descEl) => {
    const desc = descEl as HTMLElement;
    if (desc.dataset.descCached) return;

    const schemaPathEl = desc.closest('[data-schemapath]');
    if (!schemaPathEl) return;

    const schemaPath = schemaPathEl.getAttribute('data-schemapath');
    if (!schemaPath) return;

    const tooltipPath = schemaPath
      .replace(/^root\.?/, '')
      .replace(/\.\d+\./g, '[].')
      .replace(/\.\d+$/g, '[]')
      .replace(/^\d+\./, '[].');

    const tooltip = tooltips[tooltipPath];
    if (tooltip) {
      desc.dataset.descBrief = tooltip.brief || '';
      desc.dataset.descVerbose = tooltip.verbose || '';
      desc.dataset.descCached = 'true';
    }
  });
}

export function updateDescriptionsInPlace(
  container: HTMLElement,
  _tooltips: TooltipMap,
  mode: 'none' | 'brief' | 'verbose'
): void {
  if (!container) return;

  if (mode === 'none') {
    container.classList.add('hide-descriptions');
    return;
  }
  container.classList.remove('hide-descriptions');

  const descElements = container.querySelectorAll('[data-desc-cached="true"]');
  descElements.forEach((descEl) => {
    const desc = descEl as HTMLElement;
    const text = mode === 'brief' ? desc.dataset.descBrief : desc.dataset.descVerbose;
    if (text) {
      desc.textContent = text;
    }
  });
}
