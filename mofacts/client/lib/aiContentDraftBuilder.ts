import { Random } from 'meteor/random';
import {
  buildManualDraftLesson,
  createDefaultManualCreatorState,
  type ManualCreatorState,
  type StarterRow,
} from './manualDraftBuilder';
import { getImportFileNames, sanitizeImportName } from './importCompositionBuilder';
import type { ImportDraftLesson } from './normalizedImportTypes';
import type { AiItem, CreationModuleId } from './aiContentTypes';
import type { PreparedAiImageAsset } from './aiContentImageAssets';
import { normalizeAttribution, validateAiOutput, validateAutoTutorOutput } from './aiContentValidation';
import {
  buildCanonicalSparcAutoTutorProductionRules,
  SPARC_AUTOTUTOR_CALCULATE_PROBABILITY,
  SPARC_AUTOTUTOR_INSTRUCTIONAL_CONTROLLER,
} from './sparcAutoTutorDraftTemplate';

function promptTextFromItem(item: AiItem): string {
  return String(item.prompt?.text || '').trim();
}

function mediaRefFromItem(item: AiItem, promptType: ManualCreatorState['promptType']): string {
  if (promptType === 'image' || promptType === 'text-image') return String(item.prompt?.imgSrc || '').trim();
  if (promptType === 'audio') return String(item.prompt?.audioSrc || '').trim();
  if (promptType === 'video') return String(item.prompt?.videoSrc || '').trim();
  return '';
}

function buildStateFromAi(output: ReturnType<typeof validateAiOutput>['output'], moduleId: CreationModuleId): ManualCreatorState {
  const defaultState = createDefaultManualCreatorState();
  const lessonSuffix = moduleId === 'assessmentSession' ? ' Assessment' : '';
  const structure = moduleId === 'assessmentSession' ? 'instructions-assessment' : 'instructions-learning';
  const rows: StarterRow[] = output.items.map((item) => {
    const incorrect = item.response?.incorrectResponses || [];
    const attribution = normalizeAttribution(item.prompt?.attribution);
    return {
      id: Random.id(),
      promptText: promptTextFromItem(item),
      mediaRef: mediaRefFromItem(item, output.promptType),
      answer: String(item.response?.correctResponse || '').trim(),
      choice2: String(incorrect[0] || '').trim(),
      choice3: String(incorrect[1] || '').trim(),
      choice4: String(incorrect[2] || '').trim(),
      ...(attribution ? { attribution } : {}),
    };
  });
  return {
    ...defaultState,
    lessonName: `${output.lessonName}${lessonSuffix}`,
    structure,
    instructionText: output.instructions,
    promptType: output.promptType,
    responseType: moduleId === 'assessmentSession' && output.responseType === 'typed' ? 'typed' : output.responseType,
    cardCount: rows.length,
    shuffle: output.shuffle,
    buttonOrder: output.buttonOrder,
    textToSpeechMode: output.textToSpeechMode,
    topBarMode: output.topBarMode,
    visibility: output.visibility,
    tags: output.tags.join(', '),
    rows,
  };
}

function applyVisibilityLock(draft: ImportDraftLesson, output: ReturnType<typeof validateAiOutput>['output']): ImportDraftLesson {
  const reason = String(output.visibilityLockReason || '').trim();
  if (!reason) {
    return draft;
  }
  for (const tutor of [draft.generatedBaseline.tutor, draft.workingCopy.tutor] as Array<{ setspec?: Record<string, unknown> }>) {
    tutor.setspec = tutor.setspec || {};
    tutor.setspec.userselect = 'false';
    tutor.setspec.aiVisibilityLockReason = reason;
  }
  return draft;
}

