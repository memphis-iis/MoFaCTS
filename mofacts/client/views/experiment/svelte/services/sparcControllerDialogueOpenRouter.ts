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
import {
  buildSparcBadAnswerBagText,
  buildSparcGoodAnswerBagText,
  scoreSparcBagMatch,
  type SparcBagMatchScore,
} from '../../../../../../learning-components/units/sparcsession/sparcBagMatchScoring';

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

type CallResolvedOpenRouterEmbeddings = (params: {
  readonly tdfId?: string | null;
  readonly model: string;
  readonly input: readonly string[];
  readonly telemetry?: Record<string, unknown>;
}) => Promise<{
  readonly embeddings: readonly (readonly number[])[];
  readonly model?: string;
  readonly source?: string;
  readonly costUsd?: number;
}>;

export type SparcDialogueOpenRouterProviderOptions = {
  readonly tdfId?: string | null;
  readonly callResolvedOpenRouterJson?: CallResolvedOpenRouterJson;
  readonly callResolvedOpenRouterEmbeddings?: CallResolvedOpenRouterEmbeddings;
};

export const SPARC_DIALOGUE_BAG_MATCH_EMBEDDING_MODEL = 'google/gemini-embedding-001';

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
  required: ['learningTargetScores', 'answerQuality', 'learnerContribution'],
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
  required: ['targetType', 'selectedMove', 'tutorMessage'],
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

