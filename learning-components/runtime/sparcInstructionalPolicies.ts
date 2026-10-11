// Shared authoring/runtime contract. No executable learner code belongs here.
export const SPARC_PROGRESSIVE_SCAFFOLDING_POLICY_ID = 'progressive-scaffolding-v1';
export const SPARC_STUDENT_SELECTED_POLICY_ID = 'student-selected-v2';
export const SPARC_AGENT_SELECTED_POLICY_ID = 'agent-selected-v1';
export const SPARC_COMPETITIVE_POLICY_ID = 'oet-boltzmann-v2';
export const SPARC_INSTRUCTIONAL_POLICY_IDS = [
  SPARC_PROGRESSIVE_SCAFFOLDING_POLICY_ID, SPARC_STUDENT_SELECTED_POLICY_ID, SPARC_AGENT_SELECTED_POLICY_ID, SPARC_COMPETITIVE_POLICY_ID,
] as const;

/** Account routing only; no learner algorithm belongs in this shared server contract. */
export function sparcPolicyForAccount(isAdmin: boolean, policyId: unknown): string {
  if (!SPARC_INSTRUCTIONAL_POLICY_IDS.some((known) => known === policyId)) {
    throw new Error(`Unknown AutoTutor instructional policy: ${policyId}`);
  }
  if (!isAdmin) return SPARC_PROGRESSIVE_SCAFFOLDING_POLICY_ID;
  return policyId === SPARC_STUDENT_SELECTED_POLICY_ID ? policyId : SPARC_COMPETITIVE_POLICY_ID;
}

export function isSparcAdminPolicy(policyId: unknown): boolean {
  return policyId === SPARC_COMPETITIVE_POLICY_ID || policyId === SPARC_STUDENT_SELECTED_POLICY_ID;
}
