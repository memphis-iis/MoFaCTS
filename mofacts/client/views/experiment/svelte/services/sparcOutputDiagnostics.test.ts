import { strict as assert } from 'node:assert';
import { callWithSparcOutputDiagnostics } from './sparcOutputDiagnostics';
import type { CallResolvedOpenRouterJson } from './sparcControllerDialogueOpenRouter';
import type { SparcOutputLimitWarning } from '../../../../../common/recoverableWarnings';
const request: Parameters<CallResolvedOpenRouterJson>[0] = {
  tdfId: 'lesson', messages: [{ role: 'user', content: 'Teach the selected KC.' }],
  intent: { title: 'Tutor', schemaName: 'test', missingContentMessage: 'No content', schema: {} },
};
describe('SPARC advisory output sizes', () => {
  it('returns character, serialized-byte, Unicode and escaped-text overages unchanged with one call', async () => {
    for (const text of ['a'.repeat(2048), 'a'.repeat(2049), 'é'.repeat(1100), 'a\n'.repeat(700)]) {
      const output = { parsedContent: { tutorMessage: text } };
      const warnings: SparcOutputLimitWarning[] = [];
      let calls = 0, results = 0;
      const result = await callWithSparcOutputDiagnostics({ request, operation: 'explanation',
        call: async actual => { assert.equal(actual, request); calls++; return output; },
        onResult: () => { results++; }, reportWarning: warning => { warnings.push(warning); },
      });
      await Promise.resolve();
      assert.equal(result, output); assert.equal(calls, 1); assert.equal(results, 1);
      assert.ok(warnings.length > 0);
      assert.ok(warnings.every(w => w.outcome === 'continued' && w.attempts === 1 && !('text' in w)));
    }
  });
  it('logs every generated field without rejecting content or relying on schema size enforcement', async () => {
    const output = { parsedContent: { tutorMessage: 'Short.', workedExample: 'x'.repeat(2050),
      figureDescription: 'é'.repeat(1100), imagePrompt: 'x'.repeat(8001), heading: 'x'.repeat(61), choices: [{ label: 'x'.repeat(241) }] } };
    const warnings: SparcOutputLimitWarning[] = [];
    assert.equal(await callWithSparcOutputDiagnostics({ request, operation: 'rich', call: async () => output,
      onResult: () => {}, reportWarning: warning => { warnings.push(warning); } }), output);
    await Promise.resolve();
    assert.deepEqual(new Set(warnings.map(w => w.field)), new Set(['workedExample', 'figureDescription', 'imagePrompt', 'heading', 'choices.label']));
  });
  it('isolates logging failures from delivery and keeps actual provider failures observable', async () => {
    for (const reportWarning of [() => { throw new Error('Log unavailable'); }, async () => { throw new Error('Log unavailable'); }]) {
      const output = { parsedContent: { tutorMessage: 'x'.repeat(2049) } };
      assert.equal(await callWithSparcOutputDiagnostics({ request, operation: 'utterance', call: async () => output,
        onResult: () => {}, reportWarning }), output);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    const error = new Error('Provider unavailable');
    await assert.rejects(callWithSparcOutputDiagnostics({ request, operation: 'utterance', call: async () => { throw error; },
      onResult: () => {}, reportWarning: () => {} }), actual => actual === error);
  });
});
