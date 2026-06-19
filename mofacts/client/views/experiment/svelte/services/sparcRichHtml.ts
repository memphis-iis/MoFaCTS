export const SPARC_HTML_ALLOWED_TAGS = [
  'a', 'abbr', 'aside', 'b', 'blockquote', 'br', 'code', 'dd', 'del', 'details', 'div', 'dl', 'dt', 'em',
  'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'hr', 'i', 'iframe', 'img', 'input', 'label', 'li',
  'mark', 'ol', 'p', 'pre', 's', 'section', 'span', 'strong', 'sub', 'summary', 'sup',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
] as const;

export const SPARC_HTML_ALLOWED_ATTR = [
  'allowfullscreen', 'alt', 'checked', 'class', 'colspan', 'data-align', 'data-color', 'disabled',
  'data-colwidth', 'data-oli-page-link', 'data-sparc-callout', 'data-type', 'height',
  'href', 'loading', 'rel', 'rowspan', 'src', 'target', 'title', 'type', 'width',
] as const;

export const SPARC_HTML_FORBID_ATTR = [
  'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'style',
] as const;

const ALIGNMENT_VALUES = new Set(['left', 'center', 'right', 'justify']);
const COLOR_VALUES = new Set(['accent', 'correct', 'warning', 'error', 'muted']);
const CALLOUT_VALUES = new Set(['info', 'success', 'warning', 'error']);
const DATA_TYPE_VALUES = new Set(['taskList', 'taskItem']);
const ALLOWED_CLASSES = new Set([
  'h5p-definition-list',
  'oli-callout',
  'oli-definition',
  'oli-embed',
  'oli-missing-reference',
  'oli-popup',
  'sparc-align-left',
  'sparc-align-center',
  'sparc-align-right',
  'sparc-align-justify',
  'sparc-color-accent',
  'sparc-color-correct',
  'sparc-color-warning',
  'sparc-color-error',
  'sparc-color-muted',
  'sparc-highlight',
]);

export const SPARC_RICH_TEXT_COLORS = [
  { label: 'Accent', token: 'accent', cssValue: 'var(--sparc-accent-color)' },
  { label: 'Correct', token: 'correct', cssValue: 'var(--sparc-correct-color)' },
  { label: 'Warning', token: 'warning', cssValue: 'var(--sparc-warning-color)' },
  { label: 'Error', token: 'error', cssValue: 'var(--sparc-error-color)' },
  { label: 'Muted', token: 'muted', cssValue: 'var(--sparc-muted-text-color)' },
] as const;

export type SparcRichTextColorToken = typeof SPARC_RICH_TEXT_COLORS[number]['token'];

const COLOR_BY_CSS_VALUE = new Map(
  SPARC_RICH_TEXT_COLORS.map((color) => [color.cssValue.toLowerCase(), color.token]),
);

