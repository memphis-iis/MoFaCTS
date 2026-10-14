// Shared authoring/runtime contract. No executable learner code belongs here.
export const SPARC_PROGRESSIVE_SCAFFOLDING_POLICY_ID = 'progressive-scaffolding-v1';
export const SPARC_STUDENT_SELECTED_POLICY_ID = 'student-selected-v2';
export const SPARC_AGENT_SELECTED_POLICY_ID = 'agent-selected-v1';
export const SPARC_COMPETITIVE_POLICY_ID = 'oet-boltzmann-v2';
export const SPARC_DYNAMIC_AGENT_POLICY_ID = 'dynamic-instruction-agent-v1';
export const SPARC_DYNAMIC_STUDENT_POLICY_ID = 'dynamic-instruction-student-v1';
export const SPARC_CATEGORIZED_AGENT_POLICY_ID = 'dynamic-instruction-agent-v2';
export const SPARC_CATEGORIZED_STUDENT_POLICY_ID = 'dynamic-instruction-student-v2';
export function isSparcCategorizedPolicy(policyId: unknown): boolean {
  return policyId === SPARC_CATEGORIZED_AGENT_POLICY_ID || policyId === SPARC_CATEGORIZED_STUDENT_POLICY_ID;
}
export function isSparcDynamicPolicy(policyId: unknown): boolean {
  return policyId === SPARC_DYNAMIC_AGENT_POLICY_ID || policyId === SPARC_DYNAMIC_STUDENT_POLICY_ID || isSparcCategorizedPolicy(policyId);
}
export function isSparcStudentPolicy(policyId: unknown): boolean {
  return policyId === SPARC_STUDENT_SELECTED_POLICY_ID || policyId === SPARC_DYNAMIC_STUDENT_POLICY_ID || policyId === SPARC_CATEGORIZED_STUDENT_POLICY_ID;
}
export function isSparcCompetitivePolicy(policyId: unknown): boolean {
  return policyId === SPARC_COMPETITIVE_POLICY_ID || policyId === SPARC_DYNAMIC_AGENT_POLICY_ID || policyId === SPARC_CATEGORIZED_AGENT_POLICY_ID;
}
export const SPARC_INSTRUCTIONAL_POLICY_IDS = [
  SPARC_PROGRESSIVE_SCAFFOLDING_POLICY_ID, SPARC_STUDENT_SELECTED_POLICY_ID, SPARC_AGENT_SELECTED_POLICY_ID, SPARC_COMPETITIVE_POLICY_ID,
  SPARC_DYNAMIC_AGENT_POLICY_ID, SPARC_DYNAMIC_STUDENT_POLICY_ID,
  SPARC_CATEGORIZED_AGENT_POLICY_ID, SPARC_CATEGORIZED_STUDENT_POLICY_ID,
] as const;

/** Account routing only; no learner algorithm belongs in this shared server contract. */
export function sparcPolicyForAccount(isAdmin: boolean, policyId: unknown): string {
  if (!SPARC_INSTRUCTIONAL_POLICY_IDS.some((known) => known === policyId)) {
    throw new Error(`Unknown AutoTutor instructional policy: ${policyId}`);
  }
  if (!isAdmin) {
    if (isSparcDynamicPolicy(policyId)) throw new Error('Dynamic instruction requires an admin account');
    return SPARC_PROGRESSIVE_SCAFFOLDING_POLICY_ID;
  }
  if (isSparcDynamicPolicy(policyId)) return policyId as string;
  return policyId === SPARC_STUDENT_SELECTED_POLICY_ID ? policyId : SPARC_COMPETITIVE_POLICY_ID;
}

export function isSparcAdminPolicy(policyId: unknown): boolean {
  return isSparcCompetitivePolicy(policyId) || isSparcStudentPolicy(policyId);
}
