import { expect } from 'chai';
import {
  canResumeCurrentCardFromLastAction,
  classifyResumeDecision,
  getResumeDecisionReasonCode,
  LAST_ACTION,
  RESUME_DECISION,
  RESUME_REASON_CODE,
} from './resumeActions';

describe('resumeActions', function() {
  it('only resumes current card from canonical displayed action', function() {
    expect(canResumeCurrentCardFromLastAction(LAST_ACTION.CARD_DISPLAYED)).to.equal(true);
    expect(canResumeCurrentCardFromLastAction(LAST_ACTION.CARD_RESPONSE_RECORDED)).to.equal(false);
    expect(canResumeCurrentCardFromLastAction('question')).to.equal(false);
  });

  it('classifies resume decisions with canonical action contract', function() {
    expect(
      classifyResumeDecision({ lastAction: LAST_ACTION.CARD_DISPLAYED, moduleCompleted: false, showInstructions: false })
    ).to.equal(RESUME_DECISION.RESUME_CURRENT_CARD);
    expect(
      classifyResumeDecision({ lastAction: LAST_ACTION.CARD_RESPONSE_RECORDED, moduleCompleted: false, showInstructions: false })
    ).to.equal(RESUME_DECISION.ADVANCE_TO_NEXT_CARD);
    expect(
      classifyResumeDecision({ lastAction: LAST_ACTION.CARD_TIMEOUT, moduleCompleted: false, showInstructions: true })
    ).to.equal(RESUME_DECISION.REDIRECT_INSTRUCTIONS);
    expect(
      classifyResumeDecision({ lastAction: LAST_ACTION.UNIT_ENDED, moduleCompleted: true, showInstructions: false })
    ).to.equal(RESUME_DECISION.UNIT_COMPLETE);
    expect(
      classifyResumeDecision({ lastAction: 'question', moduleCompleted: false, showInstructions: false })
    ).to.equal(RESUME_DECISION.HARD_STOP);
    expect(
      classifyResumeDecision({ lastAction: undefined, moduleCompleted: false, showInstructions: false })
    ).to.equal(RESUME_DECISION.ADVANCE_TO_NEXT_CARD);
    expect(
      classifyResumeDecision({ lastAction: null, moduleCompleted: false, showInstructions: true })
    ).to.equal(RESUME_DECISION.REDIRECT_INSTRUCTIONS);
    expect(
      classifyResumeDecision({ lastAction: '', moduleCompleted: false, showInstructions: false })
    ).to.equal(RESUME_DECISION.ADVANCE_TO_NEXT_CARD);
  });

  it('maps decisions to stable reason codes', function() {
    expect(getResumeDecisionReasonCode(RESUME_DECISION.HARD_STOP, 'x')).to.equal(
      RESUME_REASON_CODE.INVALID_LAST_ACTION
    );
    expect(
      getResumeDecisionReasonCode(RESUME_DECISION.UNIT_COMPLETE, LAST_ACTION.UNIT_ENDED)
    ).to.equal(RESUME_REASON_CODE.MODULE_COMPLETED);
    expect(
      getResumeDecisionReasonCode(RESUME_DECISION.RESUME_CURRENT_CARD, LAST_ACTION.CARD_DISPLAYED)
    ).to.equal(RESUME_REASON_CODE.ACTION_CARD_DISPLAYED);
    expect(
      getResumeDecisionReasonCode(RESUME_DECISION.REDIRECT_INSTRUCTIONS, LAST_ACTION.CARD_TIMEOUT)
    ).to.equal(RESUME_REASON_CODE.SHOW_INSTRUCTIONS);
    expect(
      getResumeDecisionReasonCode(RESUME_DECISION.ADVANCE_TO_NEXT_CARD, LAST_ACTION.CARD_TIMEOUT)
    ).to.equal(RESUME_REASON_CODE.ACTION_CARD_TIMEOUT);
    expect(
      getResumeDecisionReasonCode(RESUME_DECISION.ADVANCE_TO_NEXT_CARD, LAST_ACTION.CARD_RESPONSE_RECORDED)
    ).to.equal(RESUME_REASON_CODE.ACTION_CARD_RESPONSE_RECORDED);
    expect(
      getResumeDecisionReasonCode(RESUME_DECISION.ADVANCE_TO_NEXT_CARD, LAST_ACTION.UNIT_ENDED)
    ).to.equal(RESUME_REASON_CODE.ACTION_UNIT_ENDED);
  });
});
