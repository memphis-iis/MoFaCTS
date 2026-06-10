import {
  createLearningSessionUnitEngine,
  type CreateLearningSessionUnitEngineDeps,
} from '../learning-session/LearningSessionUnitEngine';
import { SPARC_SESSION_UNIT_TYPE } from '../unitTypes';

export { SPARC_SESSION_UNIT_TYPE };

function aliasSparcUnitToLearningSession(unit: unknown): unknown {
  if (!unit || typeof unit !== 'object' || Array.isArray(unit)) {
    return unit;
  }

  const record = unit as Record<string, unknown>;
  if (!record.sparcsession || record.learningsession) {
    return unit;
  }

  return {
    ...record,
    learningsession: record.sparcsession,
  };
}

function aliasTutorUnitsContainer(container: unknown): unknown {
  if (!container || typeof container !== 'object' || Array.isArray(container)) {
    return container;
  }

  const record = container as Record<string, unknown>;
  const tutor = record.tutor;
  if (!tutor || typeof tutor !== 'object' || Array.isArray(tutor)) {
    return container;
  }

  const tutorRecord = tutor as Record<string, unknown>;
  const unit = tutorRecord.unit;
  if (!Array.isArray(unit)) {
    return container;
  }

  return {
    ...record,
    tutor: {
      ...tutorRecord,
      unit: unit.map((entry) => aliasSparcUnitToLearningSession(entry)),
    },
  };
}

function aliasSparcTdfToLearningSession(tdf: unknown): unknown {
  if (!tdf || typeof tdf !== 'object' || Array.isArray(tdf)) {
    return tdf;
  }

  const record = tdf as Record<string, unknown>;
  return {
    ...record,
    tdfs: aliasTutorUnitsContainer(record.tdfs),
    content: record.content && typeof record.content === 'object' && !Array.isArray(record.content)
      ? {
        ...(record.content as Record<string, unknown>),
        tdfs: aliasTutorUnitsContainer((record.content as Record<string, unknown>).tdfs),
      }
      : record.content,
  };
}

export async function createSparcSessionUnitEngine(
  deps: CreateLearningSessionUnitEngineDeps,
): Promise<any> {
  const engine = await createLearningSessionUnitEngine({
    ...deps,
    getSessionValue(key) {
      const value = deps.getSessionValue(key);
      if (key === 'currentTdfUnit') {
        return aliasSparcUnitToLearningSession(value);
      }
      if (key === 'currentTdfFile') {
        return aliasSparcTdfToLearningSession(value);
      }
      return value;
    },
    findTdfById(tdfId) {
      return aliasSparcTdfToLearningSession(deps.findTdfById(tdfId));
    },
  });
  engine.unitType = SPARC_SESSION_UNIT_TYPE;
  engine.initImpl = async function() {
    deps.setSessionValue('unitType', SPARC_SESSION_UNIT_TYPE);
    await this.initializeLogisticModelState();
  };
  return engine;
}