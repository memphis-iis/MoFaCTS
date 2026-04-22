const fs = require('fs');

type Logger = (...args: any[]) => void;
type BootstrapTdfPayload = {
  fileName: string;
  ownerId: string;
  source: string;
  tdfs: {
    tutor: {
      setspec: {
        lessonname: string;
        tips?: string[];
        condition?: string[];
        conditionTdfIds?: Array<string | null>;
        shuffleclusters?: unknown;
        [key: string]: unknown;
      };
      unit?: unknown[];
      [key: string]: unknown;
    };
  };
  [key: string]: unknown;
};

type BootstrapPrivateRepoContentDeps = {
  isProd: boolean;
  adminUserId: string;
  curSemester: string;
  serverConsole: Logger;
  AssetsAny: { getTextAsync: (path: string) => Promise<string> };
  upsertStimFile: (filename: string, json: unknown, adminUserId: string) => Promise<string | number | null | undefined>;
  upsertTDFFile: (
    filename: string,
    rec: BootstrapTdfPayload,
    adminUserId: string
  ) => Promise<{ stimuliSetId?: number | string | null } | unknown>;
  updateStimDisplayTypeMap: (stimuliSetIds: unknown[] | null) => Promise<unknown>;
};

async function readRepoJsonFilenames(dirPath: string, serverConsole: Logger) {
  try {
    const filenames = await fs.promises.readdir(dirPath);
    return filenames.filter((filename: string) => filename.includes('.json'));
  } catch (err: unknown) {
    serverConsole(`No bootstrap content found at ${dirPath}, skipping`, err);
    return [];
  }
}

export async function bootstrapPrivateRepoContentIfNeeded(deps: BootstrapPrivateRepoContentDeps) {
  if (deps.isProd) {
    return;
  }
  if (!deps.adminUserId) {
    deps.serverConsole('Skipping repo bootstrap because no admin owner is available');
    return;
  }

  deps.serverConsole('loading stims and tdfs from asset dir');

  const stimFilenames = await readRepoJsonFilenames('./assets/app/stims/', deps.serverConsole);
  const stimSetIdsLoaded = new Set<string | number>();
  for (const filename of stimFilenames) {
    const data = await deps.AssetsAny.getTextAsync('stims/' + filename);
    const json = JSON.parse(data);
    const stimuliSetId = await deps.upsertStimFile(filename, json, deps.adminUserId);
    if (stimuliSetId !== undefined && stimuliSetId !== null) {
      stimSetIdsLoaded.add(stimuliSetId);
    }
  }
  if (stimSetIdsLoaded.size > 0) {
    await deps.updateStimDisplayTypeMap(Array.from(stimSetIdsLoaded));
  }

  const tdfFilenames = await readRepoJsonFilenames('./assets/app/tdf/', deps.serverConsole);
  const tdfStimSetIds = new Set<string | number>();
  for (let filename of tdfFilenames) {
    const data = await deps.AssetsAny.getTextAsync('tdf/' + filename);
    const json = JSON.parse(data) as {
      tutor: {
        setspec: {
          lessonname: string;
          tips?: string[];
          condition?: string[];
          conditionTdfIds?: Array<string | null>;
          shuffleclusters?: unknown;
          [key: string]: unknown;
        };
        unit?: unknown[];
        [key: string]: unknown;
      };
    };
    filename = filename.replace('.json', deps.curSemester + '.json');
    const rec: BootstrapTdfPayload = { fileName: filename, tdfs: json, ownerId: deps.adminUserId, source: 'repo' };
    const tdfResult = await deps.upsertTDFFile(filename, rec, deps.adminUserId) as { stimuliSetId?: number | string | null };
    if (tdfResult?.stimuliSetId !== undefined && tdfResult?.stimuliSetId !== null) {
      tdfStimSetIds.add(tdfResult.stimuliSetId);
    }
  }
  if (tdfStimSetIds.size > 0) {
    await deps.updateStimDisplayTypeMap(Array.from(tdfStimSetIds));
  }
}
