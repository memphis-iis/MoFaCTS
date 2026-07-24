import type {
  OpenRouterJsonSchema,
  OpenRouterMessage,
} from '../../../../lib/openRouterClient';
import type { SparcControllerDisplay } from './sparcController';
import {
  reduceSparcLearnerResponseEvidence,
  type SparcEvidenceDirection,
  type SparcLearnerResponseEvidenceEnvelope,
  type SparcLearnerResponseScoringResult,
} from '../../../../../../learning-components/units/sparcsession/sparcLearnerResponseScoring';
import type {
  SparcTrialDisplayDialogueTurnScorer,
} from '../../../../../../learning-components/units/sparcsession/sparcTrialDisplayRuntimeBridge';
import type {
  SparcUtteranceGenerator,
} from '../../../../../../learning-components/units/sparcsession/sparcControllerDialogueTurn';
import {
  buildSparcDialogueHistory,
  type SparcUtteranceRequest,
} from '../../../../../../learning-components/units/sparcsession/sparcUtteranceRequest';
import { buildSparcWorkingMemoryFacts } from '../../../../../../learning-components/units/sparcsession/sparcWorkingMemoryFacts';

export type CallResolvedOpenRouterJson = (params: {
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

export type SparcDialogueLearnerResponseEvaluation = Readonly<{
  evidenceEnvelope: SparcLearnerResponseEvidenceEnvelope;
  learnerResponseScore: SparcLearnerResponseScoringResult;
}>;

export type SparcDialogueLearnerResponseScoringTraceEvent =
  | Readonly<{
      stage: 'provider-response';
      parsedContent: unknown;
    }>
  | Readonly<{
      stage: 'evidence-parsed';
      evidenceEnvelope: SparcLearnerResponseEvidenceEnvelope;
    }>
  | Readonly<{
      stage: 'evaluation-completed';
      evaluation: SparcDialogueLearnerResponseEvaluation;
    }>;

export type SparcDialogueOpenRouterProviderOptions = {
  readonly tdfId?: string | null;
  readonly callResolvedOpenRouterJson?: CallResolvedOpenRouterJson;
  readonly onLearnerResponseScoringTrace?: (
    event: SparcDialogueLearnerResponseScoringTraceEvent,
  ) => void;
};

const SPARC_DIALOGUE_SCORE_JSON_SCHEMA: OpenRouterJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    learningTargetEvaluations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          clusterKC: { type: 'string' },
          evidenceDirection: { type: 'string', enum: ['supports', 'contradicts', 'unaddressed'] },
          evidenceStrength: { type: 'number' },
        },
        required: ['clusterKC', 'evidenceDirection', 'evidenceStrength'],
      },
    },
    diagnosticMisconceptionEvaluations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          evidenceDirection: { type: 'string', enum: ['supports', 'contradicts', 'unaddressed'] },
          evidenceStrength: { type: 'number' },
        },
        required: ['id', 'evidenceDirection', 'evidenceStrength'],
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
        contentFocused: { type: 'boolean' },
      },
      required: ['contentFocused'],
    },
  },
  required: ['learningTargetEvaluations', 'diagnosticMisconceptionEvaluations', 'learnerContribution'],
};

const SPARC_DIALOGUE_UTTERANCE_JSON_SCHEMA: OpenRouterJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    targetType: { type: 'string', enum: ['learningTarget', 'misconception', 'learnerQuestion', 'completion'] },
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

function evidenceStrength(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a number from 0 to 1`);
  }
  return value;
}

function targetSummaries(
  display: SparcControllerDisplay,
): readonly Record<string, unknown>[] {
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

function misconceptionSummaries(
  display: SparcControllerDisplay,
): readonly Record<string, unknown>[] {
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
      };
    });
}

function exactEvidenceId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required`);
  }
  return value;
}

function evidenceDirection(value: unknown, label: string): SparcEvidenceDirection {
  if (value !== 'supports' && value !== 'contradicts' && value !== 'unaddressed') {
    throw new Error(`${label} must be supports, contradicts, or unaddressed`);
  }
  return value;
}

function evidenceObjects(value: unknown, label: string): readonly Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`${label}[${index}] must be an object`);
    }
    return entry;
  });
}