function attachUploadedImages(
  drafts: ImportDraftLesson[],
  output: ReturnType<typeof validateAiOutput>['output'],
  uploadedImages: PreparedAiImageAsset[],
): ImportDraftLesson[] {
  if (uploadedImages.length === 0) {
    return drafts;
  }
  const assetsByName = new Map(uploadedImages.map((asset) => [asset.packageFileName, asset]));
  const referencedNames = new Set(
    output.items
      .map((item) => String(item.prompt?.imgSrc || '').trim())
      .filter((source) => source && !/^https?:\/\//i.test(source))
  );
  for (const name of referencedNames) {
    if (!assetsByName.has(name)) {
      throw new Error(`Generated content referenced unknown uploaded image asset "${name}".`);
    }
  }
  const unusedImages = uploadedImages.filter((asset) => !referencedNames.has(asset.packageFileName));
  if (unusedImages.length > 0) {
    throw new Error(`Generated content did not use uploaded image asset${unusedImages.length === 1 ? '' : 's'}: ${unusedImages.map((asset) => asset.packageFileName).join(', ')}.`);
  }
  const mediaFiles = Object.fromEntries(
    Array.from(referencedNames).map((name) => [name, assetsByName.get(name)!.bytes])
  );
  for (const draft of drafts) {
    draft.generatedBaseline.mediaFiles = { ...mediaFiles };
    if (draft.stats) {
      draft.stats.mediaCount = Object.keys(mediaFiles).length;
    }
  }
  return drafts;
}

export function buildDrafts(
  output: ReturnType<typeof validateAiOutput>['output'],
  selectedModules: CreationModuleId[],
  uploadedImages: PreparedAiImageAsset[] = [],
): ImportDraftLesson[] {
  const drafts = selectedModules
    .filter((moduleId) => moduleId === 'learningSession' || moduleId === 'assessmentSession')
    .map((moduleId) => applyVisibilityLock(buildManualDraftLesson(buildStateFromAi(output, moduleId)), output));
  return attachUploadedImages(drafts, output, uploadedImages);
}

function normalizeSparcSlug(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function ensureSparcAutoTutorName(value: string): string {
  const safeBase = sanitizeImportName(value, 'AI_AutoTutor');
  return /^SPARC_AutoTutor_/i.test(safeBase)
    ? safeBase
    : sanitizeImportName(`SPARC_AutoTutor_${safeBase}`, 'SPARC_AutoTutor');
}

function normalizeTargetId(value: string, fallback: string): string {
  return normalizeSparcSlug(value, fallback).replace(/-/g, '');
}

function clusterListForCount(count: number): string {
  return count === 1 ? '0' : `0-${count - 1}`;
}

export function buildAutoTutorDraft(output: ReturnType<typeof validateAutoTutorOutput>['output'], apiKey: string, model: string): ImportDraftLesson {
  const safeLessonName = ensureSparcAutoTutorName(output.lessonName);
  const { stimFileName } = getImportFileNames(safeLessonName);
  const lessonSlug = normalizeSparcSlug(safeLessonName, 'sparc-autotutor');
  const pageId = `sparc-session-${lessonSlug}`;
  const expectationTargets = output.expectations.map((expectation, index) => {
    const targetId = normalizeTargetId(expectation.id, `e${index + 1}`);
    const clusterKC = `autotutor.${lessonSlug}.kc.${targetId}`;
    const text = expectation.assertion || expectation.proposition;
    return {
      index,
      clusterKC,
      text,
    };
  });
  const misconceptionTargets = output.misconceptions.filter((misconception) => misconception !== null).map((misconception) => ({
    id: misconception.id,
    text: misconception.misconception,
  }));
  const stimuli = {
    setspec: {
      clusters: expectationTargets.map((target) => ({
        clusterKC: target.clusterKC,
        stims: [
          {
            clusterKC: target.clusterKC,
            text: target.text,
          },
        ],
      })),
      sparcPages: [
        {
          pageId,
          display: {
            type: 'sparc',
            schema: 'tutorscript-sparc/2.0',
            unitType: 'sparc-autotutor-dialogue',
            instructionalController: SPARC_AUTOTUTOR_INSTRUCTIONAL_CONTROLLER,
            layout: {
              layoutMode: 'document',
              scrollAxis: 'vertical',
              visualPreset: 'practice-panel',
              density: 'comfortable',
            },
            nodes: [
              {
                id: 'dialogue-thread',
                nodeType: 'group',
                groupType: 'dialogue-thread',
                children: [
                  {
                    id: 'opening-tutor-message',
                    nodeType: 'atomic',
                    atomType: 'dialogue-utterance',
                    speaker: 'tutor',
                    value: output.prompt || output.learningGoal || `Explain ${output.topic}.`,
                    clusterIndices: expectationTargets.map((target) => target.index),
                  },
                ],
              },
              {
                id: 'learner-response-input',
                nodeType: 'atomic',
                atomType: 'text-input',
                label: 'Response',
              },
              {
                id: 'learner-response-submit',
                nodeType: 'atomic',
                atomType: 'button',
                label: 'Submit',
                value: 'submit',
              },
            ],
            clusterTargets: expectationTargets.map((target) => ({
              clusterIndex: target.index,
              clusterKC: target.clusterKC,
            })),
            autoTutorTargets: {
              expectations: expectationTargets.map((target) => ({
                clusterKC: target.clusterKC,
                text: target.text,
              })),
              misconceptions: misconceptionTargets,
            },
            workingMemoryFacts: [
              {
                factType: 'dialogue.source',
                slots: {
                  sourceKind: 'ai-generated-sparc-autotutor',
                  sourceLessonName: safeLessonName,
                  sourceUnitName: 'SPARC AutoTutor',
                  topic: output.topic,
                  openRouterModel: model,
                },
              },
              {
                factType: 'dialogue.thresholds',
                slots: {
                  lowCoverageMax: 0.33,
                  mediumCoverageMax: 0.67,
                  highCoverageMin: 0.67,
                  coverageThreshold: 0.8,
                },
              },
              {
                factType: 'controller.targetSelectionPolicy',
                slots: {
                  policy: 'kc-graph-priority',
                  coverageThreshold: 0.8,
                  frontierWeight: 0.5,
                  coherenceWeight: 0.3,
                  centralityWeight: 0.2,
                },
              },
              {
                factType: 'dialogue.graduation',
                slots: {
                  requiredTargetCount: output.requiredExpectationCount,
                  maxActiveMisconceptions: output.maxActiveMisconceptions,
                  maxTurns: output.maxTurns,
                },
              },
              ...expectationTargets.map((target) => ({
                factType: 'kcGraph.node',
                slots: {
                  clusterKC: target.clusterKC,
                  description: target.text,
                  centrality: 0,
                },
              })),
            ],
            productionRules: buildCanonicalSparcAutoTutorProductionRules(),
          },
        },
      ],
    },
  };
  const tutor = {
      setspec: {
        lessonname: safeLessonName,
        name: pageId,
        stimulusfile: stimFileName,
        userselect: output.visibility === 'public' ? 'true' : 'false',
        openRouterApiKey: apiKey,
        openRouterModel: model,
        tags: ['autotutor', 'sparc-session', 'sparc-autotutor', 'ai-generated'],
      },
    unit: [
      {
        unitname: 'SPARC AutoTutor',
        sparcsession: {
          unitMode: 'distance',
          pageId,
          clusterlist: clusterListForCount(expectationTargets.length),
          calculateProbability: SPARC_AUTOTUTOR_CALCULATE_PROBABILITY,
        },
      },
    ],
  };

  return {
    id: `ai-autotutor-${Date.now()}`,
    sourceKind: 'manual',
    title: safeLessonName,
    sourceConfig: {
      sourceKind: 'ai',
      moduleId: 'autoTutor',
      model,
    },
    generatedBaseline: {
      tutor,
      stimuli,
      mediaFiles: {},
      manifestMeta: {
        moduleId: 'autoTutor',
        artifactKind: 'autoTutor',
      },
    },
    workingCopy: {
      tutor: JSON.parse(JSON.stringify(tutor)),
      stimuli: JSON.parse(JSON.stringify(stimuli)),
    },
    stats: {
      totalItems: 1,
      skippedItems: 0,
      mediaCount: 0,
    },
  };
}
