import type {
  OpenRouterJsonSchema,
  OpenRouterMessage,
} from '../../../../lib/openRouterClient';
import type { SparcControllerDisplay } from './sparcController';
import type {
  SparcLearnerResponseScoringResult,
} from '../../../../../../learning-components/units/sparcsession/sparcLearnerResponseScoring';
import type {
  SparcTrialDisplayDialogueTurnScorer,
} from '../../../../../../learning-components/units/sparcsession/sparcTrialDisplayRuntimeBridge';
import type {
  SparcUtteranceGenerator,
} from '../../../../../../learning-components/units/sparcsession/sparcControllerDialogueTurn';
import type {
  SparcUtteranceRequest,
} from '../../../../../../learning-components/units/sparcsession/sparcUtteranceRequest';

type CallResolvedOpenRouterJson = (params: {
  readonly tdfId?: string | null;
  readonly messages: readonly OpenRouterMessage[];
  readonly intent: {
    readonly title: string;
    readonly schemaName: string;
    readonly schema: OpenRouterJsonSchema;
    readonly missingContentMessage: string;
    readonly strictSchema?: boolean;
  };
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly telemetry?: Record<string, unknown>;
}) => Promise<{
  readonly parsedContent?: unknown;
  readonly model?: string;
  readonly source?: string;
  readonly costUsd?: number;
}>;

export type SparcDialogueOpenRouterProviderOptions = {
  readonly tdfId?: string | null;
  readonly callResolvedOpenRouterJson?: CallResolvedOpenRouterJson;
};

const SPARC_DIALOGUE_SCORE_JSON_SCHEMA: OpenRouterJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    learningTargetScores: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          clusterKC: { type: 'string' },
          coverage: { type: 'number' },
          evidence: { type: 'string' },
          missingElements: { type: 'array', items: { type: 'string' } },
        },
        required: ['clusterKC', 'coverage'],
      },
    },
    diagnosticMisconceptionScores: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          confidence: { type: 'number' },
          evidence: { type: 'string' },
        },
        required: ['id', 'confidence'],
      },
    },
    learnerContribution: {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['answer', 'question', 'off-task', 'other'] },
        confidence: { type: 'number' },
        streakCount: { type: 'number' },
      },
      required: ['type'],
    },
    learnerQuestion: {
      type: 'object',
      additionalProperties: false,
      properties: {
        answerableFromAuthoredContent: { type: 'boolean' },
      },
      required: ['answerableFromAuthoredContent'],
    },
  },
  required: ['learningTargetScores', 'learnerContribution'],
};

const SPARC_DIALOGUE_UTTERANCE_JSON_SCHEMA: OpenRouterJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    targetType: { type: 'string', enum: ['learningTarget', 'misconception', 'completion'] },
    targetId: { type: ['string', 'null'] },
    selectedMove: { type: 'string' },
    tutorMessage: { type: 'string' },
  },
  required: ['targetType', 'targetId', 'selectedMove', 'tutorMessage'],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function nonBlankString(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

function unitScore(value: unknown, label: string): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0 || numberValue > 1) {
    throw new Error(`${label} must be a number from 0 to 1`);
  }
  return numberValue;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const values = value.map((entry) => nonBlankString(entry)).filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function displayFacts(display: SparcControllerDisplay): readonly Record<string, unknown>[] {
  return Array.isArray(display.workingMemoryFacts)
    ? display.workingMemoryFacts.filter(isRecord)
    : [];
}

function factSlot(fact: Record<string, unknown>, slotName: string): unknown {
  return isRecord(fact.slots) ? fact.slots[slotName] : undefined;
}

