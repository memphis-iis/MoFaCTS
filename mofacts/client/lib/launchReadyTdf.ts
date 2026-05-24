import { Meteor } from 'meteor/meteor';
import { Tracker } from 'meteor/tracker';
import { meteorCallAsync } from './meteorAsync';
import { clientConsole } from './clientLogger';
import {
  hasLaunchReadyTutorUnits,
  isConditionRootWithoutUnitArray,
  normalizeTutorUnits,
} from './tdfUtils';

declare const Tdfs: any;

type LoadLaunchReadyTdfOptions = {
  allowConditionRoot?: boolean;
  source?: string;
};

type LaunchReadyTdfResult = {
  tdfDoc: any;
  content: any;
  isConditionRoot: boolean;
};

function waitForSubscriptionReady(handle: { ready: () => boolean }): Promise<void> {
  return new Promise<void>((resolve) => {
    let resolved = false;
    Tracker.autorun((computation) => {
      if (handle.ready()) {
        if (resolved) {
          computation.stop();
          return;
        }
        resolved = true;
        computation.stop();
        resolve();
      }
    });
  });
}

function isLaunchReadyContent(content: any, allowConditionRoot: boolean): boolean {
  if (hasLaunchReadyTutorUnits(content)) {
    return true;
  }
  return allowConditionRoot && isConditionRootWithoutUnitArray(content);
}

function hasAutoTutorUnit(content: any): boolean {
  const units = content?.tdfs?.tutor?.unit;
  return Array.isArray(units) && units.some((unit: any) =>
    unit && typeof unit === 'object' && unit.autotutorsession && typeof unit.autotutorsession === 'object'
  );
}

function hasAutoTutorLaunchConfig(content: any): boolean {
  if (!hasAutoTutorUnit(content)) {
    return true;
  }
  const setspec = content?.tdfs?.tutor?.setspec;
  return typeof setspec?.openRouterApiKey === 'string' && setspec.openRouterApiKey.trim().length > 0;
}

function describeLaunchReadyFailure(tdfId: unknown, content: any): string {
  const units = content?.tdfs?.tutor?.unit;
  const unitSummary = Array.isArray(units)
    ? units.map((unit: any) => unit && typeof unit === 'object' ? Object.keys(unit) : typeof unit)
    : typeof units;
  return `TDF ${String(tdfId)} is not launch-ready; tutor.unit is missing, empty, or only partially projected. Unit summary: ${JSON.stringify(unitSummary)}`;
}

export async function loadLaunchReadyTdf(
  tdfId: unknown,
  options: LoadLaunchReadyTdfOptions = {}
): Promise<LaunchReadyTdfResult> {
  const currentTdfId = String(tdfId || '').trim();
  const source = options.source || 'loadLaunchReadyTdf';
  const allowConditionRoot = options.allowConditionRoot === true;

  if (!currentTdfId) {
    throw new Error(`[${source}] Cannot load launch-ready TDF without a TDF id`);
  }

  const subscription = Meteor.subscribe('currentTdf', currentTdfId);
  await waitForSubscriptionReady(subscription);

  let tdfDoc = Tdfs.findOne({ _id: currentTdfId });
  if (!tdfDoc?.content) {
    clientConsole(1, `[${source}] currentTdf subscription did not provide content; fetching full TDF by id`, {
      currentTdfId,
    });
    tdfDoc = await meteorCallAsync('getTdfById', currentTdfId);
  }

  let content = tdfDoc?.content;
  normalizeTutorUnits(content);

  if (!isLaunchReadyContent(content, allowConditionRoot) || !hasAutoTutorLaunchConfig(content)) {
    clientConsole(1, `[${source}] TDF content is not launch-ready after subscription; fetching full TDF by id`, {
      currentTdfId,
    });
    tdfDoc = await meteorCallAsync('getTdfById', currentTdfId);
    content = tdfDoc?.content;
    normalizeTutorUnits(content);
  }

  const isConditionRoot = isConditionRootWithoutUnitArray(content);
  if (!isLaunchReadyContent(content, allowConditionRoot)) {
    throw new Error(`[${source}] ${describeLaunchReadyFailure(currentTdfId, content)}`);
  }

  if (!hasAutoTutorLaunchConfig(content)) {
    throw new Error(`[${source}] AutoTutor TDF ${currentTdfId} is missing tutor.setspec.openRouterApiKey after full TDF load`);
  }

  if (isConditionRoot && !allowConditionRoot) {
    throw new Error(`[${source}] Condition root TDF ${currentTdfId} cannot be used as runnable card content`);
  }

  return {
    tdfDoc,
    content,
    isConditionRoot,
  };
}
