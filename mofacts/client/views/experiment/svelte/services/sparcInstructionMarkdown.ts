import { marked } from 'marked';
import { sanitizeSparcRichHtml } from './sparcRichHtml';

/** Generated instructional text is GFM. A whole-document md/markdown fence is
 * accepted as a Markdown envelope; ordinary code fences remain code blocks.
 * Render on read so saved conversations use the same presentation as new ones.
 */
export function renderSparcInstructionMarkdown(
  value: unknown,
  sanitize: (dirty: string, config: Record<string, unknown>) => string,
): string {
  const source = String(value ?? '');
  const envelope = source.trim().match(/^```(?:md|markdown)\s*\r?\n([\s\S]*?)\r?\n```$/i);
  const html = marked.parse(envelope ? envelope[1]! : source, { async: false, gfm: true, breaks: true }) as string;
  return sanitizeSparcRichHtml(html, (dirty, config) => sanitize(dirty, {
    ...config,
    // Figures have their own saved-asset renderer. Text cannot embed remote media
    // or interactive controls, including through raw HTML in older rich content.
    FORBID_TAGS: ['iframe', 'img', 'input', 'form', 'button', 'style', 'script'],
  }));
}
