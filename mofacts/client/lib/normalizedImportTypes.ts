export type SourceKind = 'apkg' | 'imscc' | 'manual';

export type NormalizedImportItem = {
  prompt: {
    text?: string;
    imgSrc?: string;
    audioSrc?: string;
    videoSrc?: string;
  };
  response: {
    correctResponse: string;
    incorrectResponses?: string[];
  };
  sourceType?: 'freeResponse' | 'choice';
};

export type ImportDraftLesson = {
  id: string;
  sourceKind: SourceKind;
  title: string;
  sourceConfig: Record<string, unknown>;
  generatedBaseline: {
    tutor: Record<string, unknown>;
    stimuli: { setspec: { clusters: Array<Record<string, unknown>> } };
    mediaFiles: Record<string, string | Uint8Array>;
    manifestMeta?: Record<string, unknown>;
  };
  workingCopy: {
    tutor: Record<string, unknown>;
    stimuli: { setspec: { clusters: Array<Record<string, unknown>> } };
  };
  stats?: {
    totalItems: number;
    skippedItems?: number;
    mediaCount?: number;
  };
};

export type BuiltImportPackage = {
  mode: 'single' | 'multiple';
  zipBlob: Blob;
  manifest: Array<Record<string, unknown>>;
  totalCards: number;
  totalSkipped: number;
  totalMedia: number;
  lessons: ImportDraftLesson[];
};
