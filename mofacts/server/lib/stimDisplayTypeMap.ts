type StimDisplayTypeEntry = {
  hasCloze: boolean;
  hasText: boolean;
  hasAudio: boolean;
  hasImage: boolean;
  hasVideo: boolean;
};

type StimDisplayTypeMap = Record<string, StimDisplayTypeEntry>;

type StimulusLike = {
  stimuliSetId?: unknown;
  clozeStimulus?: unknown;
  textStimulus?: unknown;
  audioStimulus?: unknown;
  imageStimulus?: unknown;
  videoStimulus?: unknown;
};

type TdfStimuliDoc = {
  stimuliSetId?: unknown;
  stimuli?: unknown;
};

type StimDisplayTypeMapDeps = {
  serverConsole: (...args: unknown[]) => void;
  findAllTdfStimuliDocs: () => Promise<TdfStimuliDoc[]>;
  findTdfStimuliDocsByStimuliSetIds: (stimuliSetIds: Array<string | number>) => Promise<TdfStimuliDoc[]>;
};

let stimDisplayTypeMap: StimDisplayTypeMap = {};
let stimDisplayTypeMapVersion = 0;
let stimDisplayTypeMapHasFullSnapshot = false;

function bumpStimDisplayTypeMapVersion() {
  const now = Date.now();
  stimDisplayTypeMapVersion = now > stimDisplayTypeMapVersion
    ? now
    : stimDisplayTypeMapVersion + 1;
  return stimDisplayTypeMapVersion;
}

function normalizeStimuliSetIds(stimuliSetIds: unknown[]) {
  if (!Array.isArray(stimuliSetIds)) {
    return [];
  }

  const normalized = [];
  for (const rawId of stimuliSetIds) {
    if (rawId === null || typeof rawId === 'undefined') {
      continue;
    }
    if (typeof rawId === 'number' && Number.isFinite(rawId)) {
      normalized.push(rawId);
      continue;
    }
    if (typeof rawId === 'string') {
      const trimmed = rawId.trim();
      if (!trimmed) {
        continue;
      }
      const numeric = Number(trimmed);
      normalized.push(Number.isFinite(numeric) ? numeric : trimmed);
    }
  }

  return [...new Set(normalized)];
}

function createEmptyStimDisplayTypeEntry(): StimDisplayTypeEntry {
  return {
    hasCloze: false,
    hasText: false,
    hasAudio: false,
    hasImage: false,
    hasVideo: false,
  };
}

function updateStimDisplayTypeEntry(entry: StimDisplayTypeEntry, item: StimulusLike) {
  if (!item) {
    return;
  }
  if (!entry.hasCloze && item.clozeStimulus) {
    entry.hasCloze = true;
  }
  if (!entry.hasText && item.textStimulus) {
    entry.hasText = true;
  }
  if (!entry.hasAudio && item.audioStimulus) {
    entry.hasAudio = true;
  }
  if (!entry.hasImage && item.imageStimulus) {
    entry.hasImage = true;
  }
  if (!entry.hasVideo && item.videoStimulus) {
    entry.hasVideo = true;
  }
}

function shouldSkipStimDisplayTypeEntryUpdate(entry: StimDisplayTypeEntry) {
  return entry.hasCloze && entry.hasText && entry.hasAudio && entry.hasImage && entry.hasVideo;
}

function buildStimDisplayTypeMapEntries(
  docs: TdfStimuliDoc[],
  targetKeySet?: Set<string>
) {
  const entries = new Map<string, StimDisplayTypeEntry>();

  for (const doc of docs) {
    const items = Array.isArray(doc?.stimuli) ? doc.stimuli as StimulusLike[] : [];
    for (const item of items) {
      if (!item) {
        continue;
      }
      const itemStimuliSetId = item.stimuliSetId ?? doc.stimuliSetId;
      if (itemStimuliSetId === null || typeof itemStimuliSetId === 'undefined') {
        continue;
      }

      const key = String(itemStimuliSetId);
      if (targetKeySet && !targetKeySet.has(key)) {
        continue;
      }

      if (!entries.has(key)) {
        entries.set(key, createEmptyStimDisplayTypeEntry());
      }

      const entry = entries.get(key);
      if (!entry || shouldSkipStimDisplayTypeEntryUpdate(entry)) {
        continue;
      }

      updateStimDisplayTypeEntry(entry, item);
    }
  }

  return entries;
}

export function clearStimDisplayTypeMap() {
  stimDisplayTypeMap = {};
  stimDisplayTypeMapHasFullSnapshot = true;
  stimDisplayTypeMapVersion = bumpStimDisplayTypeMapVersion();
  return stimDisplayTypeMapVersion;
}

export async function rebuildStimDisplayTypeMapSnapshot(deps: StimDisplayTypeMapDeps) {
  deps.serverConsole('getStimDisplayTypeMap', 'full:explicit');

  const docs = await deps.findAllTdfStimuliDocs();
  const entries = buildStimDisplayTypeMapEntries(docs);

  stimDisplayTypeMap = Object.fromEntries(entries);
  stimDisplayTypeMapHasFullSnapshot = true;
  stimDisplayTypeMapVersion = bumpStimDisplayTypeMapVersion();
  return stimDisplayTypeMapVersion;
}

export async function updateStimDisplayTypeMap(
  deps: StimDisplayTypeMapDeps,
  stimuliSetIds: unknown[] | null
) {
  const targetStimuliSetIds = normalizeStimuliSetIds(stimuliSetIds || []);
  if (targetStimuliSetIds.length === 0) {
    return stimDisplayTypeMapVersion;
  }

  deps.serverConsole('getStimDisplayTypeMap', `targeted:${targetStimuliSetIds.length}`);

  const keySet = new Set(targetStimuliSetIds.map((id) => String(id)));
  const docs = await deps.findTdfStimuliDocsByStimuliSetIds(targetStimuliSetIds);
  const entries = buildStimDisplayTypeMapEntries(docs, keySet);

  for (const stimuliSetId of targetStimuliSetIds) {
    const key = String(stimuliSetId);
    const entry = entries.get(key);
    if (entry) {
      stimDisplayTypeMap[key] = entry;
    } else {
      delete stimDisplayTypeMap[key];
    }
  }

  stimDisplayTypeMapVersion = bumpStimDisplayTypeMapVersion();
  return stimDisplayTypeMapVersion;
}

async function ensureStimDisplayTypeMapReady(deps: StimDisplayTypeMapDeps) {
  if (stimDisplayTypeMapHasFullSnapshot) {
    return stimDisplayTypeMapVersion;
  }
  return await rebuildStimDisplayTypeMapSnapshot(deps);
}

export async function getStimDisplayTypeMap(deps: StimDisplayTypeMapDeps) {
  await ensureStimDisplayTypeMapReady(deps);
  return stimDisplayTypeMap;
}

export async function getStimDisplayTypeMapVersion(deps: StimDisplayTypeMapDeps) {
  await ensureStimDisplayTypeMapReady(deps);
  return stimDisplayTypeMapVersion;
}