function priorCoverageByClusterKC(display: SparcControllerDisplay): Map<string, number> {
  const coverage = new Map<string, number>();
  for (const fact of displayFacts(display)) {
    if (fact.factType !== 'learningTarget.score') {
      continue;
    }
    const clusterKC = nonBlankString(factSlot(fact, 'clusterKC'));
    if (!clusterKC) {
      continue;
    }
    coverage.set(clusterKC, Math.max(
      coverage.get(clusterKC) ?? 0,
      unitScore(factSlot(fact, 'coverage'), `SPARC prior learning target coverage for "${clusterKC}"`),
    ));
  }
  return coverage;
}

function priorMisconceptionConfidenceById(display: SparcControllerDisplay): Map<string, number> {
  const confidence = new Map<string, number>();
  for (const fact of displayFacts(display)) {
    if (fact.factType !== 'diagnostic.misconceptionScore') {
      continue;
    }
    const id = nonBlankString(factSlot(fact, 'id'));
    if (!id) {
      continue;
    }
    confidence.set(id, unitScore(factSlot(fact, 'confidence'), `SPARC prior misconception confidence for "${id}"`));
  }
  return confidence;
}

function targetSummaries(display: SparcControllerDisplay): readonly Record<string, unknown>[] {
  const priorCoverage = priorCoverageByClusterKC(display);
  const cleanTargets = isRecord(display.autoTutorTargets) && Array.isArray(display.autoTutorTargets.expectations)
    ? display.autoTutorTargets.expectations
    : [];
  if (cleanTargets.length === 0) {
    throw new Error('SPARC AutoTutor scoring requires clean autoTutorTargets.expectations');
  }
  return cleanTargets
    .filter(isRecord)
    .map((entry) => {
      const clusterKC = nonBlankString(entry.clusterKC);
      const text = nonBlankString(entry.text);
      if (!clusterKC || !text) {
        throw new Error('SPARC AutoTutor scoring requires each expectation to include clusterKC and text');
      }
      return {
        clusterKC,
        text,
        priorCoverage: priorCoverage.get(clusterKC) ?? 0,
      };
    });
}

function cleanMisconceptionEntries(display: SparcControllerDisplay): readonly unknown[] {
  if (isRecord(display.autoTutorTargets) && Array.isArray(display.autoTutorTargets.misconceptions)) {
    return display.autoTutorTargets.misconceptions;
  }
  if (isRecord(display.misconceptionTable) && Array.isArray(display.misconceptionTable.misconceptions)) {
    return display.misconceptionTable.misconceptions;
  }
  return [];
}

function misconceptionSummaries(display: SparcControllerDisplay): readonly Record<string, unknown>[] {
  const priorConfidence = priorMisconceptionConfidenceById(display);
  return cleanMisconceptionEntries(display)
    .filter(isRecord)
    .map((entry) => {
      const id = nonBlankString(entry.id);
      const text = nonBlankString(entry.text);
      if (!id || !text) {
        throw new Error('SPARC AutoTutor scoring requires each misconception to include id and text');
      }
      return {
        id,
        text,
        priorConfidence: priorConfidence.get(id) ?? 0,
      };
    });
}

