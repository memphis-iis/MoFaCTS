import { deriveSparcControllerFacts } from './sparcControllerDerivedFacts';
import type { SparcInstructionalCandidateOptions } from './sparcInstructionalCandidates';
import {
  assertSparcInstructionalControllerConfig,
  projectSparcAutoTutorInstructionalFacts,
  SPARC_AUTOTUTOR_ADAPTER_ID,
  type SparcAutoTutorInstructionalProjection,
} from './sparcInstructionalControl';
import type {
  SparcInstructionalControllerConfig,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';

export type SparcInstructionalAdapter = {
  readonly adapterId: string;
  readonly deriveControllerFacts: (
    facts: readonly SparcWorkingMemoryFact[],
  ) => readonly SparcWorkingMemoryFact[];
  readonly projectInstructionalFacts: (params: {
    readonly snapshotId: string;
    readonly facts: readonly SparcWorkingMemoryFact[];
    readonly config: SparcInstructionalControllerConfig;
    readonly candidateOptions?: SparcInstructionalCandidateOptions;
  }) => SparcAutoTutorInstructionalProjection;
};

const autoTutorAdapter: SparcInstructionalAdapter = {
  adapterId: SPARC_AUTOTUTOR_ADAPTER_ID,
  deriveControllerFacts: deriveSparcControllerFacts,
  projectInstructionalFacts: projectSparcAutoTutorInstructionalFacts,
};

const adapters = new Map<string, SparcInstructionalAdapter>([
  [autoTutorAdapter.adapterId, autoTutorAdapter],
]);

export function requireSparcInstructionalAdapter(
  config: SparcInstructionalControllerConfig | undefined,
): SparcInstructionalAdapter {
  assertSparcInstructionalControllerConfig(config);
  const adapter = adapters.get(config.adapterId);
  if (!adapter) throw new Error(`SPARC instructional adapter "${config.adapterId}" is not registered`);
  return adapter;
}
