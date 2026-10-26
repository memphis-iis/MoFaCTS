// Shared authoring/runtime contract. No executable learner code belongs here.
export const SPARC_PROGRESSIVE_SCAFFOLDING_POLICY_ID = 'progressive-scaffolding-v1';
export const SPARC_CATEGORIZED_AGENT_POLICY_ID = 'dynamic-instruction-agent-v2';
export const SPARC_CATEGORIZED_STUDENT_POLICY_ID = 'dynamic-instruction-student-v2';
export function isSparcCategorizedPolicy(policyId: unknown): boolean {
  return policyId === SPARC_CATEGORIZED_AGENT_POLICY_ID || policyId === SPARC_CATEGORIZED_STUDENT_POLICY_ID;
}
export function isSparcStudentPolicy(policyId: unknown): boolean {
  return policyId === SPARC_CATEGORIZED_STUDENT_POLICY_ID;
}
export function isSparcCompetitivePolicy(policyId: unknown): boolean {
  return policyId === SPARC_CATEGORIZED_AGENT_POLICY_ID;
}
export const SPARC_INSTRUCTIONAL_POLICY_IDS = [
  SPARC_PROGRESSIVE_SCAFFOLDING_POLICY_ID,
  SPARC_CATEGORIZED_AGENT_POLICY_ID, SPARC_CATEGORIZED_STUDENT_POLICY_ID,
] as const;

/** Preserve the authored policy. Authentication and lesson access are enforced by the app/server. */
export function sparcPolicyForAccount(_isAdmin: boolean, policyId: unknown): string {
  if (!SPARC_INSTRUCTIONAL_POLICY_IDS.some((known) => known === policyId)) {
    throw new Error(`Unsupported AutoTutor instructional policy: ${policyId}`);
  }
  return policyId as string;
}

/** Authorization classification also covers historical admin-only labels.
 * This does not register a runtime policy or permit continuation under a retired policy.
 * Keep historical writes protected while stored records retain their original identity.
 */
export function isSparcAdminPolicy(policyId: unknown): boolean {
  return isSparcCategorizedPolicy(policyId)
    || ['student-selected-v2', 'oet-boltzmann-v2', 'dynamic-instruction-agent-v1', 'dynamic-instruction-student-v1'].includes(String(policyId));
}
