import { Meteor } from 'meteor/meteor';
import { restoreAdaptiveUnitSequence } from '../../common/adaptiveUnitSequence';
import { pickTimingRuntimeSettings } from '../../common/deliveryTimingSettings';

type StudyProgressDeps = {
  Tdfs: { findOneAsync: (selector: { _id: string }) => Promise<any> };
  states: { findOneAsync: (selector: { userId: string; TDFId: string }) => Promise<any> };
};

export async function readStudyProgress(deps: StudyProgressDeps, userId: string, root: any) {
  const doc = await deps.states.findOneAsync({ userId, TDFId: root._id });
  if (!doc) return { deliverySettings: undefined, state: {} as Record<string, unknown>, units: [], tdfId: root._id };
  const state = doc.experimentState || {};
  const conditionId = state.conditionTdfId || root._id;
  if (conditionId !== root._id && !root.content?.tdfs?.tutor?.setspec?.conditionTdfIds?.includes(conditionId)) {
    throw new Error('Saved condition does not belong to this study');
  }
  const tdf = conditionId === root._id ? root : await deps.Tdfs.findOneAsync({ _id: conditionId });
  if (!tdf) throw new Error('Study lesson configuration is unavailable');
  const content = structuredClone(tdf.content);
  restoreAdaptiveUnitSequence(content, state, conditionId);
  const units = content?.tdfs?.tutor?.unit;
  if (!Array.isArray(units)) throw new Error('Study lesson configuration is unavailable');
  return { state, units, tdfId: conditionId, deliverySettings: content.tdfs.tutor.deliverySettings };
}

export function configuredStudyWait(current: Awaited<ReturnType<typeof readStudyProgress>>, tdfId: string, unit: number) {
  if (current.tdfId !== tdfId || Number(current.state.currentUnitNumber ?? 0) !== unit) {
    throw new Meteor.Error(403, 'Waiting period does not match the current study lesson and unit');
  }
  const currentUnit = current.units[unit];
  if (!Number.isInteger(unit) || !currentUnit) throw new Meteor.Error(409, 'Current study unit is unavailable');
  const condition = current.state.experimentXCond;
  const timing = { ...pickTimingRuntimeSettings(current.deliverySettings, condition), ...pickTimingRuntimeSettings(currentUnit.deliverySettings, condition) };
  const minutes = Number(timing.lockoutminutes ?? 0);
  if (!Number.isFinite(minutes) || minutes < 0) throw new Meteor.Error(409, 'Invalid study waiting period');
  return minutes;
}
