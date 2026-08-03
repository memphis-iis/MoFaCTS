export const CHANGE_STREAMS_QUALIFICATION_COLLECTION = 'meteor35_change_streams_qualification';

export const CHANGE_STREAMS_QUALIFICATION_METHODS = {
  status: 'meteor35ChangeStreamsQualification.status',
  reset: 'meteor35ChangeStreamsQualification.reset',
  seed: 'meteor35ChangeStreamsQualification.seed',
  write: 'meteor35ChangeStreamsQualification.write',
  writeThenObserve: 'meteor35ChangeStreamsQualification.writeThenObserve',
  requestHistoryLoss: 'meteor35ChangeStreamsQualification.requestHistoryLoss',
  requestPrimaryRestart: 'meteor35ChangeStreamsQualification.requestPrimaryRestart',
  seedTdfSecrets: 'meteor35ChangeStreamsQualification.seedTdfSecrets',
  updateTdfSecrets: 'meteor35ChangeStreamsQualification.updateTdfSecrets',
} as const;

export const CHANGE_STREAMS_QUALIFICATION_PUBLICATIONS = {
  supported: 'meteor35ChangeStreamsQualification.supported',
  dottedProjection: 'meteor35ChangeStreamsQualification.dottedProjection',
  snapshotRace: 'meteor35ChangeStreamsQualification.snapshotRace',
  tdfSecretProjection: 'meteor35ChangeStreamsQualification.tdfSecretProjection',
} as const;

export type ChangeStreamsQualificationDocument = {
  _id: string;
  scope: string;
  value: string;
  rank?: number;
  observerKey?: string;
  nested: {
    visible: string;
    secret: string;
  };
};