function hasDomParser(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function parseHtmlFragment(value: string): HTMLTemplateElement | null {
  if (!hasDomParser()) {
    return null;
  }
  const template = document.createElement('template');
  template.innerHTML = value;
  return template;
}

function addClass(element: Element, className: string): void {
  const classes = new Set((element.getAttribute('class') || '').split(/\s+/).filter(Boolean));
  classes.add(className);
  element.setAttribute('class', [...classes].join(' '));
}

function normalizeAlignment(element: HTMLElement): void {
  const textAlign = element.style?.textAlign?.trim().toLowerCase();
  if (!textAlign || !ALIGNMENT_VALUES.has(textAlign)) {
    return;
  }
  element.setAttribute('data-align', textAlign);
  addClass(element, `sparc-align-${textAlign}`);
}

function normalizeColor(element: HTMLElement): void {
  const color = element.style?.color?.trim().toLowerCase();
  const token = color ? COLOR_BY_CSS_VALUE.get(color) : undefined;
  if (!token) {
    return;
  }
  element.setAttribute('data-color', token);
  addClass(element, `sparc-color-${token}`);
}

function stripUnsupportedClasses(element: Element): void {
  const classes = (element.getAttribute('class') || '').split(/\s+/).filter(Boolean);
  const kept = classes.filter((className) => ALLOWED_CLASSES.has(className));
  if (kept.length > 0) {
    element.setAttribute('class', [...new Set(kept)].join(' '));
  } else {
    element.removeAttribute('class');
  }
}

function normalizeElement(element: Element): void {
  if (element.tagName.toLowerCase() === 'input' && element.getAttribute('type') === 'checkbox') {
    element.setAttribute('disabled', 'disabled');
  }
  if (element instanceof HTMLElement) {
    normalizeAlignment(element);
    normalizeColor(element);
    element.removeAttribute('style');
  }
  stripUnsupportedClasses(element);
}

export function normalizeSparcRichHtml(value: unknown): string {
  const html = String(value || '');
  const template = parseHtmlFragment(html);
  if (!template) {
    return html;
  }
  template.content.querySelectorAll('*').forEach(normalizeElement);
  return template.innerHTML;
}

function issue(path: string, message: string): string {
  return `${path}: ${message}`;
}

export function validateSparcRichHtml(value: unknown, path = 'SPARC rich HTML'): string[] {
  const template = parseHtmlFragment(String(value || ''));
  if (!template) {
    return [];
  }
  const issues: string[] = [];
  template.content.querySelectorAll('*').forEach((element, index) => {
    const elementPath = `${path} element[${index}] <${element.tagName.toLowerCase()}>`;
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const attrPath = `${elementPath}.${name}`;
      if (name === 'style' || name.startsWith('on')) {
        issues.push(issue(attrPath, 'inline styles and event handlers are not allowed'));
      }
      if (name === 'class') {
        const classes = attribute.value.split(/\s+/).filter(Boolean);
        for (const className of classes) {
          if (!ALLOWED_CLASSES.has(className)) {
            issues.push(issue(attrPath, `unsupported class "${className}"`));
          }
        }
      }
      if (name === 'data-align' && !ALIGNMENT_VALUES.has(attribute.value)) {
        issues.push(issue(attrPath, `unsupported alignment "${attribute.value}"`));
      }
      if (name === 'data-color' && !COLOR_VALUES.has(attribute.value)) {
        issues.push(issue(attrPath, `unsupported color "${attribute.value}"`));
      }
      if (name === 'data-sparc-callout' && !CALLOUT_VALUES.has(attribute.value)) {
        issues.push(issue(attrPath, `unsupported callout "${attribute.value}"`));
      }
      if (name === 'data-type' && !DATA_TYPE_VALUES.has(attribute.value)) {
        issues.push(issue(attrPath, `unsupported data-type "${attribute.value}"`));
      }
    }
    if (element.tagName.toLowerCase() === 'img') {
      const src = element.getAttribute('src') || '';
      const alt = element.getAttribute('alt');
      if (!src.trim()) {
        issues.push(issue(elementPath, 'image requires src'));
      }
      if (alt === null) {
        issues.push(issue(elementPath, 'image requires alt text, even when empty'));
      }
    }
    if (element.tagName.toLowerCase() === 'iframe') {
      const src = element.getAttribute('src') || '';
      if (!/^https:\/\//i.test(src)) {
        issues.push(issue(elementPath, 'iframe src must be an https URL'));
      }
    }
    if (element.tagName.toLowerCase() === 'input') {
      const type = element.getAttribute('type') || '';
      const disabled = element.hasAttribute('disabled');
      if (type !== 'checkbox') {
        issues.push(issue(elementPath, 'rich text inputs must be task-list checkboxes'));
      }
      if (!disabled) {
        issues.push(issue(elementPath, 'rich text task-list checkboxes must be disabled'));
      }
    }
    if ((element.tagName.toLowerCase() === 'td' || element.tagName.toLowerCase() === 'th')
      && (Number(element.getAttribute('colspan') || '1') < 1 || Number(element.getAttribute('rowspan') || '1') < 1)) {
      issues.push(issue(elementPath, 'table cell span values must be positive'));
    }
  });
  return issues;
}

export function sanitizeSparcRichHtml(
  value: unknown,
  sanitize: (dirty: string, config: Record<string, unknown>) => string,
): string {
  const normalized = normalizeSparcRichHtml(value);
  const sanitized = sanitize(normalized, {
    ALLOWED_TAGS: SPARC_HTML_ALLOWED_TAGS,
    ALLOWED_ATTR: SPARC_HTML_ALLOWED_ATTR,
    FORBID_ATTR: SPARC_HTML_FORBID_ATTR,
  });
  return normalizeSparcRichHtml(sanitized);
}
