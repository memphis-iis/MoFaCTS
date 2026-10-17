import {
  projectSparcInstructionalCandidates,
  type SparcInstructionalCandidateOptions,
  type SparcInstructionalCandidateProjection,
  type SparcInstructionalTargetKind,
} from './sparcInstructionalCandidates';
import type {
  SparcInstructionalControllerConfig,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';
import { isSparcCompetitivePolicy, isSparcStudentPolicy, SPARC_INSTRUCTIONAL_POLICY_IDS } from '../../runtime/sparcInstructionalPolicies';
export { SPARC_PROGRESSIVE_SCAFFOLDING_POLICY_ID } from '../../runtime/sparcInstructionalPolicies';

export const SPARC_AUTOTUTOR_ADAPTER_ID = 'sparc-autotutor-v1';
export const SPARC_PROGRESSIVE_SCAFFOLDING_POLICY_VERSION = 1;

export function isSparcInstructionalCycle(config: SparcInstructionalControllerConfig | undefined): boolean {
  return isSparcCompetitivePolicy(config?.policyId) || isSparcStudentPolicy(config?.policyId);
}

export type SparcAutoTutorInstructionalProjection = {
  readonly candidates: SparcInstructionalCandidateProjection;
  readonly facts: readonly SparcWorkingMemoryFact[];
};

function nonBlank(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function requireNonBlank(value: unknown, label: string): string {
  const normalized = nonBlank(value);
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function finite(value: unknown, label: string): number {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) throw new Error(`${label} must be a finite number`);
  return normalized;
}

function optionalFinite(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : undefined;
}

function stringSlot(fact: SparcWorkingMemoryFact | undefined, slot: string): string | undefined {
  return nonBlank(fact?.slots?.[slot]);
}

function minimumProgress(config: SparcInstructionalControllerConfig): number {
  const value = optionalFinite(config.parameters?.minimumProgress) ?? 0.2;
  if (value < 0 || value > 1) throw new Error('SPARC instructionalController.parameters.minimumProgress must be from 0 to 1');
  return value;
}

export function assertSparcInstructionalControllerConfig(
  config: SparcInstructionalControllerConfig | undefined,
): asserts config is SparcInstructionalControllerConfig {
  if (!config) throw new Error('SPARC AutoTutor display requires instructionalController');
  const adapterId = requireNonBlank(config.adapterId, 'SPARC instructionalController.adapterId');
  const policyId = requireNonBlank(config.policyId, 'SPARC instructionalController.policyId');
  if (adapterId !== SPARC_AUTOTUTOR_ADAPTER_ID) throw new Error(`SPARC instructional adapter "${adapterId}" is not registered`);
  if (!(SPARC_INSTRUCTIONAL_POLICY_IDS as readonly string[]).includes(policyId)) throw new Error(`SPARC authored instructional policy "${policyId}" is not registered`);
  if (config.policyVersion !== SPARC_PROGRESSIVE_SCAFFOLDING_POLICY_VERSION) {
    throw new Error(`SPARC authored instructional policy version "${String(config.policyVersion)}" is not supported`);
  }
  minimumProgress(config);
}

function latestActiveCycle(facts: readonly SparcWorkingMemoryFact[]): SparcWorkingMemoryFact | undefined {
  if (facts.some((fact) => ['instructionalTarget.active', 'instructionalFocus.episode', 'scaffold.state'].includes(fact.factType))) {
    throw new Error('Pre-canonical SPARC instructional state is unsupported');
  }
  return facts
    .filter((fact) => fact.factType === 'instructional.activeCycle' && fact.slots?.status === 'active')
    .at(-1);
}

function currentCandidate(
  candidates: SparcInstructionalCandidateProjection,
  targetKind: SparcInstructionalTargetKind,
  targetId: string,
) {
  return targetKind === 'expectation'
    ? candidates.expectations.find((candidate) => candidate.targetId === targetId)
    : candidates.misconceptions.find((candidate) => candidate.targetId === targetId);
}

function progressFact(params: {
  readonly snapshotId: string;
  readonly cycle: SparcWorkingMemoryFact;
  readonly candidate: NonNullable<ReturnType<typeof currentCandidate>>;
  readonly config: SparcInstructionalControllerConfig;
}): SparcWorkingMemoryFact {
  const cycleId = requireNonBlank(params.cycle.slots?.cycleId, 'SPARC active cycle id');
  const targetKind = requireNonBlank(params.cycle.slots?.targetKind, 'SPARC active cycle targetKind') as SparcInstructionalTargetKind;
  const targetId = requireNonBlank(params.cycle.slots?.targetId, 'SPARC active cycle targetId');
  const targetKey = requireNonBlank(params.cycle.slots?.targetKey, 'SPARC active cycle targetKey');
  const priorValue = finite(params.cycle.slots?.priorValue, 'SPARC active cycle priorValue');
  const currentValue = params.candidate.targetKind === 'expectation'
    ? params.candidate.coverage
    : params.candidate.supportStrength;
  const rawGain = targetKind === 'expectation' ? currentValue - priorValue : priorValue - currentValue;
  const gain = Math.round(rawGain * 1_000_000) / 1_000_000;
  const goalReached = !params.candidate.eligible;
  const meaningfulGain = gain >= minimumProgress(params.config) || goalReached;
  return {
    factType: 'instructional.progress',
    slots: {
      snapshotId: params.snapshotId,
      cycleId,
      targetKind,
      targetId,
      targetKey,
      priorValue,
      currentValue,
      gain,
      meaningfulGain,
      goalReached,
    },
  };
}

export function projectSparcAutoTutorInstructionalFacts(params: {
  readonly snapshotId: string;
  readonly facts: readonly SparcWorkingMemoryFact[];
  readonly config: SparcInstructionalControllerConfig;
  readonly candidateOptions?: SparcInstructionalCandidateOptions;
}): SparcAutoTutorInstructionalProjection {
  assertSparcInstructionalControllerConfig(params.config);
  const cycle = latestActiveCycle(params.facts);
  // A completed expectation cycle still identifies the KC we are leaving.
  // During misconception repair, replayed tutor instructions retain the last KC
  // without introducing a second persisted focus or interpreting learner text.
  const precedingKC = cycle?.slots?.targetKind === 'expectation'
    ? stringSlot(cycle, 'targetId')
    : stringSlot(params.facts.filter(fact => fact.factType === 'dialogue.utterance'
      && fact.slots?.speaker === 'tutor' && fact.slots?.targetType === 'learningTarget').at(-1), 'targetId');
  const anchorClusterKC = params.candidateOptions?.anchorClusterKC ?? precedingKC;
  const candidates = projectSparcInstructionalCandidates({
    snapshotId: params.snapshotId,
    facts: params.facts,
    policyId: params.config.policyId,
    options: { ...params.candidateOptions, ...(anchorClusterKC ? { anchorClusterKC } : {}) },
  });
  let progress: SparcWorkingMemoryFact | undefined;
  let continuable = false;
  if (cycle) {
    const targetKind = stringSlot(cycle, 'targetKind') as SparcInstructionalTargetKind | undefined;
    const targetId = stringSlot(cycle, 'targetId');
    if (!targetId || (targetKind !== 'expectation' && targetKind !== 'misconception')) {
      throw new Error('SPARC instructional.activeCycle requires expectation or misconception target identity');
    }
    const candidate = currentCandidate(candidates, targetKind, targetId);
    if (!candidate) throw new Error(`SPARC active cycle target "${targetKind}:${targetId}" is not authored`);
    continuable = candidate.eligible;
    progress = progressFact({
      snapshotId: params.snapshotId,
      cycle,
      candidate,
      config: params.config,
    });
  }
  const cycleStatus: SparcWorkingMemoryFact = {
    factType: 'instructional.cycleStatus',
    slots: {
      snapshotId: params.snapshotId,
      hasActiveCycle: Boolean(cycle),
      continuable,
      ...(cycle ? {
        cycleId: cycle.slots?.cycleId,
        targetKind: cycle.slots?.targetKind,
        targetId: cycle.slots?.targetId,
        targetKey: cycle.slots?.targetKey,
      } : {}),
    },
  };
  return {
    candidates,
    facts: [
      ...candidates.facts,
      ...(cycle ? [cycle] : []),
      ...(progress ? [progress] : []),
      cycleStatus,
    ],
  };
}
