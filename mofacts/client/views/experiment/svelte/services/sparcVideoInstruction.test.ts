import { createSparcInstructionTransition } from '../../../../../../learning-components/units/sparcsession/sparcInstructionalPrimitives';
import { progressiveDialogueFacts } from '../../../../../../learning-components/units/sparcsession/sparcWorkingMemoryFacts';
import { buildSparcDialogueHistory } from '../../../../../../learning-components/units/sparcsession/sparcUtteranceRequest';
import { strict as assert } from 'node:assert';
import { createSparcDialogueOpenRouterProvider } from './sparcControllerDialogueOpenRouter';
import { requireActiveSparcMoveDefinition } from '../../../../../../learning-components/units/sparcsession/sparcMoveDefinitions';
import type { SparcInstructionComponents } from '../../../../../../learning-components/units/sparcsession/sparcInstructionalPrimitives';
import type { SparcUtteranceRequest } from '../../../../../../learning-components/units/sparcsession/sparcUtteranceRequest';
import type { SparcPrimitiveContent } from '../../../../../../learning-components/runtime/sparcMoveLibraryContract';
import { sparcLibraryPreviewNode } from '../../../experimentSetup/sparc/sparcLibraryPreview';

const video = { segmentId: 'a'.repeat(64), videoId: 'abcdefghijk', startSeconds: 12, endSeconds: 32,
  transcript: 'Individuals already vary. Heritable variation can affect reproductive success.', language: 'en', title: 'Selection', channel: 'Teaching' };
describe('SPARC video resolved from the selected visual-support move', () => {
  it('grounds text and multiple-choice questions in the actual clip, persists it, and resumes without new selection', async () => {
    for (const format of ['text', 'multiple-choice']) {
      const definition = requireActiveSparcMoveDefinition(`instruction.dynamic.explanation-visual-question.${format}`);
      const persisted: SparcPrimitiveContent[] = [];
      let calls = 0;
      let resolutions = 0;
      const provider = createSparcDialogueOpenRouterProvider({ tdfId: 'biology', sessionId: 'provider-session',
        moveLibrary: {
          async lookup(query) { return { status: 'generate', ticket: query.context.kind, previousQuestions: [] }; },
          async publish(ticket, content) { return { accepted: true, content, reference: { entryId: ticket, version: 'sparc-moves-v1', source: 'generated', similarity: null } }; },
          async present() {},
        },
        async callResolvedOpenRouterJson(params) {
          calls++;
          assert.ok(!JSON.stringify(params.intent.schema).includes('videoSegmentId'));
          if (params.intent.schemaName.includes('visual_primitive')) {
            assert.ok(String(params.messages[0]!.content).includes('Keep dimensions, canvas layout, rendering instructions'));
            assert.ok(!String(params.messages[0]!.content).includes('Choose a compact canvas shape'));
          }
          if (params.intent.schemaName.includes('visual_primitive')) return { parsedContent: { imagePrompt: 'Heritable variation and reproductive success across generations.',
            figureDescription: 'A population with heritable variation.', displayWidth: 360 } };
          assert.ok(JSON.stringify(params.messages).includes(video.transcript));
          if (params.intent.schemaName.includes('question')) {
            assert.ok(JSON.stringify(params.messages).includes('Do not ask about visual details'));
            return { parsedContent: { tutorMessage: 'Why must the variation be heritable?', ...(format === 'multiple-choice' ? { choices: [
              { id: 'a', label: 'So it can be passed to offspring.', correct: true }, { id: 'b', label: 'So individuals can choose it.', correct: false }, { id: 'c', label: 'So all individuals become identical.', correct: false },
            ] } : {}) } };
          }
          return { parsedContent: { tutorMessage: 'Selection changes populations across generations.' } };
        },
        async callSparcPromptImage() { throw new Error('Video must not call the image provider'); },
        async callSparcVisualSupport(params) {
          resolutions++;
          assert.equal(params.situation.illustrationBrief, 'Heritable variation and reproductive success across generations.');
          return { video };
        },
      });
      const request: SparcUtteranceRequest = { problemStatement: 'Natural selection', targetType: 'learningTarget', targetId: 'kc-a',
        contentTexts: ['Heritable variation precedes selection.'], targetContent: { clusterKC: 'kc-a', text: 'Heritable variation precedes selection.', category: 'model' },
        action: definition.moveId, moveDefinition: definition, responseModifiers: [], selectedAction: { snapshotId: 'event' },
        learnerText: '', dialogueHistory: [], historySessionId: 'history-session',
        onInstructionComponent: async (_kind, text, figure, details) => { persisted.push({ text, ...(figure ? { figure } : {}), ...details }); },
      };
      const output = await provider.generateTutorUtterance(request) as SparcInstructionComponents;
      const transition = createSparcInstructionTransition({ document: { id: 'page', schemaVersion: 2, root: { id: 'root', kind: 'document' } },
        event: { eventId: 'event', type: 'response-submitted', source: { pageKey: 'page', nodeId: 'input' }, time: 1 }, learnerText: '', request, generated: output, includeLearner: false });
      const restoredFacts = progressiveDialogueFacts({ transitions: JSON.parse(JSON.stringify([transition])) });
      assert.ok(buildSparcDialogueHistory(restoredFacts).some(entry => JSON.stringify(entry.video) === JSON.stringify(video)));
      assert.deepEqual(output.video, video); assert.equal(persisted[0]!.video?.segmentId, video.segmentId);
      assert.equal(calls, 3); assert.equal(resolutions, 1); assert.equal(Boolean(output.choices), format === 'multiple-choice');
      const resumed = await provider.generateTutorUtterance({ ...request, realizedInstruction: output }) as SparcInstructionComponents;
      assert.deepEqual(resumed.video, video); assert.equal(calls, 3); assert.equal(resolutions, 1);
      const preview = sparcLibraryPreviewNode({ id: video.segmentId, kind: 'video', move: 'catalog-video', content: { text: video.transcript, video } });
      assert.deepEqual(preview!.video, video);
    }
  });
});
