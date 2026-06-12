import { expect } from 'chai';
import { describe, it } from 'mocha';
import {
  CARD_INSTRUCTION_HTML_SANITIZER_CONFIG,
  sanitizeCardInstructionHtml,
  type HtmlSanitizer,
} from './cardInstructionSanitizer';

describe('cardInstructionSanitizer', () => {
  it('returns an empty string for missing instruction html', () => {
    const sanitize: HtmlSanitizer = () => {
      throw new Error('sanitize should not be called for empty input');
    };

    expect(sanitizeCardInstructionHtml('', sanitize)).to.equal('');
    expect(sanitizeCardInstructionHtml(null, sanitize)).to.equal('');
  });

  it('uses the card instruction allowlist and blocklist', () => {
    let receivedDirty = '';
    let receivedConfig: unknown = null;
    const sanitize: HtmlSanitizer = (dirty, config) => {
      receivedDirty = dirty;
      receivedConfig = config;
      return 'sanitized';
    };

    const result = sanitizeCardInstructionHtml('<p>Watch</p>', sanitize);

    expect(result).to.equal('sanitized');
    expect(receivedDirty).to.equal('<p>Watch</p>');
    expect(receivedConfig).to.equal(CARD_INSTRUCTION_HTML_SANITIZER_CONFIG);
    expect(CARD_INSTRUCTION_HTML_SANITIZER_CONFIG.ALLOWED_TAGS).to.include.members([
      'p',
      'img',
      'audio',
      'source',
    ]);
    expect(CARD_INSTRUCTION_HTML_SANITIZER_CONFIG.FORBID_TAGS).to.include.members([
      'script',
      'iframe',
      'button',
    ]);
    expect(CARD_INSTRUCTION_HTML_SANITIZER_CONFIG.FORBID_ATTR).to.include('onclick');
  });

  it('stringifies non-string instruction values before sanitizing', () => {
    const sanitize: HtmlSanitizer = (dirty) => dirty;

    expect(sanitizeCardInstructionHtml(42, sanitize)).to.equal('42');
  });
});
