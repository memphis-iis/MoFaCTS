import { buildImportLessonDraft } from './importCompositionBuilder';
import { CALCULATE_PROBABILITY_FORMULA, cloneImportParameterDefaults } from './importParameterDefaults';
import type { ImportDraftLesson, NormalizedImportItem } from './normalizedImportTypes';

export type LessonStructure =
  | 'learning-only'
  | 'instructions-learning'
  | 'assessment-only'
  | 'instructions-assessment';

export type VisibilityMode = 'private' | 'public';
export type PromptType = 'text' | 'image' | 'audio' | 'video' | 'text-image';
export type ResponseType = 'typed' | 'multiple-choice';
export type ButtonOrder = 'fixed' | 'random';
export type TtsMode = 'none' | 'prompts' | 'feedback' | 'both';
export type TopBarMode = 'time-score' | 'time' | 'score' | 'none';
export type SeedMode = 'blank-rows' | 'paste-table' | 'example-duplicate';

export type StarterRow = {
  id: string;
  promptText: string;
  mediaRef: string;
  answer: string;
  choice2: string;
  choice3: string;
  choice4: string;
};

export type ManualCreatorState = {
  lessonName: string;
  structure: LessonStructure;
  instructionText: string;
  visibility: VisibilityMode;
  experimentLinkEnabled: boolean;
  experimentTarget: string;
  promptType: PromptType;
  responseType: ResponseType;
  cardCount: number;
  shuffle: boolean;
  buttonOrder: ButtonOrder;
  speechRecognitionEnabled: boolean;
  speechLanguage: string;
  ignoreOutOfGrammar: boolean;
  textToSpeechMode: TtsMode;
  topBarMode: TopBarMode;
  practiceTimingEnabled: boolean;
  minPracticeTime: string;
  maxPracticeTime: string;
  tags: string;
  seedMode: SeedMode;
  seedTableText: string;
  rows: StarterRow[];
};

export function createStarterRow(id: string): StarterRow {
  return {
    id,
    promptText: '',
    mediaRef: '',
    answer: '',
    choice2: '',
    choice3: '',
    choice4: ''
  };
}

