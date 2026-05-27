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

export interface H5PTrialResult {
  contentId: string;
  batchId: string;
  library?: string;
  widgetType?: string;
  completed: boolean;
  passed?: boolean;
  score?: number;
  maxScore?: number;
  scaledScore?: number;
  responseSummary?: unknown;
  events: Array<Record<string, unknown>>;
}
