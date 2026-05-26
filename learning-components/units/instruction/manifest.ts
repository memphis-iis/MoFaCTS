import type { LearningComponentManifest } from '../../runtime/ComponentManifest';
import type { CreateUnitEngineDeps } from '../createUnitEngine';
import { createInstructionUnitEngine } from './InstructionUnitEngine';

export const INSTRUCTION_UNIT_TYPE = 'instruction-only';

export const instructionUnitComponentManifest: LearningComponentManifest<CreateUnitEngineDeps> = {
  id: 'mofacts.instruction-unit',
  kind: 'unit',
  unitTypes: [INSTRUCTION_UNIT_TYPE],
  requiredCapabilities: ['logging'],
  register(context) {
    context.registerUnitEngine(INSTRUCTION_UNIT_TYPE, createInstructionUnitEngine);
  },
};
