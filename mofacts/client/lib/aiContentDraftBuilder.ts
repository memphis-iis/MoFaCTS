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
import { normalizeAttribution, validateAiOutput, validateAutoTutorOutput } from './aiContentValidation';

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

export function buildDrafts(output: ReturnType<typeof validateAiOutput>['output'], selectedModules: CreationModuleId[]): ImportDraftLesson[] {
  return selectedModules
    .filter((moduleId) => moduleId === 'learningSession' || moduleId === 'assessmentSession')
    .map((moduleId) => applyVisibilityLock(buildManualDraftLesson(buildStateFromAi(output, moduleId)), output));
}

export function buildAutoTutorDraft(output: ReturnType<typeof validateAutoTutorOutput>['output'], apiKey: string, model: string): ImportDraftLesson {
  const safeLessonName = sanitizeImportName(output.lessonName, 'AI_AutoTutor');
  const { stimFileName } = getImportFileNames(safeLessonName);
  const scriptId = sanitizeImportName(`${safeLessonName}_script`, 'AI_AutoTutor_script');
  const stimuli = {
    setspec: {
      clusters: [
        {
          stims: [
            {
              display: {
                text: output.prompt || output.learningGoal || `Explain ${output.topic}.`,
                ...(output.attribution ? { attribution: output.attribution } : {}),
              },
              autoTutor: {
                id: scriptId,
                topic: output.topic,
                learningGoal: output.learningGoal || output.prompt,
                idealAnswer: output.idealAnswer,
                expectations: output.expectations,
                expectationRelationships: output.expectationRelationships,
                ...(output.expectationRelationshipProvenance
                  ? { expectationRelationshipProvenance: output.expectationRelationshipProvenance }
                  : {}),
                misconceptions: output.misconceptions,
                dialogPolicy: {
                  allowAnyOrder: true,
                  requiredExpectations: output.expectations.map((entry) => entry.id),
                  optionalExpectations: [],
                  completionRule: 'Complete when required expectations are covered and active misconceptions are within the graduation threshold.',
                },
                summary: output.summary || output.idealAnswer,
              },
            },
          ],
        },
      ],
    },
  };
  const tutor = {
      setspec: {
        lessonname: safeLessonName,
        stimulusfile: stimFileName,
        userselect: output.visibility === 'public' ? 'true' : 'false',
        openRouterApiKey: apiKey,
        openRouterModel: model,
      },
    unit: [
      {
        unitname: 'AutoTutor',
        autotutorsession: {
          cluster: 0,
          openRouterModel: model,
          maxTurns: output.maxTurns,
          graduation: {
            requiredExpectationCount: output.requiredExpectationCount,
            maxActiveMisconceptions: output.maxActiveMisconceptions,
          },
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
