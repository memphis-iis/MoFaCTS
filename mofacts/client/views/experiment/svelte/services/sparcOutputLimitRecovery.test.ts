import { strict as assert } from 'node:assert';
import { callWithSparcOutputLimitRecovery, SparcOutputLimitRecoveryError } from './sparcOutputLimitRecovery';
import type { CallResolvedOpenRouterJson } from './sparcControllerDialogueOpenRouter';
import type { SparcOutputLimitWarning } from '../../../../../common/recoverableWarnings';

const request: Parameters<CallResolvedOpenRouterJson>[0] = {
  tdfId: 'lesson', sessionId: 'same-session', policyId: 'same-policy',
  messages: [{ role: 'system', content: 'Teach the selected target.' }, { role: 'user', content: 'Same accepted teaching action and context.' }],
  intent: { title: 'Tutor', schemaName: 'test', missingContentMessage: 'No content', schema: { type: 'object', properties: { tutorMessage: { type: 'string', maxLength: 2048 } } } },
};

function fixture(outputs: unknown[], overrides: Partial<Parameters<typeof callWithSparcOutputLimitRecovery>[0]> = {}) {
  const calls: Parameters<CallResolvedOpenRouterJson>[0][] = [];
  const warnings: SparcOutputLimitWarning[] = [];
  let results = 0;
  const run = () => callWithSparcOutputLimitRecovery({ request, operation: 'utterance',
    call: async params => {
      calls.push(params);
      const output = outputs[calls.length - 1];
      if (output instanceof Error) throw output;
      return { parsedContent: output };
    },
    onResult: () => { results++; }, reportWarning: warning => { warnings.push(warning); }, ...overrides,
  });
  return { run, calls, warnings, results: () => results };
}

describe('SPARC generated output limit recovery', () => {
  it('recovers the screenshot boundary (2048 characters, 2050 JSON bytes) without changing the selected request', async () => {
    const oversized = { tutorMessage: 'a'.repeat(2048) };
    const accepted = { tutorMessage: 'A shorter, complete explanation.' };
    const f = fixture([oversized, accepted]);
    assert.deepEqual((await f.run()).parsedContent, accepted);
    assert.equal(f.calls.length, 2);
    assert.equal(f.results(), 2, 'Both charged responses reach usage accounting');
    assert.equal(f.calls[0], request);
    assert.deepEqual(f.calls[1], { ...request, messages: [...request.messages, f.calls[1]!.messages.at(-1)!] });
    assert.match(String(f.calls[1]!.messages.at(-1)!.content), /Regenerate the same requested teaching content/);
    assert.deepEqual(f.warnings, [{ code: 'autotutor.outputLimit', tdfId: 'lesson', operation: 'utterance',
      field: 'tutorMessage', unit: 'json-utf8-bytes', observedSize: 2050, limit: 2048, attempts: 2, outcome: 'regenerated' }]);
    assert.equal(request.messages.length, 2, 'The original request is not mutated');
    assert.equal(oversized.tutorMessage.length, 2048, 'Rejected content is never truncated');
  });

  it('checks multibyte and escaped text and accepts text exactly at the serialized byte limit', async () => {
    for (const text of ['é'.repeat(1100), 'a\n'.repeat(700)]) {
      const f = fixture([{ tutorMessage: text }, { tutorMessage: 'Complete concise response.' }]);
      await f.run(); assert.equal(f.calls.length, 2); assert.equal(f.warnings[0]!.unit, 'json-utf8-bytes');
    }
    const f = fixture([{ tutorMessage: 'a'.repeat(2046) }]);
    await f.run(); assert.equal(f.calls.length, 1); assert.deepEqual(f.warnings, []);
  });

  it('bounds regeneration and yields a recoverable state when both attempts exceed a limit', async () => {
    const f = fixture(Array(2).fill({ tutorMessage: 'a'.repeat(2049) }));
    await assert.rejects(f.run(), SparcOutputLimitRecoveryError);
    assert.equal(f.calls.length, 2);
    assert.equal(f.warnings[0]!.outcome, 'retry-needed');
    assert.equal(f.warnings[0]!.unit, 'characters');
  });

  it('validates persisted support text and schema-bounded briefs, headings, and options before side effects', async () => {
    for (const field of ['workedExample', 'figureDescription', 'imagePrompt', 'heading', 'choices.label'] as const) {
      const choices = field === 'choices.label';
      const property = choices ? 'choices' : field;
      const schema = { properties: { [property]: choices ? { items: { properties: { label: { maxLength: 240 } } } } : { maxLength: field === 'imagePrompt' ? 8000 : field === 'heading' ? 60 : 2048 } } };
      const length = choices ? 241 : field === 'imagePrompt' ? 8001 : field === 'heading' ? 61 : 2048;
      const f = fixture([{ [property]: choices ? [{ label: 'a'.repeat(length) }] : 'a'.repeat(length) }, { [property]: choices ? [{ label: 'A complete option' }] : 'Complete support.' }],
        { operation: 'rich', request: { ...request, intent: { ...request.intent, schema } } });
      await f.run(); assert.equal(f.calls.length, 2); assert.equal(f.warnings[0]!.field, field);
    }
  });

  it('does not retry unrelated provider failures or retry malformed output as a size failure', async () => {
    const failure = new Error('Provider unavailable');
    const f = fixture([failure]);
    await assert.rejects(f.run(), error => error === failure);
    assert.equal(f.calls.length, 1); assert.deepEqual(f.warnings, []);
    const malformed = fixture([{ tutorMessage: '   ' }]);
    assert.deepEqual((await malformed.run()).parsedContent, { tutorMessage: '   ' }, 'Non-size validation remains with the existing parser');
    assert.equal(malformed.calls.length, 1); assert.deepEqual(malformed.warnings, []);
  });

  it('logs an interrupted regeneration while preserving the actual service failure', async () => {
    const failure = new Error('Provider unavailable');
    const f = fixture([{ tutorMessage: 'a'.repeat(2048) }, failure]);
    await assert.rejects(f.run(), error => error === failure);
    assert.equal(f.calls.length, 2); assert.equal(f.warnings[0]!.outcome, 'failed');
  });

  it('isolates synchronous and asynchronous warning-delivery failures from both recovery outcomes', async () => {
    for (const reportWarning of [() => { throw new Error('Logging failed'); }, async () => { throw new Error('Logging failed'); }]) {
      const recovered = fixture([{ tutorMessage: 'a'.repeat(2048) }, { tutorMessage: 'A complete reply.' }], { reportWarning });
      assert.deepEqual((await recovered.run()).parsedContent, { tutorMessage: 'A complete reply.' });
      const exhausted = fixture(Array(2).fill({ tutorMessage: 'a'.repeat(2048) }), { reportWarning });
      await assert.rejects(exhausted.run(), SparcOutputLimitRecoveryError);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  });
});
