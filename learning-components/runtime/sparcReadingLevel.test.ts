import assert from 'node:assert/strict';
import { resolveSparcReadingLevel, sparcReadingLevelInstruction, SPARC_READING_LEVELS } from './sparcReadingLevel';

describe('SPARC text reading level', () => {
  it('keeps omitted and unbiased prompts unchanged and rejects invalid settings', () => {
    assert.equal(resolveSparcReadingLevel(undefined), 'unbiased');
    assert.equal(sparcReadingLevelInstruction('unbiased'), '');
    for (const level of SPARC_READING_LEVELS) assert.equal(resolveSparcReadingLevel(level), level);
    for (const value of [null, '', 'graduate', true, 9]) assert.throws(() => resolveSparcReadingLevel(value), /readingLevel must be/);
  });
  it('targets the requested audience without lowering conceptual requirements', () => {
    assert.match(sparcReadingLevelInstruction('high-school-freshman'), /grade 9/);
    assert.match(sparcReadingLevelInstruction('college-freshman'), /first year/);
    assert.match(sparcReadingLevelInstruction('high-school-freshman'), /without lowering the learning standard/);
  });
});
