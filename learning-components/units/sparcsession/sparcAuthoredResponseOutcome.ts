import type { SparcPracticeHistoryCore } from './sparcPracticeHistoryBridge';
import {
  processSparcResponseOutcome,
  type SparcProcessedResponseOutcome,
  type SparcResponseOutcomeInput,
} from './sparcResponseOutcomeProcessor';
import { resolveSparcAuthoredModelTarget } from './sparcAuthoredModelTargets';
import type { SparcAuthoredDocument } from './sparcSessionContracts';

export function processSparcAuthoredResponseOutcome(
  core: SparcPracticeHistoryCore,
  document: SparcAuthoredDocument,
  input: SparcResponseOutcomeInput,
): SparcProcessedResponseOutcome {
  const modelTarget = input.modelTarget ?? resolveSparcAuthoredModelTarget(
    document,
    input.sourceAddress,
  );
  return processSparcResponseOutcome(core, {
    ...input,
    ...(modelTarget ? { modelTarget } : {}),
  });
}
