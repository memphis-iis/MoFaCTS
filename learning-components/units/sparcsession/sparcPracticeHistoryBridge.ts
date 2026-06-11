import {
  type CanonicalHistoryRecord,
  withCanonicalHistorySchemaVersion,
} from '../../runtime/historyEnvelope';
import {
  createCanonicalModelPracticeHistoryRecord,
  type ModelPracticeHistoryCore,
} from '../../runtime/modelPracticeUpdates';
import type {
  ResponseIdentity,
} from '../../runtime/historyStimulusIdentity';
import type {
  SparcCanonicalHistoryExtension,
  SparcCanonicalHistoryRecord,
  SparcDocumentAddress,
  SparcModelTargetIdentity,
  SparcPracticeHistoryBridge,
  SparcPracticeObservation,
} from './sparcSessionContracts';

export type SparcPracticeHistoryCore = ModelPracticeHistoryCore;

function requireNonBlank(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function normalizeAddress(value: unknown, label: string): SparcDocumentAddress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const source = value as Record<string, unknown>;
  const address: SparcDocumentAddress = {
    documentId: requireNonBlank(source.documentId, `${label}.documentId`),
    nodeId: requireNonBlank(source.nodeId, `${label}.nodeId`),
  };
  if (source.path !== undefined) {
    if (!Array.isArray(source.path)) {
      throw new Error(`${label}.path must be an array when present`);
    }
    return {
      ...address,
      path: source.path.map((segment) => {
        if (typeof segment !== 'string' && typeof segment !== 'number') {
          throw new Error(`${label}.path segments must be strings or numbers`);
        }
        return segment;
      }),
    };
  }
  return address;
}

function normalizeModelTarget(value: unknown): SparcModelTargetIdentity | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const source = value as Record<string, unknown>;
  let sparcPath: readonly (string | number)[] | undefined;
  if (source.sparcPath !== undefined) {
    if (!Array.isArray(source.sparcPath)) {
      throw new Error('sparc.practiceObservation.modelTarget.sparcPath must be an array when present');
    }
    sparcPath = source.sparcPath.map((segment) => {
      if (typeof segment !== 'string' && typeof segment !== 'number') {
        throw new Error('sparc.practiceObservation.modelTarget.sparcPath segments must be strings or numbers');
      }
      return segment;
    });
  }
  const identity: SparcModelTargetIdentity = {
    stimuliSetId: source.stimuliSetId as string | number,
    stimulusKC: source.stimulusKC as string | number,
    clusterKC: source.clusterKC as string | number,
    KCId: source.KCId as string | number,
    KCDefault: source.KCDefault as string | number,
    KCCluster: source.KCCluster as string | number,
    sparcDocumentId: requireNonBlank(source.sparcDocumentId, 'sparc.practiceObservation.modelTarget.sparcDocumentId'),
    sparcNodeId: requireNonBlank(source.sparcNodeId, 'sparc.practiceObservation.modelTarget.sparcNodeId'),
    ...(sparcPath ? { sparcPath } : {}),
  };
  if (source.response && typeof source.response === 'object' && !Array.isArray(source.response)) {
    const responseSource = source.response as Record<string, unknown>;
    identity.response = {
      responseKC: responseSource.responseKC as string | number,
      responseKey: String(responseSource.responseKey ?? ''),
    } satisfies ResponseIdentity;
  }
  if (typeof source.stimulusRecordId === 'string') {
    identity.stimulusRecordId = source.stimulusRecordId;
  }
  return identity;
}