function parseScoreEnvelope(value: unknown): SparcLearnerResponseScoringResult {
  if (!isRecord(value)) {
    throw new Error('SPARC dialogue scoring response must be an object');
  }
  const learningTargetScores = (Array.isArray(value.learningTargetScores) ? value.learningTargetScores : [])
    .filter(isRecord)
    .map((entry) => {
      const evidence = nonBlankString(entry.evidence);
      const missingElements = stringArray(entry.missingElements);
      return {
        clusterKC: nonBlankString(entry.clusterKC),
        coverage: unitScore(entry.coverage, `SPARC dialogue score for "${String(entry.clusterKC)}"`),
        ...(evidence ? { evidence } : {}),
        ...(missingElements ? { missingElements } : {}),
      };
    })
    .filter((entry) => entry.clusterKC);
  const diagnosticMisconceptionScores = (Array.isArray(value.diagnosticMisconceptionScores)
    ? value.diagnosticMisconceptionScores
    : [])
    .filter(isRecord)
    .map((entry) => ({
      id: nonBlankString(entry.id),
      confidence: unitScore(entry.confidence, `SPARC dialogue misconception confidence for "${String(entry.id)}"`),
      ...(nonBlankString(entry.evidence) ? { evidence: nonBlankString(entry.evidence) } : {}),
    }))
    .filter((entry) => entry.id);
  const contribution = isRecord(value.learnerContribution) ? value.learnerContribution : {};
  const contributionType = nonBlankString(contribution.type);
  if (!['answer', 'question', 'off-task', 'other'].includes(contributionType)) {
    throw new Error('SPARC dialogue scoring learnerContribution.type is invalid');
  }
  const learnerQuestion = isRecord(value.learnerQuestion) && typeof value.learnerQuestion.answerableFromAuthoredContent === 'boolean'
    ? { answerableFromAuthoredContent: value.learnerQuestion.answerableFromAuthoredContent }
    : undefined;
  if (contributionType === 'question' && !learnerQuestion) {
    throw new Error('SPARC dialogue scoring learnerQuestion is required when learnerContribution.type is question');
  }
  return {
    learningTargetScores,
    ...(diagnosticMisconceptionScores.length > 0 ? { diagnosticMisconceptionScores } : {}),
    learnerContribution: {
      type: contributionType as 'answer' | 'question' | 'off-task' | 'other',
      ...(contribution.confidence !== undefined ? { confidence: unitScore(contribution.confidence, 'SPARC dialogue learner contribution confidence') } : {}),
      ...(Number.isFinite(Number(contribution.streakCount)) ? { streakCount: Number(contribution.streakCount) } : {}),
    },
    ...(contributionType === 'question' && learnerQuestion ? { learnerQuestion } : {}),
  };
}

function parseUtteranceEnvelope(value: unknown, request: SparcUtteranceRequest): string {
  if (!isRecord(value)) {
    throw new Error('SPARC dialogue utterance response must be an object');
  }
  const targetType = nonBlankString(value.targetType);
  if (targetType !== request.targetType) {
    throw new Error(`SPARC dialogue utterance response targetType "${targetType}" did not match selected targetType "${request.targetType}"`);
  }
  const targetId = value.targetId === null ? null : nonBlankString(value.targetId);
  const expectedTargetId = request.targetId || null;
  if (targetId !== expectedTargetId) {
    throw new Error(`SPARC dialogue utterance response targetId "${String(value.targetId)}" did not match selected targetId "${String(expectedTargetId)}"`);
  }
  const selectedMove = nonBlankString(value.selectedMove);
  if (selectedMove !== request.action) {
    throw new Error(`SPARC dialogue utterance response selectedMove "${selectedMove}" did not match selected move "${request.action}"`);
  }
  const tutorMessage = nonBlankString(value.tutorMessage);
  if (!tutorMessage) {
    throw new Error('SPARC dialogue utterance response requires tutorMessage');
  }
  return tutorMessage;
}

const SPARC_AUTOTUTOR_UTTERANCE_ENVELOPE_SCHEMA = Object.freeze({
  targetType: 'learningTarget | misconception | completion',
  targetId: 'string | null',
  selectedMove: 'pump | positive_pump | prompt | hint | elaborate | splice | summary',
  tutorMessage: 'string',
});

function buildSparcUtteranceSystemPrompt(request: SparcUtteranceRequest): string {
  const moveDefinition = request.moveDefinition;
  return [
    'Return JSON only. Do not wrap it in Markdown.',
    'Echo targetType, targetId, and selectedMove exactly as provided by the application.',
    'Do not expose internal ids, rule ids, rubric labels, scoring fields, or planner metadata in tutorMessage.',
    'Use only the authored lesson content and dialogue context supplied in the user message.',
    'Begin tutorMessage with one brief immediate-feedback statement whose correctness and polarity are grounded in Immediate-feedback evidence.',
    'Do not describe repetition or endorsement of an active misconception as progress, closeness, or a good start.',
    'When targetType is misconception, selectedMisconception is an incorrect learner belief to inspect and repair; it is not correct lesson content to repeat or endorse.',
    'Use correctExpectations as the authoritative positive content for inferring the repair.',
    `Selected move: ${moveDefinition.moveId}.`,
    'Move prompt:',
    moveDefinition.promptPolicy,
    'The JSON object must exactly follow this envelope shape:',
    JSON.stringify(SPARC_AUTOTUTOR_UTTERANCE_ENVELOPE_SCHEMA, null, 2),
  ].join('\n');
}