function parseEvidenceEnvelope(value: unknown): SparcLearnerResponseEvidenceEnvelope {
  if (!isRecord(value)) {
    throw new Error('SPARC dialogue scoring response must be an object');
  }
  const learningTargetEvaluations = evidenceObjects(
    value.learningTargetEvaluations,
    'SPARC dialogue scoring learningTargetEvaluations',
  ).map((entry) => ({
    clusterKC: exactEvidenceId(entry.clusterKC, 'SPARC dialogue scoring learning target clusterKC'),
    evidenceDirection: evidenceDirection(
      entry.evidenceDirection,
      `SPARC dialogue scoring learning target "${String(entry.clusterKC)}" evidenceDirection`,
    ),
    evidenceStrength: evidenceStrength(
      entry.evidenceStrength,
      `SPARC dialogue scoring learning target "${String(entry.clusterKC)}" evidenceStrength`,
    ),
  }));
  const diagnosticMisconceptionEvaluations = evidenceObjects(
    value.diagnosticMisconceptionEvaluations,
    'SPARC dialogue scoring diagnosticMisconceptionEvaluations',
  ).map((entry) => ({
    id: exactEvidenceId(entry.id, 'SPARC dialogue scoring diagnostic misconception id'),
    evidenceDirection: evidenceDirection(
      entry.evidenceDirection,
      `SPARC dialogue scoring diagnostic misconception "${String(entry.id)}" evidenceDirection`,
    ),
    evidenceStrength: evidenceStrength(
      entry.evidenceStrength,
      `SPARC dialogue scoring diagnostic misconception "${String(entry.id)}" evidenceStrength`,
    ),
  }));
  const contribution = isRecord(value.learnerContribution) ? value.learnerContribution : {};
  const contributionType = nonBlankString(contribution.type);
  if (!['answer', 'question', 'off-task', 'other'].includes(contributionType)) {
    throw new Error('SPARC dialogue scoring learnerContribution.type is invalid');
  }
  const learnerQuestion = isRecord(value.learnerQuestion) && typeof value.learnerQuestion.contentFocused === 'boolean'
    ? { contentFocused: value.learnerQuestion.contentFocused }
    : undefined;
  return {
    learningTargetEvaluations,
    diagnosticMisconceptionEvaluations,
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
  targetType: 'learningTarget | misconception | learnerQuestion | completion',
  targetId: 'string | null',
  selectedMove: 'pump | prompt | hint | assertion | question-scope-refusal | summary',
  tutorMessage: 'string',
});

function buildSparcUtteranceSystemPrompt(request: SparcUtteranceRequest): string {
  const moveDefinition = request.moveDefinition;
  const responseModifierPrompt = request.responseModifiers.flatMap((modifier) => [
    `Response modifier: ${modifier.moveDefinition.moveId}.`,
    modifier.moveDefinition.promptPolicy,
  ]);
  return [
    'Return JSON only. Do not wrap it in Markdown.',
    'Echo targetType, targetId, and selectedMove exactly as provided by the application.',
    'Do not expose internal ids, rule ids, rubric labels, scoring fields, or planner metadata in tutorMessage.',
    'Use only the authored lesson content and dialogue context supplied in the user message.',
    'Follow the selected runtime move policy.',
    'Acknowledgement boundary for every move: Usually begin with a brief acknowledgement of the learner\'s latest answer or the progress it shows. If there was no progress, acknowledge the answer neutrally before continuing. An acknowledgement confirms that the latest student answer was received; it does not agree with the answer or adopt the learner\'s claim as the tutor\'s own position. If you refer to learner content, explicitly attribute it to the learner. Do not use a fixed template or repeat the same opener across turns.',
    'Misconception boundary for every move: If the latest answer states or relies on a misconception, do not praise, endorse, validate, or describe that claim as correct, useful progress, close, or a good start. Acknowledge it neutrally, or give accurate corrective feedback when the selected move calls for feedback.',
    'Use earlier dialogue only as context; never mention content found only in an earlier response as though it were the latest contribution.',
    ...(responseModifierPrompt.length > 0 ? [
      'Apply the response modifiers within the selected move. When the selected move starts with an acknowledgement, use it once near the beginning, then apply each modifier, then complete the remainder of the selected move. Produce one coherent tutorMessage with one instructional question.',
      ...responseModifierPrompt,
    ] : []),
    `Selected move: ${moveDefinition.moveId}.`,
    'Move prompt:',
    moveDefinition.promptPolicy,
    'The JSON object must exactly follow this envelope shape:',
    JSON.stringify(SPARC_AUTOTUTOR_UTTERANCE_ENVELOPE_SCHEMA, null, 2),
  ].join('\n');
}

