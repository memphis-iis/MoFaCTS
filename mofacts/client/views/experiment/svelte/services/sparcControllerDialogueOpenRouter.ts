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
import {
  buildSparcDialogueHistory,
  type SparcUtteranceRequest,
} from '../../../../../../learning-components/units/sparcsession/sparcUtteranceRequest';
import { buildSparcWorkingMemoryFacts } from '../../../../../../learning-components/units/sparcsession/sparcWorkingMemoryFacts';
import type { SparcWorkingMemoryFact } from '../../../../../../learning-components/units/sparcsession/sparcSessionContracts';

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
          supportStrength: { type: 'number' },
        },
        required: ['id', 'supportStrength'],
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
  required: ['learningTargetScores', 'diagnosticMisconceptionScores', 'learnerContribution'],
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

function displayFacts(display: SparcControllerDisplay): readonly Record<string, unknown>[] {
  return Array.isArray(display.workingMemoryFacts)
    ? display.workingMemoryFacts.filter(isRecord)
    : [];
}

function factSlot(fact: Record<string, unknown>, slotName: string): unknown {
  return isRecord(fact.slots) ? fact.slots[slotName] : undefined;
}

function scoreFacts(
  display: SparcControllerDisplay,
  runtimeFacts?: readonly SparcWorkingMemoryFact[],
): readonly Readonly<Record<string, unknown>>[] {
  return runtimeFacts ?? displayFacts(display);
}

function priorCoverageByClusterKC(
  display: SparcControllerDisplay,
  runtimeFacts?: readonly SparcWorkingMemoryFact[],
): Map<string, number> {
  const coverage = new Map<string, number>();
  for (const fact of scoreFacts(display, runtimeFacts)) {
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

function priorMisconceptionSupportStrengthById(
  display: SparcControllerDisplay,
  runtimeFacts?: readonly SparcWorkingMemoryFact[],
): Map<string, number> {
  const supportStrength = new Map<string, number>();
  for (const fact of scoreFacts(display, runtimeFacts)) {
    if (fact.factType !== 'diagnostic.misconceptionScore') {
      continue;
    }
    const id = nonBlankString(factSlot(fact, 'id'));
    if (!id) {
      continue;
    }
    supportStrength.set(id, unitScore(factSlot(fact, 'supportStrength'), `SPARC prior misconception supportStrength for "${id}"`));
  }
  return supportStrength;
}

function targetSummaries(
  display: SparcControllerDisplay,
  runtimeFacts?: readonly SparcWorkingMemoryFact[],
): readonly Record<string, unknown>[] {
  const priorCoverage = priorCoverageByClusterKC(display, runtimeFacts);
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

function misconceptionSummaries(
  display: SparcControllerDisplay,
  runtimeFacts?: readonly SparcWorkingMemoryFact[],
): readonly Record<string, unknown>[] {
  const priorSupportStrength = priorMisconceptionSupportStrengthById(display, runtimeFacts);
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
        priorSupportStrength: priorSupportStrength.get(id) ?? 0,
      };
    });
}

function assertUniqueKnownScoreIds(params: {
  readonly values: readonly string[];
  readonly allowedValues: ReadonlySet<string>;
  readonly label: string;
}): void {
  const seen = new Set<string>();
  for (const value of params.values) {
    if (!params.allowedValues.has(value)) {
      throw new Error(`SPARC dialogue scoring returned unknown ${params.label} "${value}"`);
    }
    if (seen.has(value)) {
      throw new Error(`SPARC dialogue scoring returned duplicate ${params.label} "${value}"`);
    }
    seen.add(value);
  }
}