function buildSparcUtteranceUserPrompt(request: SparcUtteranceRequest): string {
  return [
    'Latest student answer:',
    request.learnerText ?? '',
    '',
    'Learner contribution classification:',
    JSON.stringify(request.learnerContribution ?? null, null, 2),
    '',
    'App-selected plan. Echo targetType, targetId, and selectedMove exactly in the response:',
    JSON.stringify({
      targetType: request.targetType,
      targetId: request.targetId || null,
      selectedMove: request.action,
    }, null, 2),
    '',
    'Registered move definition:',
    JSON.stringify({
      moveId: request.moveDefinition.moveId,
      version: request.moveDefinition.version,
      family: request.moveDefinition.family,
      promptId: request.moveDefinition.promptId,
      promptVersion: request.moveDefinition.promptVersion,
      outputSchemaId: request.moveDefinition.outputSchemaId,
      outputSchemaVersion: request.moveDefinition.outputSchemaVersion,
      renderer: request.moveDefinition.renderer,
      historyAction: request.moveDefinition.historyAction,
    }, null, 2),
    '',
    'App-selected pedagogical state:',
    JSON.stringify(request.pedagogicalState ?? null, null, 2),
    '',
    'Immediate-feedback evidence. Ground the opening feedback in this latest-response evidence before carrying out the selected move:',
    JSON.stringify(request.feedbackEvidence ?? null, null, 2),
    '',
    'Transition metadata:',
    JSON.stringify(request.transitionMetadata ?? null, null, 2),
    '',
    'Relevant authored target content:',
    JSON.stringify(request.targetContent ?? request.contentTexts, null, 2),
    '',
    'Current scored planner state:',
    JSON.stringify(request.plannerState ?? null, null, 2),
    '',
    'Full dialogue history:',
    JSON.stringify(request.dialogueHistory ?? [], null, 2),
  ].join('\n');
}

function defaultCallResolvedOpenRouterJson(params: Parameters<CallResolvedOpenRouterJson>[0]) {
  const meteor = (globalThis as typeof globalThis & {
    Meteor?: { callAsync?: (name: string, ...args: unknown[]) => Promise<unknown> };
  }).Meteor;
  if (typeof meteor?.callAsync !== 'function') {
    throw new Error('SPARC dialogue OpenRouter provider requires Meteor.callAsync or an injected callResolvedOpenRouterJson');
  }
  return meteor.callAsync('callResolvedOpenRouterJson', params);
}