function buildSparcUtteranceUserPrompt(request: SparcUtteranceRequest): string {
  const targetContentLabel = request.targetType === 'misconception'
    ? 'Internal diagnostic target context (authored content; not necessarily the learner\'s expressed position):'
    : request.targetType === 'learnerQuestion'
      ? 'Learner-question routing context (application classification):'
      : 'Relevant authored target content:';
  return [
    'Problem statement:',
    request.problemStatement,
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
    'Response modifiers:',
    JSON.stringify(request.responseModifiers.map((modifier) => ({
      action: modifier.action,
      sourceRuleId: modifier.sourceRuleId ?? null,
      promptId: modifier.moveDefinition.promptId,
      promptVersion: modifier.moveDefinition.promptVersion,
    })), null, 2),
    '',
    'App-selected pedagogical state:',
    JSON.stringify(request.pedagogicalState ?? null, null, 2),
    '',
    targetContentLabel,
    JSON.stringify(request.targetContent ?? request.contentTexts, null, 2),
    '',
    'Current scored planner state:',
    JSON.stringify(request.plannerState ?? null, null, 2),
    '',
    'Full dialogue history:',
    JSON.stringify(request.dialogueHistory ?? [], null, 2),
    '',
    'Latest student answer (the primary source for any acknowledgement):',
    request.learnerText ?? '',
    '',
    'Latest learner contribution classification:',
    JSON.stringify(request.learnerContribution ?? null, null, 2),
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
  const scoreLearnerResponseWithEvidence = async ({
    display,
    learnerText,
    problemStatement,
    document,
    replayState,
  }: Parameters<SparcTrialDisplayDialogueTurnScorer>[0]): Promise<SparcDialogueLearnerResponseEvaluation> => {
    const runtimeFacts = buildSparcWorkingMemoryFacts({ document, replayState });
    const learningTargets = targetSummaries(display);
    const misconceptions = misconceptionSummaries(display);
    const result = await callResolvedOpenRouterJson({
        tdfId: options.tdfId ?? null,
        temperature: 0,
        maxTokens: 1200,
        messages: [{
          role: 'system',
          content: [
            'You evaluate the learner’s accumulated instructional knowledge across the full dialogue through the latest response.',
            'Return only JSON matching the schema. Compare meanings, not keyword overlap.',
            '',
            'Apply these steps in order:',
            '1. Classify the latest contribution. Use "answer" for an ordinary answer or explanation. Use "off-task" only when the response is unrelated to both the problem and the immediately preceding tutor message. A response that addresses the problem or answers the tutor cannot be off-task. Use "other" only when no other type fits.',
            '2. Use "question" when the learner’s primary conversational action genuinely requests information or confirmation. Use "answer" when the learner primarily offers an interpretation or attempted answer, even if it is hesitant or phrased with question-like intonation. A confirmation-shaped contribution such as "Are you saying Y?" or "Do we compute Y?" may be either a question or an answer; classify its function in context and score its instructional meaning the same either way. Include learnerQuestion with contentFocused true for a substantive content question; use contentFocused false only for an off-topic, rude, lewd, illicit, or otherwise inappropriate question.',
            '3. Return exactly one learningTargetEvaluations entry for every supplied learning target and exactly one diagnosticMisconceptionEvaluations entry for every supplied misconception. Evaluate every proposition independently and copy every clusterKC and id exactly.',
            '4. Assess instructional evidence cumulatively from every learner-authored turn in dialogueHistory together with learnerText. Study the learner’s trajectory and improvement: combine distinct complementary learner statements across turns when they form one developing explanation, and give later clarification, worked application, or self-correction full weight. Do not average turns, sum per-turn scores, or increase coverage merely because the learner repeats the same meaning.',
            '5. Tutor turns provide context for references, prompts, and the instructional trajectory, but tutor hints, assertions, corrections, and summaries are never learner evidence. Credit an idea supplied by the tutor only when the learner later adopts, explains, applies, or correctly confirms it.',
            '6. For learning targets, return the cumulative semantic coverage the learner has demonstrated through the current turn. A later omission, short answer, or change of topic does not erase knowledge demonstrated in earlier learner turns.',
            '7. For misconceptions, return the learner’s resolved stance at the end of the dialogue. A later learner clarification or self-correction supersedes conflicting earlier learner evidence; do not reactivate a repaired misconception solely because an earlier turn supported it.',
            '8. Requiring an entry for every proposition does not make every proposition a candidate for support. Use unaddressed with evidenceStrength 0 when no learner-authored turn establishes a resolved stance on that proposition.',
            '',
            'Set evidenceDirection independently for each proposition:',
            '- supports: the learner’s accumulated, resolved account presents some of the proposition’s defining meaning, including a tentative account.',
            '- contradicts: the learner’s resolved account explicitly rejects, corrects, contrasts, or replaces the proposition with its correct opposite.',
            '- unaddressed: the learner’s own contributions establish no resolved stance on the proposition.',
            'Quoting, recalling, or asking about a proposition without adopting or rejecting it does not by itself support or contradict it. When the learner self-corrects, use the resolved final/current stance. If no current stance is resolved, use unaddressed rather than speculating about belief.',
            'For a proposition whose defining meaning is a relation, comparison, contrast, or direction, naming only one side or participant is not support. Use supports only when the learner’s accumulated account represents the stated relation with the stated roles and direction; use contradicts when the resolved account represents the opposite relation or reverses the roles; otherwise use unaddressed.',
            '',
            'Use one continuous semantic-coverage rubric for evidenceStrength for both learning targets and misconceptions.',
            'evidenceStrength measures how much of the proposition’s defining meaning the learner explicitly represents across all learner-authored turns in the selected evidenceDirection.',
            '0 means the accumulated learner account represents none of the proposition in that direction; 0.25 means it represents a significant portion; 0.5 means it represents more than half; 0.75 means it represents most; 1 means it represents the entire defining meaning.',
            'These values are anchors on a continuous scale, not discrete categories. Select any value from 0 to 1 according to the proportion represented in the selected direction.',
            'supports and contradicts require evidenceStrength greater than 0. unaddressed requires evidenceStrength 0.',
            'For supports, larger strength means more of the proposition is endorsed. For contradicts, larger strength means more of the proposition is explicitly rejected or replaced.',
            'evidenceDirection determines whether the resolved evidence supports or contradicts the proposition. evidenceStrength is cumulative semantic coverage, not confidence or the size of the learner’s improvement.',
            '',
            'Resolve references using the problem statement and dialogue history, but do not silently switch the object the learner is discussing.',
            'For misconceptions, count only defining meaning the learner retains in the resolved account at the end of the dialogue. Do not infer support from topical similarity, shared vocabulary, shared numbers, or what the learner might privately believe.',
            'Do not speculate about what the learner is thinking. This is an evidentiary evaluation of what the learner expressed.',
            'A bare number or calculation supports a misconception only when it unambiguously instantiates that misconception in context. A bare number or calculation contradicts a misconception when it unambiguously instantiates the correct alternative in context; otherwise it leaves that misconception unaddressed.',
            'Judge the learner’s stance toward a misconception, not whether its words appear. Mentioning an incorrect idea while negating or contrasting it is contradiction, not support. Example: "Unlike X, the correct rule is Y" contradicts X; use a larger evidenceStrength when more of X is explicitly rejected or replaced.',
            'If the latest contribution is off-task, classify it as off-task and do not use that response as new instructional evidence. Still evaluate prior learner-authored turns cumulatively; tutor-authored text remains context only.',
          ].join('\n'),
        }, {
          role: 'user',
          content: JSON.stringify({
            problemStatement,
            learningTargets,
            misconceptions,
            dialogueHistory: buildSparcDialogueHistory(runtimeFacts),
            learnerText,
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
    options.onLearnerResponseScoringTrace?.({
      stage: 'provider-response',
      parsedContent: result.parsedContent,
    });
    const evidenceEnvelope = parseEvidenceEnvelope(result.parsedContent);
    options.onLearnerResponseScoringTrace?.({
      stage: 'evidence-parsed',
      evidenceEnvelope,
    });
    const evaluation = {
      evidenceEnvelope,
      learnerResponseScore: reduceSparcLearnerResponseEvidence({
        facts: runtimeFacts,
        evidence: evidenceEnvelope,
      }),
    };
    options.onLearnerResponseScoringTrace?.({
      stage: 'evaluation-completed',
      evaluation,
    });
    return evaluation;
  };
  return {
    async scoreLearnerResponse(params) {
      const evaluation = await scoreLearnerResponseWithEvidence(params);
      return evaluation.learnerResponseScore;
    },

    async generateTutorUtterance(request) {
      const result = await callResolvedOpenRouterJson({
        tdfId: options.tdfId ?? null,
        temperature: 0.15,
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
