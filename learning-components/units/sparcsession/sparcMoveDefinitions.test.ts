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
    assert.equal(hint.promptVersion, 'v3');
    assert.equal(hint.outputSchemaId, 'autotutor.chat_utterance');
    assert.equal(hint.outputSchemaVersion, 'v1');
    assert.equal(hint.renderer, 'sparc.dialogue_utterance');
    assert.equal(hint.historyAction, 'sparc-dialogue-turn');
    assert.ok(hint.promptPolicy.includes('clue'));
  });

  it('preserves the seven active move identities and metadata', function() {
    const expectedMoveIds = [
      'question-deferral',
      'question-scope-refusal',
      'pump',
      'prompt',
      'hint',
      'assertion',
      'summary',
    ];

    assert.deepEqual(
      SPARC_AUTOTUTOR_DIALOGUE_MOVE_DEFINITIONS.map((definition) => definition.moveId),
      expectedMoveIds,
    );
    for (const definition of SPARC_AUTOTUTOR_DIALOGUE_MOVE_DEFINITIONS) {
      assert.equal(definition.version, 'v1');
      assert.equal(definition.family, 'autotutor-dialogue');
      assert.equal(definition.status, 'active');
      assert.equal(definition.promptId, `autotutor.${definition.moveId}`);
      const expectedPromptVersion = definition.moveId === 'question-scope-refusal' ? 'v1'
        : definition.moveId === 'pump' ? 'v5'
          : definition.moveId === 'question-deferral' || definition.moveId === 'prompt' || definition.moveId === 'hint'
            ? 'v3'
            : 'v2';
      assert.equal(definition.promptVersion, expectedPromptVersion);
      assert.equal(definition.outputSchemaId, 'autotutor.chat_utterance');
      assert.equal(definition.outputSchemaVersion, 'v1');
      assert.equal(definition.renderer, 'sparc.dialogue_utterance');
      assert.equal(definition.historyAction, 'sparc-dialogue-turn');
    }
  });

  it('uses ordered plain-text prompt policies with the learner-language boundary', function() {
    for (const definition of SPARC_AUTOTUTOR_DIALOGUE_MOVE_DEFINITIONS) {
      const lines = definition.promptPolicy.split('\n');
      lines.forEach((line, index) => {
        assert.match(line, new RegExp(`^${index + 1}\\. `));
      });
      assert.ok(definition.promptPolicy.includes('rubric language'));
      assert.doesNotMatch(definition.promptPolicy, /\*\*|`|<br>|\|/i);
      assert.doesNotMatch(definition.promptPolicy, /I hear you|I hear that you think|Always begin/);
    }
  });

  it('defines target-specific execution in every scaffold move', function() {
    for (const moveId of ['prompt', 'hint', 'assertion']) {
      const policy = requireActiveSparcMoveDefinition(moveId).promptPolicy;
      assert.ok(policy.includes('If targetType is learningTarget'));
      assert.ok(policy.includes('If targetType is misconception'));
      assert.ok(policy.includes(
        'Do not describe repetition or endorsement of an active misconception as progress, closeness, or a good start.',
      ));
    }
  });

  it('keeps pumps open within a named active concept while grounding hints in target content', function() {
    const pump = requireActiveSparcMoveDefinition('pump').promptPolicy;
    const hint = requireActiveSparcMoveDefinition('hint').promptPolicy;

    assert.ok(pump.includes('genuinely open invitation'));
    assert.ok(pump.includes('Content-grounded acknowledgement'));
    assert.ok(pump.includes('anchored to one concept, relationship, calculation, or conclusion actually present'));
    assert.ok(pump.includes('Explicitly identify the active concept before the open invitation'));
    assert.ok(pump.includes('Derive one short, natural, learner-facing concept name'));
    assert.ok(pump.includes('do not expose an internal id or recite the full target proposition'));
    assert.ok(pump.includes('content the learner has already contributed or correctly established'));
    assert.ok(pump.includes('Keep the invitation open within that named concept'));
    assert.ok(pump.includes('Use the selected target to determine the pump\'s named subject'));
    assert.ok(pump.includes('Semantic openness check'));
    assert.ok(pump.includes('Do not reuse the same interrogative frame'));
    assert.ok(pump.includes('Do not combine an open invitation with a content-specific question'));
    assert.doesNotMatch(pump, /choose the dimension of elaboration|open that dimension explicitly/);
    assert.ok(hint.includes('Use the selected authored target content as the destination of the clue'));
  });

  it('answers legitimate attempted questions while retaining work-preserving deferral and scope boundaries', function() {
    const deferral = requireActiveSparcMoveDefinition('question-deferral').promptPolicy;
    const refusal = requireActiveSparcMoveDefinition('question-scope-refusal').promptPolicy;

    assert.ok(deferral.includes('give brief and direct correctness feedback on that proposal'));
    assert.ok(deferral.includes('Confirm it when correct'));
    assert.ok(deferral.includes('Defer only when the learner asks the tutor to perform reasoning'));
    assert.ok(deferral.includes('confirm or reject only the proposition the learner supplied'));
    assert.ok(deferral.includes('Do not calculate an unstated result'));
    assert.ok(deferral.includes('without referring to answer revelation, tutoring procedure, reflection time'));
    assert.ok(deferral.includes('Do not add a separate instructional question as part of this modifier'));
    assert.doesNotMatch(deferral, /work with the problem a little longer|Do not answer the learner's question/);
    assert.ok(refusal.includes('cannot discuss that subject'));
    assert.ok(refusal.includes('rude, lewd, illicit'));
  });

  it('keeps hints short of assertions and explains technically decisive conditions', function() {
    const hint = requireActiveSparcMoveDefinition('hint').promptPolicy;
    const prompt = requireActiveSparcMoveDefinition('prompt').promptPolicy;

    assert.ok(hint.includes('it must leave the selected inference or correction for the learner'));
    assert.ok(hint.includes('Do not simply replace the learner\'s claim with the complete correct claim'));
    assert.ok(hint.includes('Technical-condition clarity'));
    assert.ok(prompt.includes('Technical-condition clarity'));
    assert.ok(prompt.includes('Briefly restate the decisive condition in learner-accessible language'));
  });

  it('gives summary completion-specific trajectory instructions', function() {
    const policy = requireActiveSparcMoveDefinition('summary').promptPolicy;

    assert.ok(policy.includes('Build the summary primarily from completed expectations, repaired misconceptions'));
    assert.ok(policy.includes('Emphasize what the learner established'));
    assert.ok(policy.includes('Do not quote, catalogue, or foreground the learner\'s earlier errors'));
    assert.ok(policy.includes('Do not narrate the conversation turn by turn'));
    assert.ok(policy.includes('For max-turn completion'));
  });

  it('does not register retired SPARC move primitives', function() {
    const retiredMoveIds = [
      'positive_pump',
      'elaborate',
      'splice',
      'positive_feedback',
      'neutral_feedback',
      'negative_feedback',
      'positive_neutral_feedback',
      'negative_neutral_feedback',
    ];

    for (const moveId of retiredMoveIds) {
      assert.equal(getSparcMoveDefinition(moveId), undefined);
      assert.throws(
        () => requireActiveSparcMoveDefinition(moveId),
        new RegExp(`selected move "${moveId}" has no registered move definition`),
      );
    }
  });

  it('registers assertion as the direct-content scaffold stage', function() {
    const assertion = requireActiveSparcMoveDefinition('assertion');
    assert.equal(assertion.status, 'active');
    assert.ok(assertion.promptPolicy.includes('state the missing expectation content'));
    assert.ok(assertion.promptPolicy.includes('Assertion is the terminal scaffold level for an unresolved target'));
    assert.ok(assertion.promptPolicy.includes('Do not return to a pump, prompt, or hint'));
  });

  it('uses unique move ids and prompt ids', function() {
    const moveIds = SPARC_AUTOTUTOR_DIALOGUE_MOVE_DEFINITIONS.map((definition) => definition.moveId);
    const promptIds = SPARC_AUTOTUTOR_DIALOGUE_MOVE_DEFINITIONS.map((definition) => definition.promptId);

    assert.equal(new Set(moveIds).size, moveIds.length);
    assert.equal(new Set(promptIds).size, promptIds.length);
  });
});