export function createDefaultManualCreatorState(): ManualCreatorState {
  return {
    lessonName: '',
    structure: 'instructions-learning',
    instructionText: '',
    visibility: 'private',
    experimentLinkEnabled: false,
    experimentTarget: '',
    promptType: 'text',
    responseType: 'typed',
    cardCount: 10,
    shuffle: true,
    buttonOrder: 'random',
    speechRecognitionEnabled: false,
    speechLanguage: 'en-US',
    ignoreOutOfGrammar: true,
    textToSpeechMode: 'none',
    topBarMode: 'time-score',
    practiceTimingEnabled: false,
    minPracticeTime: '',
    maxPracticeTime: '',
    tags: '',
    seedMode: 'blank-rows',
    seedTableText: '',
    rows: []
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function buildClusterRange(itemCount: number) {
  return itemCount > 0 ? `0-${itemCount - 1}` : '0-0';
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildInstructionsHtml(rawInstructions: string, lessonName: string) {
  const trimmed = String(rawInstructions || '').trim();
  if (!trimmed) {
    const safeLessonName = escapeHtml(String(lessonName || '').trim() || 'this lesson');
    return `<p>Add instructions for ${safeLessonName} here.</p>`;
  }

  const paragraphs = trimmed
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\r?\n/g, '<br>')}</p>`);

  return paragraphs.join('');
}

function normalizeTags(rawTags: string) {
  return String(rawTags || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function mapAudioPromptMode(mode: TtsMode) {
  if (mode === 'prompts') return 'question';
  if (mode === 'feedback') return 'feedback';
  if (mode === 'both') return 'all';
  return 'silent';
}

function buildDeliverySettings(state: ManualCreatorState) {
  const showTime = state.topBarMode === 'time' || state.topBarMode === 'time-score';
  const showScore = state.topBarMode === 'score' || state.topBarMode === 'time-score';

  return {
    displayPerformance: showTime || showScore,
    choiceButtonCols: state.responseType === 'multiple-choice' ? 2 : 1
  };
}

function buildPromptFromRow(row: StarterRow, promptType: PromptType): NormalizedImportItem['prompt'] {
  const prompt: NormalizedImportItem['prompt'] = {};
  const promptText = String(row.promptText || '').trim();
  const mediaRef = String(row.mediaRef || '').trim();

  if (promptType === 'text' || promptType === 'text-image') {
    prompt.text = promptText;
  }
  if (promptType === 'image' || promptType === 'text-image') {
    prompt.imgSrc = mediaRef;
  }
  if (promptType === 'audio') {
    prompt.audioSrc = mediaRef;
  }
  if (promptType === 'video') {
    prompt.videoSrc = mediaRef;
  }

  return prompt;
}

function buildItems(state: ManualCreatorState): NormalizedImportItem[] {
  return state.rows.map((row) => {
    const incorrectResponses = state.responseType === 'multiple-choice'
      ? [row.choice2, row.choice3, row.choice4]
          .map((choice) => String(choice || '').trim())
          .filter(Boolean)
      : undefined;

    return {
      prompt: buildPromptFromRow(row, state.promptType),
      response: {
        correctResponse: String(row.answer || '').trim(),
        ...(incorrectResponses && incorrectResponses.length > 0 ? { incorrectResponses } : {})
      },
      sourceType: state.responseType === 'multiple-choice' ? 'choice' : 'freeResponse'
    };
  });
}

function buildLearningUnit(state: ManualCreatorState, clusterRange: string) {
  const parameters = cloneImportParameterDefaults();
  const { lfparameter: _lfparameter, ...deliverySettings } = parameters;
  if (state.practiceTimingEnabled) {
    deliverySettings.displayMinSeconds = String(state.minPracticeTime || '').trim() || '0';
    deliverySettings.displayMaxSeconds = String(state.maxPracticeTime || '').trim() || '0';
  }

  return {
    unitname: 'Practice',
    learningsession: {
      clusterlist: clusterRange,
      unitMode: 'distance',
      calculateProbability: CALCULATE_PROBABILITY_FORMULA
    },
    deliverySettings,
    ...(state.responseType === 'multiple-choice'
      ? {
          buttontrial: 'true',
          buttonorder: state.buttonOrder
        }
      : {})
  };
}

function buildAssessmentUnit(state: ManualCreatorState, clusterRange: string) {
  const parameters = cloneImportParameterDefaults();
  const { lfparameter: _lfparameter, ...deliverySettings } = parameters;

  return {
    unitname: 'Assessment',
    assessmentsession: {
      clusterlist: clusterRange,
      randomizegroups: 'false',
      assignrandomclusters: 'false'
    },
    deliverySettings,
    ...(state.responseType === 'multiple-choice'
      ? {
          buttonorder: state.buttonOrder
        }
      : {})
  };
}

function buildUnits(state: ManualCreatorState, clusterRange: string, instructionsHtml: string) {
  const units: Array<Record<string, unknown>> = [];

  if (state.structure === 'instructions-learning' || state.structure === 'instructions-assessment') {
    units.push({
      unitname: 'Instructions',
      unitinstructions: instructionsHtml
    });
  }

  if (state.structure === 'learning-only' || state.structure === 'instructions-learning') {
    units.push(buildLearningUnit(state, clusterRange));
  }

  if (state.structure === 'assessment-only' || state.structure === 'instructions-assessment') {
    units.push(buildAssessmentUnit(state, clusterRange));
  }

  return units;
}

export function buildManualDraftLesson(state: ManualCreatorState): ImportDraftLesson {
  const items = buildItems(state);
  const clusterRange = buildClusterRange(items.length);
  const instructionsHtml = buildInstructionsHtml(state.instructionText, state.lessonName);

  const draft = buildImportLessonDraft({
    id: `manual-${Date.now()}`,
    sourceKind: 'manual',
    lessonName: state.lessonName,
    instructions: instructionsHtml,
    items,
    sourceConfig: {
      structure: state.structure,
      instructionText: state.instructionText,
      visibility: state.visibility,
      experimentLinkEnabled: state.experimentLinkEnabled,
      experimentTarget: state.experimentTarget,
      promptType: state.promptType,
      responseType: state.responseType,
      cardCount: state.cardCount,
      shuffle: state.shuffle,
      buttonOrder: state.buttonOrder,
      speechRecognitionEnabled: state.speechRecognitionEnabled,
      speechLanguage: state.speechLanguage,
      ignoreOutOfGrammar: state.ignoreOutOfGrammar,
      textToSpeechMode: state.textToSpeechMode,
      topBarMode: state.topBarMode,
      practiceTimingEnabled: state.practiceTimingEnabled,
      minPracticeTime: state.minPracticeTime,
      maxPracticeTime: state.maxPracticeTime,
      tags: normalizeTags(state.tags),
      seedMode: state.seedMode,
      seedTableText: state.seedTableText
    }
  });

  const tutor = clone(draft.generatedBaseline.tutor) as {
    setspec?: Record<string, unknown>;
    deliverySettings?: Record<string, unknown>;
    unit?: Array<Record<string, unknown>>;
  };
  tutor.setspec = tutor.setspec || {};
  tutor.setspec.userselect = state.visibility === 'public' ? 'true' : 'false';
  tutor.setspec.experimentTarget = state.experimentLinkEnabled ? String(state.experimentTarget || '').trim() : '';
  tutor.setspec.tags = normalizeTags(state.tags);
  tutor.setspec.shuffleclusters = state.shuffle ? clusterRange : '';
  tutor.setspec.enableAudioPromptAndFeedback = state.textToSpeechMode === 'none' ? 'false' : 'true';
  tutor.setspec.audioPromptMode = mapAudioPromptMode(state.textToSpeechMode);
  tutor.setspec.textToSpeechLanguage = String(state.speechLanguage || '').trim() || 'en-US';
  tutor.setspec.audioInputEnabled = state.speechRecognitionEnabled ? 'true' : 'false';
  tutor.setspec.speechRecognitionLanguage = String(state.speechLanguage || '').trim() || 'en-US';
  tutor.setspec.speechIgnoreOutOfGrammarResponses = state.speechRecognitionEnabled && state.ignoreOutOfGrammar ? 'true' : 'false';
  tutor.deliverySettings = buildDeliverySettings(state);
  tutor.unit = buildUnits(state, clusterRange, instructionsHtml);

  draft.generatedBaseline.tutor = tutor as Record<string, unknown>;
  draft.workingCopy.tutor = clone(tutor) as Record<string, unknown>;

  return draft;
}
