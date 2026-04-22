import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { clientConsole } from './userSessionHelpers';
import { meteorCallAsync } from './meteorAsync';

const STIM_DISPLAY_TYPE_MAP_VERSION_KEY = 'stimDisplayTypeMapVersion';
const STIM_DISPLAY_TYPE_MAP_SYNC_INTERVAL_KEY = 'stimDisplayTypeMapSyncInterval';
const STIM_DISPLAY_TYPE_MAP_POLL_INTERVAL_MS = 15000;

type StimDisplayTypeMap = Record<string, unknown>;
type StimDisplayTypeMapRefreshResult = { map: StimDisplayTypeMap; version: number };
type IntervalHandle = ReturnType<typeof Meteor.setInterval>;

let activeRefreshPromise: Promise<StimDisplayTypeMapRefreshResult> | null = null;

function normalizeVersion(rawVersion: unknown): number {
  const parsed = Number(rawVersion);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function refreshStimDisplayTypeMap(reason = 'manual-refresh'): Promise<StimDisplayTypeMapRefreshResult> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    const [mapRaw, versionRaw] = await Promise.all([
      meteorCallAsync<unknown>('getStimDisplayTypeMap'),
      meteorCallAsync<unknown>('getStimDisplayTypeMapVersion'),
    ]);

    if (!mapRaw || typeof mapRaw !== 'object') {
      throw new Error('Invalid stimDisplayTypeMap payload from server');
    }

    const map = mapRaw as StimDisplayTypeMap;
    const version = normalizeVersion(versionRaw);
    Session.set('stimDisplayTypeMap', map);
    Session.set(STIM_DISPLAY_TYPE_MAP_VERSION_KEY, version);
    clientConsole(2, '[StimMap] Refreshed map', reason, 'version', version);
    return { map, version };
  })();

  try {
    return await activeRefreshPromise;
  } finally {
    activeRefreshPromise = null;
  }
}

export async function ensureStimDisplayTypeMapReady(reason = 'ensure-ready'): Promise<void> {
  if (!Session.get('stimDisplayTypeMap')) {
    await refreshStimDisplayTypeMap(reason);
    return;
  }

  if (!normalizeVersion(Session.get(STIM_DISPLAY_TYPE_MAP_VERSION_KEY))) {
    const versionRaw = await meteorCallAsync<unknown>('getStimDisplayTypeMapVersion');
    const version = normalizeVersion(versionRaw);
    Session.set(STIM_DISPLAY_TYPE_MAP_VERSION_KEY, version);
  }
}

export function startStimDisplayTypeMapVersionSync(reason = 'sync-start'): IntervalHandle {
  const existingInterval = Session.get(STIM_DISPLAY_TYPE_MAP_SYNC_INTERVAL_KEY);
  if (existingInterval) {
    return existingInterval as IntervalHandle;
  }

  const intervalId = Meteor.setInterval(async () => {
    try {
      const serverVersion = normalizeVersion(await meteorCallAsync<unknown>('getStimDisplayTypeMapVersion'));
      const localVersion = normalizeVersion(Session.get(STIM_DISPLAY_TYPE_MAP_VERSION_KEY));
      if (serverVersion && serverVersion !== localVersion) {
        await refreshStimDisplayTypeMap('version-changed');
      }
    } catch (err) {
      clientConsole(1, '[StimMap] Version sync failed:', err);
    }
  }, STIM_DISPLAY_TYPE_MAP_POLL_INTERVAL_MS);

  Session.set(STIM_DISPLAY_TYPE_MAP_SYNC_INTERVAL_KEY, intervalId);
  clientConsole(2, '[StimMap] Version sync interval started', reason);
  return intervalId;
}

export function stopStimDisplayTypeMapVersionSync(reason = 'sync-stop'): void {
  const intervalId = Session.get(STIM_DISPLAY_TYPE_MAP_SYNC_INTERVAL_KEY);
  if (!intervalId) {
    return;
  }

  Meteor.clearInterval(intervalId);
  Session.set(STIM_DISPLAY_TYPE_MAP_SYNC_INTERVAL_KEY, null);
  clientConsole(2, '[StimMap] Version sync interval stopped', reason);
}

