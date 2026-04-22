import { CALCULATE_PROBABILITY_FORMULA, cloneImportParameterDefaults } from './importParameterDefaults';
import type { ImportDraftLesson, NormalizedImportItem, SourceKind } from './normalizedImportTypes';

type BuildImportLessonDraftOptions = {
  id: string;
  sourceKind: SourceKind;
  lessonName: string;
  instructions: string;
  items: NormalizedImportItem[];
  mediaFiles?: Record<string, string | Uint8Array>;
  sourceConfig?: Record<string, unknown>;
  skippedItems?: number;
  manifestMeta?: Record<string, unknown>;
  uiSettings?: Record<string, unknown>;
};

export function sanitizeImportName(rawName: unknown, fallback = 'Imported_Lesson') {
  const sanitizedInput = Array.from(String(rawName || ''), (ch: string) => (ch.charCodeAt(0) < 32 ? '_' : ch)).join('');
  const value = sanitizedInput
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return value || fallback;
}

export function getImportFileNames(lessonName: unknown) {
  const safeName = sanitizeImportName(lessonName);
  return {
    safeName,
    stimFileName: `${safeName}_stims.json`,
    tdfFileName: `${safeName}_TDF.json`
  };
}

export function buildStimuliFromNormalizedItems(items: NormalizedImportItem[]) {
  return {
    setspec: {
      clusters: items.map((item) => {
        const display: Record<string, unknown> = {};
        if (item.prompt.text) {
          display.text = item.prompt.text;
        }
        if (item.prompt.imgSrc) {
          display.imgSrc = item.prompt.imgSrc;
        }
        if (item.prompt.audioSrc) {
          display.audioSrc = item.prompt.audioSrc;
        }
        if (item.prompt.videoSrc) {
          display.videoSrc = item.prompt.videoSrc;
        }

        const response: Record<string, unknown> = {
          correctResponse: item.response.correctResponse
        };
        if (Array.isArray(item.response.incorrectResponses) && item.response.incorrectResponses.length > 0) {
          response.incorrectResponses = item.response.incorrectResponses;
        }

        return {
          stims: [
            {
              display,
              response
            }
          ]
        };
      })
    }
  };
}

export function buildTutorFromNormalizedItems(
  lessonName: unknown,
  instructions: unknown,
  items: NormalizedImportItem[],
  options: {
    uiSettings?: Record<string, unknown>;
  } = {}
) {
  const { safeName, stimFileName } = getImportFileNames(lessonName);
  const parameters = cloneImportParameterDefaults();
  const { lfparameter, ...deliveryparams } = parameters;
  const cardCount = items.length;
  const clusterRange = cardCount > 0 ? `0-${cardCount - 1}` : '0-0';

  return {
    tutor: {
      setspec: {
        lessonname: safeName,
        stimulusfile: stimFileName,
        shuffleclusters: clusterRange,
        userselect: 'true',
        lfparameter,
        ...(options.uiSettings ? { uiSettings: options.uiSettings } : {})
      },
      unit: [
        {
          unitname: 'Instructions',
          unitinstructions: String(instructions || '')
        },
        {
          unitname: 'Practice',
          learningsession: {
            clusterlist: clusterRange,
            unitMode: 'distance',
            calculateProbability: CALCULATE_PROBABILITY_FORMULA
          },
          deliveryparams
        }
      ]
    }
  };
}

export function buildImportLessonDraft(options: BuildImportLessonDraftOptions): ImportDraftLesson {
  const stimuli = buildStimuliFromNormalizedItems(options.items);
  const tutorDoc = buildTutorFromNormalizedItems(
    options.lessonName,
    options.instructions,
    options.items,
    options.uiSettings ? { uiSettings: options.uiSettings } : {}
  );

  return {
    id: options.id,
    sourceKind: options.sourceKind,
    title: sanitizeImportName(options.lessonName),
    sourceConfig: options.sourceConfig || {},
    generatedBaseline: {
      tutor: tutorDoc.tutor,
      stimuli,
      mediaFiles: options.mediaFiles || {},
      ...(options.manifestMeta ? { manifestMeta: options.manifestMeta } : {})
    },
    workingCopy: {
      tutor: JSON.parse(JSON.stringify(tutorDoc.tutor)),
      stimuli: JSON.parse(JSON.stringify(stimuli))
    },
    stats: {
      totalItems: options.items.length,
      skippedItems: options.skippedItems || 0,
      mediaCount: Object.keys(options.mediaFiles || {}).length
    }
  };
}
