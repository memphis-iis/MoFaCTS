import type {
  OpenRouterJsonSchema,
  OpenRouterMessage,
} from '../../../../lib/openRouterClient';
import type { SparcTrialDisplay } from '../../../../../../learning-components/trial-displays/sparc/SparcTrialDisplayAdapter';
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
        type: { type: 'string', enum: ['assertion', 'question', 'off-task', 'other'] },
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

function displayFacts(display: SparcTrialDisplay): readonly Record<string, unknown>[] {
  return Array.isArray(display.workingMemoryFacts)
    ? display.workingMemoryFacts.filter(isRecord)
    : [];
}

function factSlot(fact: Record<string, unknown>, slotName: string): unknown {
  return isRecord(fact.slots) ? fact.slots[slotName] : undefined;
}

function targetSummaries(display: SparcTrialDisplay): readonly Record<string, unknown>[] {
  const sourceFacts = new Map<string, Record<string, unknown>>();
  for (const fact of displayFacts(display)) {
    if (fact.factType === 'learningTarget.source') {
      const clusterKC = nonBlankString(factSlot(fact, 'clusterKC'));
      if (clusterKC) {
        sourceFacts.set(clusterKC, fact.slots as Record<string, unknown>);
      }
    }
  }
  return (Array.isArray(display.clusterTargets) ? display.clusterTargets : [])
    .filter(isRecord)
    .map((target) => {
      const clusterKC = nonBlankString(target.clusterKC);
      const source = sourceFacts.get(clusterKC) ?? {};
      return {
        clusterKC,
        label: nonBlankString(source.label) || nonBlankString(target.label),
        proposition: nonBlankString(source.proposition),
        assertion: nonBlankString(source.assertion),
      };
    })
    .filter((target) => target.clusterKC);
}

function misconceptionSummaries(display: SparcTrialDisplay): readonly Record<string, unknown>[] {
  const summaries = new Map<string, Record<string, unknown> & { authoredContent: string[] }>();
  for (const fact of displayFacts(display)) {
    if (fact.factType === 'diagnostic.misconceptionSource') {
      const id = nonBlankString(factSlot(fact, 'id'));
      if (!id) {
        continue;
      }
      const existing = summaries.get(id) ?? { id, authoredContent: [] };
      summaries.set(id, {
        ...existing,
        id,
        label: nonBlankString(factSlot(fact, 'label')) || existing.label,
        description: nonBlankString(factSlot(fact, 'description')) || existing.description,
        repair: nonBlankString(factSlot(fact, 'repair')) || existing.repair,
        repairQuestion: nonBlankString(factSlot(fact, 'repairQuestion')) || existing.repairQuestion,
        repairCriteria: nonBlankString(factSlot(fact, 'repairCriteria')) || existing.repairCriteria,
        authoredContent: existing.authoredContent,
      });
    }
    if (fact.factType === 'dialogue.moveContent' && factSlot(fact, 'targetType') === 'misconception') {
      const id = nonBlankString(factSlot(fact, 'id'));
      const text = nonBlankString(factSlot(fact, 'text'));
      if (!id || !text) {
        continue;
      }
      const existing = summaries.get(id) ?? { id, authoredContent: [] };
      if (!existing.authoredContent.includes(text)) {
        existing.authoredContent.push(text);
      }
      summaries.set(id, existing);
    }
  }
  return Array.from(summaries.values());
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
  if (!['assertion', 'question', 'off-task', 'other'].includes(contributionType)) {
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
      type: contributionType as 'assertion' | 'question' | 'off-task' | 'other',
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
            'Compare meanings, not keyword overlap, and score 1 for identical meaning and 0 for no meaning match.',
            'Intermediate match should range between 0 and 1.',
            'For learning targets, compare the learner’s claim to learningTargets[i].assertion and learningTargets[i].proposition, and put the similarity score in coverage.',
            'For misconceptions, compare the learner’s claim to misconceptions[i].description, and put the similarity score in confidence.',
            'Use low or zero scores when the learner uses similar words but states a different relation, wrong object, wrong condition, or wrong procedure.',
            'Set learnerContribution.type to "assertion" for ordinary answers or explanations, "question" for learner questions, "off-task" for unrelated responses, and "other" only when none of those fit.',
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
