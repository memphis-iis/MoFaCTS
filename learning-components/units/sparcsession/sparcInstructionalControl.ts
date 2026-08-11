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

export const SPARC_AUTOTUTOR_ADAPTER_ID = 'sparc-autotutor-v1';
export const SPARC_PROGRESSIVE_SCAFFOLDING_POLICY_ID = 'progressive-scaffolding-v1';
export const SPARC_PROGRESSIVE_SCAFFOLDING_POLICY_VERSION = 1;

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
  if (policyId !== SPARC_PROGRESSIVE_SCAFFOLDING_POLICY_ID) throw new Error(`SPARC authored instructional policy "${policyId}" is not registered`);
  if (config.policyVersion !== SPARC_PROGRESSIVE_SCAFFOLDING_POLICY_VERSION) {
    throw new Error(`SPARC authored instructional policy version "${String(config.policyVersion)}" is not supported`);
  }
  minimumProgress(config);
}

function preCanonicalActiveCycle(facts: readonly SparcWorkingMemoryFact[]): SparcWorkingMemoryFact | undefined {
  const target = facts
    .filter((fact) => fact.factType === 'instructionalTarget.active' && fact.slots?.status === 'active')
    .at(-1);
  if (!target) return undefined;
  const targetKind = stringSlot(target, 'targetKind');
  const targetId = stringSlot(target, 'targetId');
  const targetKey = stringSlot(target, 'targetKey');
  if (!targetId || !targetKey || (targetKind !== 'expectation' && targetKind !== 'misconception')) return undefined;
  const focus = facts
    .filter((fact) => fact.factType === 'instructionalFocus.episode' && fact.slots?.status === 'active')
    .at(-1);
  const focusEpisodeId = stringSlot(focus, 'focusEpisodeId') ?? `precanonical:${targetKey}`;
  const scaffold = facts
    .filter((fact) => fact.factType === 'scaffold.state' && fact.slots?.focusEpisodeId === focusEpisodeId)
    .at(-1);
  const progressValue = optionalFinite(target.slots?.currentProgress) ?? 0;
  const priorValue = targetKind === 'expectation' ? progressValue : 1 - progressValue;
  return {
    factType: 'instructional.activeCycle',
    slots: {
      cycleId: focusEpisodeId,
      targetKind,
      targetId,
      targetKey,
      stage: stringSlot(scaffold, 'stage') ?? 'PUMP',
      priorValue,
      startedAtTurn: optionalFinite(focus?.slots?.startedAtTurn) ?? 0,
      cycleTurnCount: 0,
      status: 'active',
      migratedFrom: 'pre-canonical-instructional-focus',
    },
  };
}

function latestActiveCycle(facts: readonly SparcWorkingMemoryFact[]): SparcWorkingMemoryFact | undefined {
  return facts
    .filter((fact) => fact.factType === 'instructional.activeCycle' && fact.slots?.status === 'active')
    .at(-1) ?? preCanonicalActiveCycle(facts);
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
  const candidates = projectSparcInstructionalCandidates({
    snapshotId: params.snapshotId,
    facts: params.facts,
    ...(params.candidateOptions ? { options: params.candidateOptions } : {}),
  });
  const cycle = latestActiveCycle(params.facts);
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
