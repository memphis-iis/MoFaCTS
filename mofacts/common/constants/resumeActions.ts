// Canonical action and resume decision contract for Svelte resume flow.

export const LAST_ACTION = {
  CARD_DISPLAYED: 'CARD_DISPLAYED',
  CARD_RESPONSE_RECORDED: 'CARD_RESPONSE_RECORDED',
  CARD_TIMEOUT: 'CARD_TIMEOUT',
  UNIT_ENDED: 'UNIT_ENDED',
} as const;

export type LastAction = (typeof LAST_ACTION)[keyof typeof LAST_ACTION];

export const RESUME_DECISION = {
  RESUME_CURRENT_CARD: 'resume_current_card',
  ADVANCE_TO_NEXT_CARD: 'advance_to_next_card',
  REDIRECT_INSTRUCTIONS: 'redirect_instructions',
  UNIT_COMPLETE: 'unit_complete',
  HARD_STOP: 'hard_stop',
} as const;

type ResumeDecision = (typeof RESUME_DECISION)[keyof typeof RESUME_DECISION];

export const RESUME_REASON_CODE = {
  INVALID_LAST_ACTION: 'INVALID_LAST_ACTION',
  MODULE_COMPLETED: 'MODULE_COMPLETED',
  ACTION_CARD_DISPLAYED: 'ACTION_CARD_DISPLAYED',
  SHOW_INSTRUCTIONS: 'SHOW_INSTRUCTIONS',
  ACTION_CARD_TIMEOUT: 'ACTION_CARD_TIMEOUT',
  ACTION_CARD_RESPONSE_RECORDED: 'ACTION_CARD_RESPONSE_RECORDED',
  ACTION_UNIT_ENDED: 'ACTION_UNIT_ENDED',
  ACTION_ADVANCE: 'ACTION_ADVANCE',
} as const;

type ResumeReasonCode = (typeof RESUME_REASON_CODE)[keyof typeof RESUME_REASON_CODE];

function isCanonicalLastAction(value: unknown): value is LastAction {
  return typeof value === 'string' && Object.values(LAST_ACTION).includes(value as LastAction);
}

export function canResumeCurrentCardFromLastAction(lastAction: unknown): boolean {
  return lastAction === LAST_ACTION.CARD_DISPLAYED;
}

export function hasMeaningfulProgressLastAction(lastAction: unknown): boolean {
  return (
    lastAction === LAST_ACTION.CARD_DISPLAYED ||
    lastAction === LAST_ACTION.CARD_RESPONSE_RECORDED ||
    lastAction === LAST_ACTION.CARD_TIMEOUT ||
    lastAction === LAST_ACTION.UNIT_ENDED
  );
}

export function classifyResumeDecision(params: {
  lastAction: unknown;
  moduleCompleted?: boolean;
  showInstructions?: boolean;
}): ResumeDecision {
  const { lastAction, moduleCompleted = false, showInstructions = false } = params;

  if (moduleCompleted) {
    return RESUME_DECISION.UNIT_COMPLETE;
  }

  // Missing action is treated as a fresh/new start, not a corrupt resume state.
  if (lastAction === undefined || lastAction === null || lastAction === '') {
    return showInstructions
      ? RESUME_DECISION.REDIRECT_INSTRUCTIONS
      : RESUME_DECISION.ADVANCE_TO_NEXT_CARD;
  }

  if (!isCanonicalLastAction(lastAction)) {
    return RESUME_DECISION.HARD_STOP;
  }

  if (lastAction === LAST_ACTION.CARD_DISPLAYED) {
    return RESUME_DECISION.RESUME_CURRENT_CARD;
  }

  if (showInstructions) {
    return RESUME_DECISION.REDIRECT_INSTRUCTIONS;
  }

  if (
    lastAction === LAST_ACTION.CARD_RESPONSE_RECORDED ||
    lastAction === LAST_ACTION.CARD_TIMEOUT ||
    lastAction === LAST_ACTION.UNIT_ENDED
  ) {
    return RESUME_DECISION.ADVANCE_TO_NEXT_CARD;
  }

  return RESUME_DECISION.HARD_STOP;
}

export function getResumeDecisionReasonCode(decision: ResumeDecision, lastAction: unknown): ResumeReasonCode {
  if (decision === RESUME_DECISION.HARD_STOP) return RESUME_REASON_CODE.INVALID_LAST_ACTION;
  if (decision === RESUME_DECISION.UNIT_COMPLETE) return RESUME_REASON_CODE.MODULE_COMPLETED;
  if (decision === RESUME_DECISION.RESUME_CURRENT_CARD) return RESUME_REASON_CODE.ACTION_CARD_DISPLAYED;
  if (decision === RESUME_DECISION.REDIRECT_INSTRUCTIONS) return RESUME_REASON_CODE.SHOW_INSTRUCTIONS;
  if (lastAction === LAST_ACTION.CARD_TIMEOUT) return RESUME_REASON_CODE.ACTION_CARD_TIMEOUT;
  if (lastAction === LAST_ACTION.CARD_RESPONSE_RECORDED) return RESUME_REASON_CODE.ACTION_CARD_RESPONSE_RECORDED;
  if (lastAction === LAST_ACTION.UNIT_ENDED) return RESUME_REASON_CODE.ACTION_UNIT_ENDED;
  return RESUME_REASON_CODE.ACTION_ADVANCE;
}