async function scoreCurrentTurnBagMatches(params: {
  readonly display: SparcTrialDisplay;
  readonly learnerText: string;
  readonly tdfId?: string | null;
  readonly callResolvedOpenRouterEmbeddings?: CallResolvedOpenRouterEmbeddings;
}): Promise<readonly SparcBagMatchScore[]> {
  const learnerText = nonBlankString(params.learnerText);
  if (!learnerText || !params.callResolvedOpenRouterEmbeddings) {
    return [];
  }
  const goodBagText = buildSparcGoodAnswerBagText(targetSummaries(params.display));
  const badBagText = buildSparcBadAnswerBagText(misconceptionSummaries(params.display));
  const bagInputs = [
    ...(goodBagText ? [{ kind: 'goodAnswer' as const, text: goodBagText }] : []),
    ...(badBagText ? [{ kind: 'badAnswer' as const, text: badBagText }] : []),
  ];
  if (bagInputs.length === 0) {
    return [];
  }
  const input = [
    ...bagInputs.map((entry) => entry.text),
    learnerText,
  ];
  const result = await params.callResolvedOpenRouterEmbeddings({
    tdfId: params.tdfId ?? null,
    model: SPARC_DIALOGUE_BAG_MATCH_EMBEDDING_MODEL,
    input,
    telemetry: {
      surface: 'sparc-dialogue-runtime',
      operation: 'score-current-turn-bag-match',
      componentId: 'mofacts.sparc-session-unit',
      unitType: 'sparcsession',
    },
  });
  if (result.embeddings.length !== input.length) {
    throw new Error('SPARC dialogue bag-match embedding response count did not match input count');
  }
  const learnerEmbedding = result.embeddings[result.embeddings.length - 1]!;
  return bagInputs.map((entry, index) => scoreSparcBagMatch({
    kind: entry.kind,
    bagText: entry.text,
    bagEmbedding: result.embeddings[index]!,
    learnerEmbedding,
    model: result.model ?? SPARC_DIALOGUE_BAG_MATCH_EMBEDDING_MODEL,
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
    answerQuality,
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
    'You are the MoFaCTS AutoTutor tutor voice for one learner.',
    'The application has already selected the tutorial target and dialogue move. You must not change them.',
    'Echo the selected targetType, targetId, and selectedMove exactly. If targetId is null, return null; do not invent a script ID or lesson ID.',
    'The targetType, targetId, selectedMove, expectation IDs, misconception IDs, rubric labels, scoring fields, and planner state are internal application metadata. Never mention them in tutorMessage.',
    'When referring to prior learner progress or the next focus, use only regular English concepts from the visible dialogue, the learner’s own words, and the authored lesson content. Translate internal targets into plain lesson language before speaking.',
    'Use only the authored AutoTutor lesson content and the supplied dialogue context. For out-of-scope learner questions, state that this tutor can only answer from the lesson content, then continue with the selected move.',
    `Move definition: ${moveDefinition.moveId} ${moveDefinition.version}.`,
    `Prompt contract: ${moveDefinition.promptId} ${moveDefinition.promptVersion}.`,
    `Output schema contract: ${moveDefinition.outputSchemaId} ${moveDefinition.outputSchemaVersion}.`,
    `Renderer contract: ${moveDefinition.renderer}.`,
    'Move-specific prompt policy:',
    moveDefinition.promptPolicy,
    'Use the selected move policy to decide whether the tutorMessage should ask a follow-up question. Do not add a generic follow-up when the selected policy does not call for one.',
    'When the learner has made progress on or covered a prior expectation, briefly acknowledge that progress only when it supports the selected move policy.',
    'Use learnerContribution metadata to shape tone without changing the selected plan. For idk or help_request, be supportive and give the selected hint, prompt, or assertion. For uncertainty, validate the tentative attempt briefly before continuing. For affect, briefly acknowledge the feeling without analyzing it, then continue the selected instructional move. For meta, answer the procedural concern briefly if possible, then resume the selected instructional move. For off_task, redirect briefly into the selected move without scolding.',
    'The user prompt includes transition metadata. When targetChanged is true, begin tutorMessage with a brief acknowledgement of the learner contribution or repaired understanding that allowed the transition, then name the new focus before asking the next hint, prompt, pump, or correction.',
    'Use the full dialogue history to avoid repeating failed attempts. When a hint, prompt, assertion, or correction has not helped the learner make progress, take a new pathway or perspective toward the unspoken expectation or unresolved misconception.',
    'If the latest learner answer is abusive, profane, hostile, playful, or otherwise off-task, do not scold or analyze the behavior. Re-prompt from a new angle for the app-selected target and move.',
    'Correction moves include an app-selected correctionStage. Treat the authored repairQuestion as the repair goal, not as a required verbatim line.',
    'For correctionStage "hint", give a light cue that helps the learner notice why the misconception may not work, then ask a short question from a fresh angle.',
    'For correctionStage "prompt", ask a targeted question that helps the learner explain why the misconception is wrong. Do not repeat the previous correction question verbatim.',
    'For correctionStage "assertion", state exactly how the misconception is wrong and ask the learner to restate or apply the repair in their own words.',
    'If the same misconception remains active across turns, continue the repair from the selected correctionStage and full dialogue history. Never ask the identical repair question twice in a row.',
    'Keep the tutor message concise, conversational, and addressed to the student.',
    'Return JSON only. Do not wrap it in Markdown. The JSON object must exactly follow this envelope shape:',
    JSON.stringify(SPARC_AUTOTUTOR_UTTERANCE_ENVELOPE_SCHEMA, null, 2),
  ].join('\n');
}

function correctionStageGuidance(request: SparcUtteranceRequest): string {
  const correctionStage = nonBlankString(request.selectedAction.correctionStage);
  if (request.targetType !== 'misconception' || !correctionStage) {
    return 'No correction-stage guidance applies.';
  }
  if (correctionStage === 'hint') {
    return 'Use a misconception repair hint. Point to the contrast the learner should notice, but do not fully state the repair yet. Ask a brief follow-up question that is not just the authored repairQuestion copied verbatim.';
  }
  if (correctionStage === 'prompt') {
    return 'Use a misconception repair prompt. Ask the learner to make the key contrast explicitly. If this misconception was already prompted earlier, change the wording and angle rather than repeating the same question.';
  }
  return 'Use a misconception repair assertion. State the correct distinction directly, then ask the learner to restate or apply it. Do not merely ask the authored repairQuestion again.';
}

function buildSparcUtteranceUserPrompt(request: SparcUtteranceRequest): string {
  return [
    'Latest student answer:',
    request.learnerText ?? '',
    '',
    'Learner contribution classification:',
    JSON.stringify(request.learnerContribution ?? null, null, 2),
    '',
    'App-selected plan. Echo targetType, targetId, and selectedMove exactly in the response. Use correctionStage when present:',
    JSON.stringify({
      targetType: request.targetType,
      targetId: request.targetId || null,
      selectedMove: request.action,
      correctionStage: request.selectedAction.correctionStage ?? null,
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
    'App-selected pedagogical state. For learner questions, questionScope and answerableFromAuthoredContent are already decided by the application before this utterance is generated:',
    JSON.stringify(request.pedagogicalState ?? null, null, 2),
    '',
    'Correction-stage guidance:',
    correctionStageGuidance(request),
    '',
    'Transition metadata. If targetChanged is true, begin tutorMessage with a brief acknowledgement of the learner contribution or repaired understanding that allowed the transition, then name the new focus before asking the selected move:',
    JSON.stringify(request.transitionMetadata ?? null, null, 2),
    '',
    'Tutor-message boundary: do not expose IDs or internal labels from the app-selected plan, transition metadata, scored planner state, or authored script. Talk about the underlying lesson idea in ordinary English.',
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

function defaultCallResolvedOpenRouterEmbeddings(): CallResolvedOpenRouterEmbeddings | undefined {
  const meteor = (globalThis as typeof globalThis & {
    Meteor?: { callAsync?: (name: string, ...args: unknown[]) => Promise<unknown> };
  }).Meteor;
  if (typeof meteor?.callAsync !== 'function') {
    return undefined;
  }
  return (params) => meteor.callAsync(
    'callResolvedOpenRouterEmbeddings',
    params,
  ) as Promise<{
    readonly embeddings: readonly (readonly number[])[];
    readonly model?: string;
    readonly source?: string;
    readonly costUsd?: number;
  }>;
}

export function createSparcDialogueOpenRouterProvider(
  options: SparcDialogueOpenRouterProviderOptions,
): {
  readonly scoreLearnerResponse: SparcTrialDisplayDialogueTurnScorer;
  readonly generateTutorUtterance: SparcUtteranceGenerator;
} {
  const callResolvedOpenRouterJson = options.callResolvedOpenRouterJson ?? defaultCallResolvedOpenRouterJson;
  const callResolvedOpenRouterEmbeddings = options.callResolvedOpenRouterEmbeddings ?? defaultCallResolvedOpenRouterEmbeddings();
  return {
    async scoreLearnerResponse({ display, learnerText }) {
      const [result, bagMatchScores] = await Promise.all([
        callResolvedOpenRouterJson({
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
              'Use learnerContribution.type "assertion" for ordinary learner answers or explanations.',
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
            missingContentMessage: 'OpenRouter SPARC dialogue scoring response did not include message content.',
          },
          telemetry: {
            surface: 'sparc-dialogue-runtime',
            operation: 'score-learner-response',
            componentId: 'mofacts.sparc-session-unit',
            unitType: 'sparcsession',
          },
        }),
        scoreCurrentTurnBagMatches({
          display,
          learnerText,
          tdfId: options.tdfId ?? null,
          ...(callResolvedOpenRouterEmbeddings ? { callResolvedOpenRouterEmbeddings } : {}),
        }),
      ]);
      const score = parseScoreEnvelope(result.parsedContent);
      return {
        ...score,
        ...(bagMatchScores.length > 0 ? { bagMatchScores } : {}),
      };
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
