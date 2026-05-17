// Shared H5P stimulus display contract.

export type H5PSourceType = 'external-embed' | 'self-hosted';

export type H5PCompletionPolicy =
  | 'viewed'
  | 'xapi-completed'
  | 'xapi-passed'
  | 'manual-continue';

export type H5PScorePolicy =
  | 'correct-if-passed'
  | 'correct-if-full-score'
  | 'record-only';

export interface H5PDisplayConfig {
  sourceType: H5PSourceType;
  library?: string;
  contentId?: string;
  embedUrl?: string;
  packageAssetId?: string;
  completionPolicy: H5PCompletionPolicy;
  scorePolicy?: H5PScorePolicy;
  preferredHeight?: number;
}