function normalizeObservation(value: unknown): SparcPracticeObservation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const source = value as Record<string, unknown>;
  const sourceAddress = normalizeAddress(source.sourceAddress, 'sparc.practiceObservation.sourceAddress');
  const observationBase = {
    observationId: requireNonBlank(source.observationId, 'sparc.practiceObservation.observationId'),
    sourceAddress,
    time: Number(source.time),
    problemStartTime: Number(source.problemStartTime),
    outcome: source.outcome as SparcPracticeObservation['outcome'],
    responseValue: source.responseValue,
  };
  const modelTarget = normalizeModelTarget(source.modelTarget);
  if (modelTarget && modelTarget.sparcDocumentId !== sourceAddress.documentId) {
    throw new Error(
      `sparc.practiceObservation.modelTarget.sparcDocumentId "${modelTarget.sparcDocumentId}" `
        + `does not match sourceAddress document "${sourceAddress.documentId}"`,
    );
  }
  const observation: SparcPracticeObservation = {
    ...observationBase,
    ...(modelTarget ? { modelTarget } : {}),
    ...(source.input !== undefined ? { input: source.input } : {}),
    ...(source.displayedStimulus !== undefined ? { displayedStimulus: source.displayedStimulus } : {}),
  };
  if (source.practiceDurationMs !== undefined) {
    return {
      ...observation,
      practiceDurationMs: Number(source.practiceDurationMs),
    };
  }
  return observation;
}

export function createSparcPracticeHistoryBridge(
  core: SparcPracticeHistoryCore,
): SparcPracticeHistoryBridge {
  const TDFId = requireNonBlank(core.TDFId, 'TDFId');
  const sessionID = requireNonBlank(core.sessionID, 'sessionID');
  if (!core.userId && !core.anonStudentId) {
    throw new Error('SPARC history bridge requires userId or anonStudentId');
  }

  return {
    toCanonicalHistoryRecord(observation) {
      const sourceAddress = normalizeAddress(observation.sourceAddress, 'observation.sourceAddress');
      if (
        observation.modelTarget
        && observation.modelTarget.sparcDocumentId !== sourceAddress.documentId
      ) {
        throw new Error(
          `observation.modelTarget.sparcDocumentId "${observation.modelTarget.sparcDocumentId}" `
            + `does not match sourceAddress document "${sourceAddress.documentId}"`,
        );
      }
      const extension: SparcCanonicalHistoryExtension = {
        documentId: sourceAddress.documentId,
        sourceAddress,
        practiceObservation: observation,
      };
      if (observation.modelTarget) {
        const record = createCanonicalModelPracticeHistoryRecord(core, {
          observationId: observation.observationId,
          target: observation.modelTarget,
          outcome: observation.outcome,
          ...(observation.practiceDurationMs !== undefined ? { practiceDurationMs: observation.practiceDurationMs } : {}),
          responseValue: observation.responseValue,
          ...(observation.input !== undefined ? { input: observation.input } : {}),
          displayedStimulus: observation.displayedStimulus ?? sourceAddress,
          time: observation.time,
          problemStartTime: observation.problemStartTime,
          selection: `${sourceAddress.documentId}:${sourceAddress.nodeId}`,
          action: 'sparc-response',
          typeOfResponse: 'sparc',
          eventType: 'sparc',
        }, {
          sparc: extension,
        });
        return record as SparcCanonicalHistoryRecord;
      }
      const record: Record<string, unknown> = {
        TDFId,
        sessionID,
        userId: core.userId,
        anonStudentId: core.anonStudentId,
        levelUnit: core.levelUnit,
        levelUnitName: core.levelUnitName ?? '',
        levelUnitType: observation.modelTarget ? 'model' : 'sparc',
        time: observation.time,
        problemStartTime: observation.problemStartTime,
        selection: `${sourceAddress.documentId}:${sourceAddress.nodeId}`,
        action: 'sparc-response',
        outcome: observation.outcome,
        typeOfResponse: 'sparc',
        responseValue: observation.responseValue,
        input: observation.input ?? observation.responseValue,
        displayedStimulus: observation.displayedStimulus ?? sourceAddress,
        eventType: 'sparc',
        sparc: extension,
      };
      return withCanonicalHistorySchemaVersion(record) as SparcCanonicalHistoryRecord;
    },

    fromCanonicalHistoryRecord(record: CanonicalHistoryRecord) {
      if (record.eventType !== 'sparc') {
        return null;
      }
      const extension = record.sparc;
      if (!extension || typeof extension !== 'object' || Array.isArray(extension)) {
        throw new Error('SPARC history record missing sparc extension');
      }
      const observation = normalizeObservation(
        (extension as Record<string, unknown>).practiceObservation,
      );
      if (!observation) {
        return null;
      }
      return observation;
    },
  };
}