function parseScoreEnvelope(value: unknown, context: {
  readonly learningTargetIds: ReadonlySet<string>;
  readonly misconceptionIds: ReadonlySet<string>;
  readonly priorCoverageById: ReadonlyMap<string, number>;
  readonly priorSupportStrengthById: ReadonlyMap<string, number>;
}): SparcLearnerResponseScoringResult {
  if (!isRecord(value)) {
    throw new Error('SPARC dialogue scoring response must be an object');
  }
  const suppliedLearningTargetScores = (Array.isArray(value.learningTargetScores) ? value.learningTargetScores : [])
    .filter(isRecord)
    .map((entry) => ({
      clusterKC: nonBlankString(entry.clusterKC),
      coverage: unitScore(entry.coverage, `SPARC dialogue score for "${String(entry.clusterKC)}"`),
    }))
    .filter((entry) => entry.clusterKC);
  const suppliedDiagnosticMisconceptionScores = (Array.isArray(value.diagnosticMisconceptionScores)
    ? value.diagnosticMisconceptionScores
    : [])
    .filter(isRecord)
    .map((entry) => ({
      id: nonBlankString(entry.id),
      supportStrength: unitScore(entry.supportStrength, `SPARC dialogue misconception supportStrength for "${String(entry.id)}"`),
    }))
    .filter((entry) => entry.id);
  const contribution = isRecord(value.learnerContribution) ? value.learnerContribution : {};
  const contributionType = nonBlankString(contribution.type);
  if (!['answer', 'question', 'off-task', 'other'].includes(contributionType)) {
    throw new Error('SPARC dialogue scoring learnerContribution.type is invalid');
  }
  const learnerQuestion = isRecord(value.learnerQuestion) && typeof value.learnerQuestion.contentFocused === 'boolean'
    ? { contentFocused: value.learnerQuestion.contentFocused }
    : undefined;
  if (contributionType === 'question' && !learnerQuestion) {
    throw new Error('SPARC dialogue scoring learnerQuestion is required when learnerContribution.type is question');
  }
  assertUniqueKnownScoreIds({
    values: suppliedLearningTargetScores.map((score) => score.clusterKC),
    allowedValues: context.learningTargetIds,
    label: 'learning target id',
  });
  assertUniqueKnownScoreIds({
    values: suppliedDiagnosticMisconceptionScores.map((score) => score.id),
    allowedValues: context.misconceptionIds,
    label: 'misconception id',
  });
  const learningTargetScores = suppliedLearningTargetScores
    .filter((score) => score.coverage > (context.priorCoverageById.get(score.clusterKC) ?? 0));
  const diagnosticMisconceptionScores = suppliedDiagnosticMisconceptionScores
    .filter((score) => context.priorSupportStrengthById.get(score.id) !== score.supportStrength);
  if (
    contributionType === 'off-task'
    && (learningTargetScores.length > 0 || diagnosticMisconceptionScores.length > 0)
  ) {
    throw new Error('SPARC dialogue scoring off-task contribution cannot update instructional targets');
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
    'The conversational receipt must acknowledge only the latest student answer. Ground its first clause in a phrase or construction from Latest student answer, or use a generic receipt when none is suitable. Use earlier dialogue only as context; never mention content found only in an earlier response as though it were the latest contribution.',
    ...(responseModifierPrompt.length > 0 ? [
      'Apply the response modifiers within the selected move. Use the selected move\'s conversational receipt once at the beginning, then apply each modifier, then complete the remainder of the selected move. Produce one coherent tutorMessage with one instructional question.',
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
    'Latest student answer (the only source for the conversational receipt):',
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
  return {
    async scoreLearnerResponse({ display, learnerText, problemStatement, document, replayState }) {
      const runtimeFacts = buildSparcWorkingMemoryFacts({ document, replayState });
      const learningTargets = targetSummaries(display, runtimeFacts);
      const misconceptions = misconceptionSummaries(display, runtimeFacts);
      const result = await callResolvedOpenRouterJson({
        tdfId: options.tdfId ?? null,
        temperature: 0,
        maxTokens: 1200,
        messages: [{
          role: 'system',
          content: [
            'You update a cumulative learner model from the latest learner response.',
            'Return only JSON matching the schema. Compare meanings, not keyword overlap.',
            '',
            'Apply these steps in order:',
            '1. Classify the latest contribution. Use "answer" for an ordinary answer or explanation. Use "off-task" only when the response is unrelated to both the problem and the immediately preceding tutor message. A response that addresses the problem or answers the tutor cannot be off-task. Use "other" only when no other type fits.',
            '2. Use "question" when the learner’s primary conversational action genuinely requests information or confirmation. Use "answer" when the learner primarily offers an interpretation or attempted answer, even if it is hesitant or phrased with question-like intonation. A confirmation-shaped contribution such as "Are you saying Y?" or "Do we compute Y?" may be either a question or an answer; classify its function in context and score its instructional meaning the same either way. Include learnerQuestion with contentFocused true for a substantive content question; use contentFocused false only for an off-topic, rude, lewd, illicit, or otherwise inappropriate question.',
            '3. Update learning-target coverage cumulatively. Treat priorCoverage as the highest coverage already demonstrated; never reduce it because of later shorthand, omission, or context-dependent restatement.',
            '4. For misconceptions, decide whether the latest response directly supports, is neutral toward, or repairs a misconception. Score only misconceptions whose propositions the learner explicitly states or uses. Do not treat every authored misconception as a required candidate, and do not infer support from topical similarity, shared vocabulary, or what the learner might privately believe. Omission and neutral content leave support strength unchanged. Explicitly rejecting, correcting, contrasting, or replacing the misconception with the correct opposite must lower support strength, using 0 when the repair is unambiguous.',
            'Do not speculate about what the learner is thinking. This is an evidentiary evaluation of what the learner expressed.',
            '5. Return only values changed by the latest response. Omit unchanged learning targets and misconceptions. Return an empty array when none changed. Copy every clusterKC and id exactly.',
            '',
            'Learning-target coverage is continuous from 0 to 1. Use these figurative anchors to locate the best value between them:',
            '0 means the response demonstrates none of the target proposition or explicitly contradicts it; 0.25 means the response identifies a relevant element but does not express the target relationship; 0.5 means it expresses the central relationship while an important element remains missing, ambiguous, or incorrect; 0.75 means the relationship and most essential elements are correct while a meaningful omission or ambiguity remains; 1 means the complete target proposition is expressed correctly with no essential element missing.',
            'Score each learning target independently. A concise but correct semantic paraphrase of a target deserves at least 0.8 even when the learner does not restate other already established ideas.',
            'When the learner explicitly describes the defining operation named by a target, such as repeated multiplication for a multiplicative-growth target, score that target at least 0.8.',
            'One response may update multiple learning targets and misconceptions. Resolve references using the problem statement and dialogue history, but do not silently switch the object the learner is discussing.',
            'For learning targets, compare the learner’s meaning with learningTargets[i].text and return the updated cumulative value in coverage.',
            'Misconception support strength is continuous from 0 to 1. Use these figurative anchors to locate the best value between them. If the latest response does not address a misconception, omit it and preserve its prior support strength.',
            '0 means the learner explicitly rejects, corrects, or replaces the misconception; 0.25 means the learner explicitly states an element associated with the misconception but does not state or rely on its central incorrect relationship; 0.5 means the learner explicitly states the central incorrect relationship but hedges, qualifies, or otherwise makes their commitment unclear; 0.75 means the learner clearly states or relies on the complete misconception once; 1 means the learner clearly states or relies on the complete misconception and repeats, defends, or continues using it after challenge or correction.',
            'When the learner explicitly states a rule that matches a misconception, treat it as direct endorsement even when they state it hesitantly or to defend, explain, or preserve consistency with an earlier answer. A surrounding comment about what would otherwise make sense does not negate the explicitly stated rule.',
            'A bare number or calculation supports a misconception only when the calculation itself unambiguously instantiates that misconception.',
            'Judge the learner’s stance toward the misconception, not whether its words appear. Mentioning an incorrect idea while negating or contrasting it is evidence against that misconception. Example: "Unlike X, the correct rule is Y" rejects X and should set an unambiguously repaired X to support strength 0.',
            'Never return target updates for an off-task contribution.',
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
      return parseScoreEnvelope(result.parsedContent, {
        learningTargetIds: new Set(learningTargets.map((target) => String(target.clusterKC))),
        misconceptionIds: new Set(misconceptions.map((misconception) => String(misconception.id))),
        priorCoverageById: new Map(learningTargets.map((target) => [
          String(target.clusterKC),
          Number(target.priorCoverage),
        ])),
        priorSupportStrengthById: new Map(misconceptions.map((misconception) => [
          String(misconception.id),
          Number(misconception.priorSupportStrength),
        ])),
      });
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
