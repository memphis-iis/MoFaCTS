import type { SparcLearningTargetSelection } from './sparcTargetSelection';
import type {
  SparcInstructionalControllerConfig,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';

export const SPARC_AUTOTUTOR_ADAPTER_ID = 'sparc-autotutor-v1';
export const SPARC_PROGRESSIVE_SCAFFOLDING_POLICY_ID = 'progressive-scaffolding-v1';
export const SPARC_PROGRESSIVE_SCAFFOLDING_POLICY_VERSION = 1;

type SparcInstructionalTargetKind = 'expectation' | 'misconception';
type SparcScaffoldStage = 'ELICIT' | 'PUMP' | 'PROMPT' | 'HINT' | 'ASSERTION';

function nonBlank(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function requireNonBlank(value: unknown, label: string): string {
  const normalized = nonBlank(value);
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function number(value: unknown, label: string): number {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) throw new Error(`${label} must be a finite number`);
  return normalized;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : undefined;
}

function stringSlot(fact: SparcWorkingMemoryFact | undefined, slot: string): string | undefined {
  return nonBlank(fact?.slots?.[slot]);
}

function latestFact(facts: readonly SparcWorkingMemoryFact[], factType: string): SparcWorkingMemoryFact | undefined {
  return facts.filter((fact) => fact.factType === factType).at(-1);
}

function matchingFacts(
  facts: readonly SparcWorkingMemoryFact[],
  factType: string,
  identitySlot: string,
  identity: string,
): SparcWorkingMemoryFact[] {
  return facts.filter((fact) => fact.factType === factType && stringSlot(fact, identitySlot) === identity);
}

function threshold(facts: readonly SparcWorkingMemoryFact[]): number {
  const dialogue = facts.find((fact) => fact.factType === 'dialogue.thresholds');
  const selection = facts.find((fact) => fact.factType === 'controller.targetSelectionPolicy');
  return optionalNumber(dialogue?.slots?.coverageThreshold)
    ?? optionalNumber(selection?.slots?.coverageThreshold)
    ?? 0.8;
}

function minimumProgress(config: SparcInstructionalControllerConfig): number {
  const value = optionalNumber(config.parameters?.minimumProgress) ?? 0.05;
  if (value < 0 || value > 1) {
    throw new Error('SPARC instructionalController.parameters.minimumProgress must be from 0 to 1');
  }
  return value;
}

export function assertSparcInstructionalControllerConfig(
  config: SparcInstructionalControllerConfig | undefined,
): asserts config is SparcInstructionalControllerConfig {
  if (!config) throw new Error('SPARC AutoTutor display requires instructionalController');
  const adapterId = requireNonBlank(config.adapterId, 'SPARC instructionalController.adapterId');
  const policyId = requireNonBlank(config.policyId, 'SPARC instructionalController.policyId');
  if (adapterId !== SPARC_AUTOTUTOR_ADAPTER_ID) {
    throw new Error(`SPARC instructional adapter "${adapterId}" is not registered`);
  }
  if (policyId !== SPARC_PROGRESSIVE_SCAFFOLDING_POLICY_ID) {
    throw new Error(`SPARC authored instructional policy "${policyId}" is not registered`);
  }
  if (config.policyVersion !== SPARC_PROGRESSIVE_SCAFFOLDING_POLICY_VERSION) {
    throw new Error(`SPARC authored instructional policy version "${String(config.policyVersion)}" is not supported`);
  }
  minimumProgress(config);
}

function selectedTarget(params: {
  readonly selection: SparcLearningTargetSelection;
  readonly facts: readonly SparcWorkingMemoryFact[];
}) {
  if (params.selection.selectedTargetType === 'misconception') {
    const targetId = requireNonBlank(params.selection.selectedMisconceptionId, 'SPARC selected misconception id');
    const scores = matchingFacts(params.facts, 'diagnostic.misconceptionScore', 'id', targetId);
    const confidence = optionalNumber(scores.at(-1)?.slots?.confidence) ?? 0;
    const repairConfidence = 1 - threshold(params.facts);
    return {
      targetKey: `misconception:${targetId}`,
      targetKind: 'misconception' as const,
      targetId,
      currentProgress: 1 - confidence,
      resolutionThreshold: 1 - repairConfidence,
      resolutionInclusive: false,
    };
  }
  const targetId = requireNonBlank(params.selection.selectedClusterKC, 'SPARC selected expectation clusterKC');
  const scores = matchingFacts(params.facts, 'learningTarget.score', 'clusterKC', targetId);
  return {
    targetKey: `expectation:${targetId}`,
    targetKind: 'expectation' as const,
    targetId,
    currentProgress: optionalNumber(scores.at(-1)?.slots?.coverage) ?? 0,
    resolutionThreshold: threshold(params.facts),
    resolutionInclusive: true,
  };
}

function observationForPreviousTarget(params: {
  readonly facts: readonly SparcWorkingMemoryFact[];
  readonly config: SparcInstructionalControllerConfig;
}): SparcWorkingMemoryFact | undefined {
  const target = latestFact(params.facts, 'instructionalTarget.active');
  const targetKey = stringSlot(target, 'targetKey');
  const targetKind = stringSlot(target, 'targetKind') as SparcInstructionalTargetKind | undefined;
  const targetId = stringSlot(target, 'targetId');
  if (!targetKey || !targetId || (targetKind !== 'expectation' && targetKind !== 'misconception')) return undefined;

  const scoreFactType = targetKind === 'expectation' ? 'learningTarget.score' : 'diagnostic.misconceptionScore';
  const identitySlot = targetKind === 'expectation' ? 'clusterKC' : 'id';
  const scoreSlot = targetKind === 'expectation' ? 'coverage' : 'confidence';
  const scores = matchingFacts(params.facts, scoreFactType, identitySlot, targetId);
  const beforeFact = scores.at(-2);
  const afterFact = scores.at(-1);
  if (!beforeFact || !afterFact) return undefined;
  const beforeScore = number(beforeFact.slots?.[scoreSlot], `SPARC prior ${scoreFactType}.${scoreSlot}`);
  const afterScore = number(afterFact.slots?.[scoreSlot], `SPARC current ${scoreFactType}.${scoreSlot}`);
  const progressBefore = targetKind === 'expectation' ? beforeScore : 1 - beforeScore;
  const progressAfter = targetKind === 'expectation' ? afterScore : 1 - afterScore;
  const progressDelta = Math.round((progressAfter - progressBefore) * 1_000_000) / 1_000_000;
  const resolutionThreshold = optionalNumber(target?.slots?.resolutionThreshold) ?? 0.8;
  return {
    factType: 'learningObservation.targetProgress',
    slots: {
      targetKey,
      targetKind,
      targetId,
      progressBefore,
      progressAfter,
      progressDelta,
      madeProgress: progressDelta >= minimumProgress(params.config),
      newlyResolved: targetKind === 'expectation'
        ? progressAfter >= resolutionThreshold
        : progressAfter > resolutionThreshold,
    },
  };
}

function turnCount(facts: readonly SparcWorkingMemoryFact[]): number {
  return Math.max(0, ...facts
    .filter((fact) => fact.factType === 'session.turnState')
    .map((fact) => optionalNumber(fact.slots?.turnCount) ?? 0));
}

export function instantiateSparcAutoTutorInstructionalFacts(params: {
  readonly selection: SparcLearningTargetSelection;
  readonly facts: readonly SparcWorkingMemoryFact[];
  readonly config: SparcInstructionalControllerConfig;
}): readonly SparcWorkingMemoryFact[] {
  assertSparcInstructionalControllerConfig(params.config);
  const target = selectedTarget(params);
  const previousFocus = latestFact(params.facts, 'instructionalFocus.episode');
  const continuing = stringSlot(previousFocus, 'targetKey') === target.targetKey
    && stringSlot(previousFocus, 'status') === 'active';
  const startedAtTurn = continuing
    ? number(previousFocus?.slots?.startedAtTurn, 'SPARC instructional focus startedAtTurn')
    : turnCount(params.facts);
  const focusEpisodeId = continuing
    ? requireNonBlank(previousFocus?.slots?.focusEpisodeId, 'SPARC instructional focus episode id')
    : `${target.targetKey}:turn:${startedAtTurn}`;
  const previousScaffold = params.facts.filter((fact) => (
    fact.factType === 'scaffold.state'
    && stringSlot(fact, 'focusEpisodeId') === focusEpisodeId
  )).at(-1);
  const stage = (stringSlot(previousScaffold, 'stage') as SparcScaffoldStage | undefined) ?? 'ELICIT';
  const observation = observationForPreviousTarget(params);

  return [
    ...(observation ? [observation] : []),
    {
      factType: 'instructionalTarget.active',
      slots: { ...target, focusEpisodeId, status: 'active' },
    },
    {
      factType: 'instructionalFocus.episode',
      slots: { focusEpisodeId, targetKey: target.targetKey, startedAtTurn, status: 'active' },
    },
    {
      factType: 'scaffold.state',
      slots: {
        focusEpisodeId,
        targetKey: target.targetKey,
        stage,
        lastAction: stringSlot(previousScaffold, 'lastAction') ?? '',
        policyId: params.config.policyId,
        policyVersion: params.config.policyVersion,
      },
    },
  ];
}
