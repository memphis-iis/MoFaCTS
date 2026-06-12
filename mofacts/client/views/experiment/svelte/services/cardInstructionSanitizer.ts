import DOMPurify from 'dompurify';

export type HtmlSanitizer = (
  dirty: string,
  config: {
    ALLOWED_TAGS: string[];
    ALLOWED_ATTR: string[];
    ALLOWED_URI_REGEXP: RegExp;
    FORBID_TAGS: string[];
    FORBID_ATTR: string[];
  },
) => string;

export const CARD_INSTRUCTION_HTML_SANITIZER_CONFIG = {
  ALLOWED_TAGS: [
    'b',
    'i',
    'em',
    'strong',
    'u',
    'br',
    'p',
    'span',
    'div',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'table',
    'tr',
    'td',
    'th',
    'thead',
    'tbody',
    'ul',
    'ol',
    'li',
    'center',
    'a',
    'img',
    'audio',
    'source',
  ],
  ALLOWED_ATTR: [
    'style',
    'class',
    'id',
    'border',
    'href',
    'src',
    'alt',
    'width',
    'height',
    'controls',
    'preload',
    'data-audio-id',
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
};

export function sanitizeCardInstructionHtml(
  dirty: unknown,
  sanitize: HtmlSanitizer = DOMPurify.sanitize,
): string {
  if (!dirty) {
    return '';
  }
  return sanitize(String(dirty), CARD_INSTRUCTION_HTML_SANITIZER_CONFIG);
}
