import { Meteor } from 'meteor/meteor';

import type { UploadedPackageFile } from './packageParser';

export type MethodContext = {
  userId?: string | null;
  unblock?: () => void;
  connection?: { id?: string; clientAddress?: string | null } | null;
};

export type DynamicAssetLike = {
  _id: string;
  path: string;
  userId?: string;
  ext?: string;
  name?: string;
  fileName?: string;
  type?: string;
  size?: number;
  meta?: Record<string, unknown>;
};

export type PackageUploadIntegrity = {
  expectedSize?: number;
  sha256?: string;
};

export type SaveContentResult = {
  result: boolean | null;
  errmsg: string;
  action: string;
  data?: unknown;
  tdfFileName?: string;
};

export type UploadedMediaRecord = {
  _id?: string;
  name?: string;
  link?: () => string;
};

export type UploadedMediaPathMapsByStimSetId = Map<string, Map<string, string>>;

export type PackageUploadRuntimeState = {
  fileName: string;
  filePath: string;
  stimSetId: string | number | undefined;
  uploadedMediaPathMapsByStimSetId: UploadedMediaPathMapsByStimSetId;
};

export type ProcessPackageUploadDeps = {
  DynamicAssets: {
    collection: {
      findOneAsync: (selector: Record<string, unknown>) => Promise<DynamicAssetLike | null>;
    };
    removeAsync?: (selector: Record<string, unknown>) => Promise<unknown>;
  };
  userIsInRoleAsync: (userId: string, roles: string[]) => Promise<boolean>;
  normalizeCanonicalId: (value: unknown) => string | null;
  serverConsole: (...args: unknown[]) => void;
  encryptData: (value: string) => string;
  legacyTrim: (value: unknown) => string;
  upsertPackage: (record: any, owner: string) => Promise<any>;
  updateStimDisplayTypeMap: (stimuliSetIds: Array<string | number>) => Promise<unknown>;
  getStimuliSetIdByFilename: (stimFileName: string) => Promise<string | number | undefined>;
  saveMediaFile: (
    media: UploadedPackageFile,
    owner: string,
    stimSetId: string | number | null | undefined
  ) => Promise<UploadedMediaRecord | null>;
  toCanonicalDynamicAssetPath: (savedMedia: UploadedMediaRecord | null) => string;
  normalizeUploadedMediaLookupKey: (value: unknown) => string;
  getCurrentUser: () => Promise<{ emails?: Array<{ address?: string }> } | null | undefined>;
  sendEmail: (to: string, from: string, subject: string, text: string) => void;
  ownerEmail: string;
  UserUploadQuota: {
    upsertAsync: (selector: Record<string, unknown>, modifier: Record<string, unknown>) => Promise<unknown>;
  };
  AuditLog: {
    insertAsync: (document: Record<string, unknown>) => Promise<unknown>;
  };
  Tdfs: {
    findOneAsync: (selector: Record<string, unknown>) => Promise<any>;
    upsertAsync: (selector: Record<string, unknown>, document: Record<string, unknown>) => Promise<unknown>;
  };
  resolveConditionTdfIds: (setspec?: { condition?: string[] }) => Promise<Array<string | null>>;
  getResponseKCMapForTdf: (tdfId: string) => Promise<Record<string, unknown>>;
  processAudioFilesForTDF: (tdfDoc: any, stimuliSetId: any, options: any) => Promise<any>;
  canonicalizeStimDisplayMediaRefs: (stimuliDoc: any, stimuliSetId: any, options: any) => Promise<any>;
  getNewItemFormat: (oldStimFormat: any, fileName: string, stimuliSetId: any, responseKCMap: Record<string, unknown>) => any;
  canonicalizeFlatStimuliMediaRefs: (canonicalStimuli: any, stimuliSetId: any, options: any) => Promise<any>;
};

export async function maybeSendPackageUploadEmail(
  emailToggle: boolean,
  deps: ProcessPackageUploadDeps,
  subject: string,
  text: string
) {
  if (!emailToggle) {
    return;
  }

  const currentUser = await deps.getCurrentUser();
  deps.sendEmail(
    currentUser?.emails?.[0]?.address || '',
    deps.ownerEmail,
    subject,
    text
  );
}

export async function failPackageUpload(
  emailToggle: boolean,
  deps: ProcessPackageUploadDeps,
  params: {
    zipPath: string;
    filePath: string;
    message: string;
    emailTextPrefix: string;
    errorTextPrefix: string;
    logPrefix: string;
  }
): Promise<never> {
  await maybeSendPackageUploadEmail(
    emailToggle,
    deps,
    'Package Upload Failed',
    params.emailTextPrefix + params.message + ' on file: ' + params.filePath
  );
  deps.serverConsole(
    params.logPrefix,
    'processPackageUpload ERROR,',
    params.zipPath,
    ',',
    params.message + ' on file: ' + params.filePath
  );
  throw new Meteor.Error(params.errorTextPrefix + params.message + ' on file: ' + params.filePath);
}

export function getStimuliSetIdFromPackageResult(packageResult: SaveContentResult) {
  const packageData = (packageResult.data && typeof packageResult.data === 'object')
    ? packageResult.data as { stimuliSetId?: string | number }
    : null;
  return packageData?.stimuliSetId;
}

export function deriveUploadStimSetIds(
  touchedStimuliSetIds: Set<string | number>,
  stimSetId: string | number | undefined
) {
  const uploadStimSetIds = new Set<string | number>();

  for (const touchedId of touchedStimuliSetIds) {
    if (touchedId !== undefined && touchedId !== null && String(touchedId).trim() !== '') {
      uploadStimSetIds.add(touchedId);
    }
  }

  if (uploadStimSetIds.size === 0 && stimSetId !== undefined && stimSetId !== null && String(stimSetId).trim() !== '') {
    uploadStimSetIds.add(stimSetId);
  }

  return uploadStimSetIds;
}
