import { expect } from 'chai';
import { AI_CONTENT_CONTRACT_VERSION } from '../../common/aiContentContract';
import { AI_CONTENT_AI_STAGE_IDS } from './aiContentPrompts';
import {
  createAiContentPromptLabDraft,
  parsePromptLabWorkspace,
  promptLabCheckpoint,
  updatePromptLabStage,
} from './aiContentPromptLabState';

describe('AI Content Prompt Lab state', function() {
  it('seeds author notes and explicit settings for every live AI stage', function() {
    const draft = createAiContentPromptLabDraft({ model: 'openai/test', reasoningLevel: 'medium' });
    expect(draft.authorNotes).not.to.equal('');
    expect(draft.model).to.equal('openai/test');
    AI_CONTENT_AI_STAGE_IDS.forEach((stage) => {
      expect(draft.stages[stage].reasoningLevel).to.equal('medium');
      expect(draft.stages[stage].visibleOutputTokens).to.be.greaterThan(0);
    });
  });

  it('updates one stage without mutating the other stage settings', function() {
    const draft = createAiContentPromptLabDraft();
    const updated = updatePromptLabStage(draft, 'generate-definition', { reasoningLevel: 'high' });
    expect(updated.stages['generate-definition'].reasoningLevel).to.equal('high');
    expect(updated.stages['interpret-request']).to.deep.equal(draft.stages['interpret-request']);
  });

  it('checkpoints every stage setting and restores only the current contract', function() {
    const draft = createAiContentPromptLabDraft({ model: 'openai/test', reasoningLevel: 'low' });
    const checkpoint = promptLabCheckpoint(draft, '2026-08-15T00:00:00.000Z', 'first');
    const parsed = parsePromptLabWorkspace({
      contractVersion: AI_CONTENT_CONTRACT_VERSION,
      draft,
      checkpoints: [{ ...checkpoint, draft: { ...checkpoint.draft, model: 'openai/stale' } }],
    });
    expect(parsed?.checkpoints[0]?.draft.stages['select-detail-link'].reasoningLevel).to.equal('low');
    expect(parsed?.checkpoints[0]?.draft).not.to.have.property('model');
    expect(parsePromptLabWorkspace({ contractVersion: 3, draft, checkpoints: [] })).to.equal(null);
  });
});
