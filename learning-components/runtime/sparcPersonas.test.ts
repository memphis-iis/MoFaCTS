import { strict as assert } from 'node:assert';
import { parseSparcPersonas, parseSparcStudentPersona, parseSparcTeacherPersona } from './sparcPersonas';
import { buildSparcInstructionalNeed, sparcInstructionalNeedText } from './sparcInstructionalNeed';

describe('Explicit SPARC persona descriptions', () => {
  it('keeps unknown attributes empty and separates role-specific descriptions', () => {
    assert.deepEqual(parseSparcStudentPersona({ personalInterests: [' Soccer '] }), {
      traits: [], abilities: [], experiences: [], personalInterests: ['Soccer'],
    });
    assert.throws(() => parseSparcStudentPersona({ teachingStyle: ['Socratic'] }), /Unexpected/);
    assert.throws(() => parseSparcTeacherPersona({ personalInterests: ['Anime'] }), /Unexpected/);
    for (const invalid of [null, [], { traits: 'Patient' }, { abilities: [''] }, { experiences: ['x'.repeat(241)] }]) {
      assert.throws(() => parseSparcStudentPersona(invalid), /persona/);
    }
  });
  it('embeds descriptions through the canonical need representation without changing old entries', () => {
    const params = { targetContent: { text: 'Sampling variability' }, targetTexts: ['Sampling variability'], assistance: 1.8, evidence: [] };
    const original = buildSparcInstructionalNeed(params);
    const personas = parseSparcPersonas({ student: { personalInterests: ['Soccer'], abilities: ['Basic algebra'] }, teacher: { teachingStyle: ['Explain conceptual relationships'] } });
    const described = buildSparcInstructionalNeed({ ...params, personas });
    assert.deepEqual(described.personas, personas);
    assert.deepEqual({ ...described, personas: undefined }, { ...original, personas: undefined });
    assert.equal(sparcInstructionalNeedText(JSON.parse(sparcInstructionalNeedText(described))), sparcInstructionalNeedText(described));
    assert.equal(sparcInstructionalNeedText(original), '{"target":{"texts":["Sampling variability"]},"assistance":1.8,"evidence":[]}');
    assert.equal(original.personas, undefined);
  });
});
