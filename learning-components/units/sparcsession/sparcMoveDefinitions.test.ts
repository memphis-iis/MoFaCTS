import { strict as assert } from 'node:assert';
import {
  SPARC_AUTOTUTOR_DIALOGUE_MOVE_DEFINITIONS,
  getSparcMoveDefinition,
  requireActiveSparcMoveDefinition,
} from './sparcMoveDefinitions';

describe('SPARC move definitions', function() {
  it('registers active AutoTutor dialogue moves with prompt and output contracts', function() {
    const hint = requireActiveSparcMoveDefinition('hint');

    assert.equal(hint.family, 'autotutor-dialogue');
    assert.equal(hint.status, 'active');
    assert.equal(hint.promptId, 'autotutor.hint');
    assert.equal(hint.promptVersion, 'v1');
    assert.equal(hint.outputSchemaId, 'autotutor.chat_utterance');
    assert.equal(hint.outputSchemaVersion, 'v1');
    assert.equal(hint.renderer, 'sparc.dialogue_utterance');
    assert.equal(hint.historyAction, 'sparc-dialogue-turn');
    assert.ok(hint.promptPolicy.includes('clue'));
  });

  it('keeps feedback-labeled paper moves registered but disabled for active selection', function() {
    const legacyMoveIds = [
      'positive_feedback',
      'neutral_feedback',
      'negative_feedback',
      'positive_neutral_feedback',
      'negative_neutral_feedback',
    ];

    for (const moveId of legacyMoveIds) {
      assert.equal(getSparcMoveDefinition(moveId)?.status, 'legacy-disabled');
      assert.throws(
        () => requireActiveSparcMoveDefinition(moveId),
        new RegExp(`selected move "${moveId}" is registered as legacy-disabled`),
      );
    }
  });

  it('uses unique move ids and prompt ids', function() {
    const moveIds = SPARC_AUTOTUTOR_DIALOGUE_MOVE_DEFINITIONS.map((definition) => definition.moveId);
    const promptIds = SPARC_AUTOTUTOR_DIALOGUE_MOVE_DEFINITIONS.map((definition) => definition.promptId);

    assert.equal(new Set(moveIds).size, moveIds.length);
    assert.equal(new Set(promptIds).size, promptIds.length);
  });
});