export function createSparcDialogueOpenRouterProvider(
  options: SparcDialogueOpenRouterProviderOptions,
): {
  readonly scoreLearnerResponse: SparcTrialDisplayDialogueTurnScorer;
  readonly generateTutorUtterance: SparcUtteranceGenerator;
} {
  const callResolvedOpenRouterJson = options.callResolvedOpenRouterJson ?? defaultCallResolvedOpenRouterJson;
  return {
    async scoreLearnerResponse({ display, learnerText }) {
      const result = await callResolvedOpenRouterJson({
        tdfId: options.tdfId ?? null,
        temperature: 0,
        maxTokens: 1200,
        messages: [{
          role: 'system',
          content: [
            'You score a learner answer against authored expectations and misconceptions.',
            'Return only JSON matching the schema.',
            'For every object in learningTargets, write one object in learningTargetScores, copying learningTargets[i].clusterKC exactly to learningTargetScores[i].clusterKC.',
            'For every object in misconceptions, write one object in diagnosticMisconceptionScores, copying misconceptions[i].id exactly to diagnosticMisconceptionScores[i].id.',
            'Do not score the latest response from scratch.',
            'Compare meanings, not keyword overlap, and use continuous scores between 0 and 1 only when the latest learner response refers to the target meaning.',
            'Treat priorCoverage and priorConfidence as the current learner model; for each learning target or misconception, return its prior value unchanged unless the learner’s latest response refers to that target’s meaning and provides semantic evidence that the value should change.',
            'Scores may increase or decrease only when the latest learner response refers to that target and gives semantic evidence for that change.',
            'Resolve learner references using the current problem statement and dialogue context. Do not switch a learner’s reference to a different object unless the learner explicitly names that object or the immediately preceding tutor question clearly establishes it.',
            'For learning targets, compare the learner’s claim to learningTargets[i].text; return the updated learner-model value in coverage.',
            'For misconceptions, compare the learner’s claim to misconceptions[i].text; return the updated learner-model value in confidence.',
            'For misconception confidence, use a continuous 0 to 1 active-misconception score: 1 means the learner is clearly expressing that misconception; 0 means there is no prior evidence or the learner explicitly repaired or rejected it; if the latest response merely omits the misconception, asks a clarification question, or makes a meta/off-task comment, copy priorConfidence unchanged.',
            'A high misconception confidence is not a good score; it means stronger evidence of the misconception. Do not assign high misconception confidence because the learner gave a good or correct answer.',
            'When the latest learner response refers to a target but uses similar words with a different relation, wrong object, wrong condition, or wrong procedure, use low or zero scores for that target.',
            'Set learnerContribution.type to "answer" for ordinary answers or explanations, "question" for learner questions, "off-task" for unrelated responses, and "other" only when none of those fit.',
            'Include learnerQuestion only for learnerContribution.type "question"; set learnerQuestion.answerableFromAuthoredContent true only if the question can be answered from the provided learning targets or misconceptions.',
          ].join(' '),
        }, {
          role: 'user',
          content: JSON.stringify({
            learnerText,
            learningTargets: targetSummaries(display),
            misconceptions: misconceptionSummaries(display),
          }),
        }],
        intent: {
          title: 'MoFaCTS SPARC Dialogue Scoring',
          schemaName: 'mofacts_sparc_dialogue_score',
          schema: SPARC_DIALOGUE_SCORE_JSON_SCHEMA,
          missingContentMessage: 'OpenRouter SPARC dialogue scoring response did not include message content.',
        },
        telemetry: {
          surface: 'sparc-dialogue-runtime',
          operation: 'score-learner-response',
          componentId: 'mofacts.sparc-session-unit',
          unitType: 'sparcsession',
        },
      });
      return parseScoreEnvelope(result.parsedContent);
    },

    async generateTutorUtterance(request) {
      const result = await callResolvedOpenRouterJson({
        tdfId: options.tdfId ?? null,
        temperature: 0.4,
        maxTokens: 700,
        messages: [{
          role: 'system',
          content: buildSparcUtteranceSystemPrompt(request),
        }, {
          role: 'user',
          content: buildSparcUtteranceUserPrompt(request),
        }],
        intent: {
          title: 'MoFaCTS SPARC Dialogue Utterance',
          schemaName: 'mofacts_sparc_dialogue_utterance',
          schema: SPARC_DIALOGUE_UTTERANCE_JSON_SCHEMA,
          missingContentMessage: 'OpenRouter SPARC dialogue utterance response did not include message content.',
          strictSchema: true,
        },
        telemetry: {
          surface: 'sparc-dialogue-runtime',
          operation: 'generate-tutor-utterance',
          componentId: 'mofacts.sparc-session-unit',
          unitType: 'sparcsession',
        },
      });
      return parseUtteranceEnvelope(result.parsedContent, request);
    },
  };
}
