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
          current: { type: 'boolean' },
          repaired: { type: 'boolean' },
          evidence: { type: 'string' },
        },
        required: ['id', 'confidence'],
      },
    },
    answerQuality: { type: 'string', enum: ['low', 'partial', 'high'] },
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
  required: ['learningTargetScores', 'answerQuality', 'learnerContribution'],
};

const SPARC_DIALOGUE_UTTERANCE_JSON_SCHEMA: OpenRouterJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    targetType: { type: 'string', enum: ['learningTarget', 'misconception', 'completion'] },
    targetId: { type: 'string' },
    action: { type: 'string' },
    tutorMessage: { type: 'string' },
  },
  required: ['targetType', 'targetId', 'action', 'tutorMessage'],
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
  const ids = new Map<string, Set<string>>();
  for (const fact of displayFacts(display)) {
    if (fact.factType !== 'dialogue.moveContent' || factSlot(fact, 'targetType') !== 'misconception') {
      continue;
    }
    const id = nonBlankString(factSlot(fact, 'id'));
    const text = nonBlankString(factSlot(fact, 'text'));
    if (!id || !text) {
      continue;
    }
    const texts = ids.get(id) ?? new Set<string>();
    texts.add(text);
    ids.set(id, texts);
  }
  return Array.from(ids.entries()).map(([id, texts]) => ({
    id,
    authoredContent: Array.from(texts),
  }));
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
      current: entry.current === true,
      repaired: entry.repaired === true,
      ...(nonBlankString(entry.evidence) ? { evidence: nonBlankString(entry.evidence) } : {}),
    }))
    .filter((entry) => entry.id);
  const answerQuality = nonBlankString(value.answerQuality);
  if (answerQuality !== 'low' && answerQuality !== 'partial' && answerQuality !== 'high') {
    throw new Error('SPARC dialogue scoring answerQuality must be low, partial, or high');
  }
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
    answerQuality,
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
  const targetId = nonBlankString(value.targetId);
  const action = nonBlankString(value.action);
  if (targetType !== request.targetType || targetId !== request.targetId || action !== request.action) {
    throw new Error('SPARC dialogue utterance response changed the selected target or action');
  }
  const tutorMessage = nonBlankString(value.tutorMessage);
  if (!tutorMessage) {
    throw new Error('SPARC dialogue utterance response requires tutorMessage');
  }
  return tutorMessage;
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
            'You score learner dialogue responses for a SPARC tutoring session.',
            'Return only JSON matching the schema.',
            'Use the provided clusterKC identifiers exactly.',
            'Coverage is 0 to 1 for how well the learner addressed each target in this turn.',
            'Include learnerQuestion only when learnerContribution.type is question.',
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
          strictSchema: true,
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
          content: [
            'You write one concise tutor utterance for a SPARC tutoring dialogue.',
            'Do not choose or change the target, target id, or action.',
            'Use only the selected authored content as grounding.',
            'Return only JSON matching the schema.',
          ].join(' '),
        }, {
          role: 'user',
          content: JSON.stringify({
            targetType: request.targetType,
            targetId: request.targetId,
            action: request.action,
            selectedAction: request.selectedAction,
            authoredContent: request.contentTexts,
          }),
        }],
        intent: {
          title: 'MoFaCTS SPARC Dialogue Utterance',
          schemaName: 'mofacts_sparc_dialogue_utterance',
          schema: SPARC_DIALOGUE_UTTERANCE_JSON_SCHEMA,
          strictSchema: true,
          missingContentMessage: 'OpenRouter SPARC dialogue utterance response did not include message content.',
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
