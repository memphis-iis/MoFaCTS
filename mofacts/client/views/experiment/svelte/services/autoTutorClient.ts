import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import {
  AUTO_TUTOR_SCORE_ENVELOPE_SCHEMA,
  AUTO_TUTOR_UTTERANCE_ENVELOPE_SCHEMA,
  parseAutoTutorScoreEnvelope,
  parseAutoTutorUtteranceEnvelope,
  type AutoTutorUtteranceEnvelope,
} from '../../../../../common/lib/autoTutorContract';
import {
  type AutoTutorPlan,
} from '../../../../../common/lib/autoTutorPlanner';
import { getStimCluster } from '../../../../lib/runtimeStimuli';
import { clientConsole } from '../../../../lib/clientLogger';
import { insertCompressedHistory } from '../../../../lib/historyWire';
import { meteorCallAsync } from '../../../../lib/meteorAsync';
import {
  type OpenRouterEmbeddingResult,
  type OpenRouterJsonSchema,
} from '../../../../lib/openRouterClient';
import { extractJsonObject } from '../../../../lib/jsonExtraction';
import {
  computeAutoTutorRelationshipCacheKey,
  generateAutoTutorExpectationRelationships,
} from '../../../../lib/autoTutorRelationshipEngine';
import { legacyTrim } from '../../../../../common/underscoreCompat';
import type {
  AutoTutorCanonicalHistoryRecord,
  AutoTutorHistoryTurn,
  AutoTutorRuntimeCapabilities,
} from '../../../../../../learning-components/units/autotutor/AutoTutorRuntimeCapabilities';
import {
  readAutoTutorConfigWithOptions,
  validateGraduationAgainstScript,
  type AutoTutorConfig,
} from '../../../../../../learning-components/units/autotutor/AutoTutorRuntimeConfig';
import {
  getAutoTutorHistoryAction,
  type AutoTutorEndReason,
} from '../../../../../../learning-components/units/autotutor/AutoTutorEndState';
import {
  AUTO_TUTOR_SCORING_TEMPERATURE,
} from '../../../../../../learning-components/units/autotutor/AutoTutorGenerationConfig';
import {
  type AutoTutorHistoryRow,
} from '../../../../../../learning-components/units/autotutor/AutoTutorSavedHistory';
import {
  AUTO_TUTOR_COST_CAP_MESSAGE,
  addAutoTutorUtteranceToTurn,
  applyAutoTutorCostCap,
  applySavedAutoTutorHistory,
  buildAutoTutorHistoryNote,
  buildAutoTutorPublishState,
  computeAutoTutorProgress,
  computeAutoTutorProgressCounts,
  createInitialAutoTutorState,
  getAutoTutorScoreableExpectationIds,
  isAutoTutorCostCapReached,
  markAutoTutorErrored,
  markAutoTutorHistoryWritten,
  markAutoTutorStatePublished,
  scoreAndPlanAutoTutorTurn,
  summarizeAutoTutorState,
  transitionAutoTutorOperationalPhase,
  validateAutoTutorLearnerInput,
  type AutoTutorProgressCounts,
  type AutoTutorState,
} from '../../../../../../learning-components/units/autotutor/AutoTutorStateMachine';

export type AutoTutorRuntime = {
  config: AutoTutorConfig;
  getState: () => AutoTutorState;
  getProgress: () => number;
  getProgressCounts: () => AutoTutorProgressCounts;
  getDialogue: () => AutoTutorState['dialogue'];
  submitStudentAnswer: (studentAnswer: string) => Promise<{
    message: string;
    completed: boolean;
    mastered: boolean;
    endReason: AutoTutorEndReason;
    stoppedByCost: boolean;
  }>;
};

const AUTO_TUTOR_SCORE_JSON_SCHEMA: OpenRouterJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    expectationScores: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        additionalProperties: true,
        properties: {
          current: { type: 'boolean' },
          coverage: { type: 'number' },
          evidence: { type: 'string' },
          missing: { type: 'array', items: { type: 'string' } },
          tutoredByAssertion: { type: 'boolean' },
          learnerRestatedAfterAssertion: { type: 'boolean' },
        },
        required: ['current', 'coverage'],
      },
    },
    misconceptionScores: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        additionalProperties: true,
        properties: {
          current: { type: 'boolean' },
          confidence: { type: 'number' },
          evidence: { type: 'string' },
          repaired: { type: 'boolean' },
          repairEvidence: { type: 'string' },
        },
        required: ['current', 'confidence'],
      },
    },
    answerQuality: { type: 'string', enum: ['low', 'partial', 'high'] },
    learnerContribution: {
      type: 'object',
      additionalProperties: true,
      properties: {
        type: { type: 'string', enum: ['assertion', 'idk', 'help_request', 'uncertainty', 'affect', 'meta', 'question', 'off_task'] },
        confidence: { type: 'number' },
        evidence: { type: 'string' },
      },
      required: ['type', 'confidence'],
    },
    learnerQuestion: {
      type: 'object',
      additionalProperties: true,
      properties: {
        current: { type: 'boolean' },
        answerableFromAuthoredContent: { type: 'boolean' },
        evidence: { type: 'string' },
      },
      required: ['current', 'answerableFromAuthoredContent'],
    },
  },
  required: ['expectationScores', 'misconceptionScores', 'answerQuality', 'learnerContribution', 'learnerQuestion'],
};

const AUTO_TUTOR_UTTERANCE_JSON_SCHEMA: OpenRouterJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    targetType: { type: 'string', enum: ['expectation', 'misconception', 'learner_question', 'completion'] },
    targetId: { type: ['string', 'null'] },
    selectedMove: {
      type: 'string',
      enum: ['feedback', 'pump', 'hint', 'prompt', 'assertion', 'correction', 'answer_question', 'question_prompt', 'final_answer_prompt', 'summary'],
    },
    tutorMessage: { type: 'string' },
  },
  required: ['targetType', 'selectedMove', 'tutorMessage'],
};

function createMeteorAutoTutorRuntimeCapabilities(): AutoTutorRuntimeCapabilities {
  const capabilities: AutoTutorRuntimeCapabilities = {
    session: {
      getSessionValue(key: string) {
        return Session.get(key);
      },
      setSessionValue(key: string, value: unknown) {
        Session.set(key, value);
      },
      getAutoTutorSessionSnapshot() {
        const meteorUser = Meteor.user() as { username?: string; loginParams?: { entryPoint?: string } } | null;
        const currentUserId = Meteor.userId();
        const currentTdfId = requiredString(Session.get('currentTdfId'), 'currentTdfId');
        const currentTdfName = requiredString(Session.get('currentTdfName'), 'currentTdfName');
        const currentUnitNumber = Number(Session.get('currentUnitNumber'));
        if (!Number.isInteger(currentUnitNumber) || currentUnitNumber < 0) {
          throw new Error('AutoTutor runtime requires currentUnitNumber to be a non-negative integer');
        }
        return {
          ...(currentUserId ? { currentUserId } : {}),
          ...(meteorUser?.username ? { currentUsername: meteorUser.username } : {}),
          currentTdfId,
          currentTdfName,
          currentUnitNumber,
          currentTdfFile: Session.get('currentTdfFile'),
          currentTdfUnit: Session.get('currentTdfUnit'),
          sectionId: Session.get('curSectionId'),
          teacherId: Session.get('curTeacher')?._id,
          conditionName: Session.get('experimentXCond') || null,
          entryPoint: meteorUser?.loginParams?.entryPoint,
        };
      },
      publishAutoTutorState(state: unknown) {
        Session.set('autoTutorState', state);
      },
    },
    serverMethods: {
      async getAutoTutorHistoryForUnit(userId: string, tdfId: string, unitNumber: number) {
        return await meteorCallAsync('getAutoTutorHistoryForUnit', userId, tdfId, unitNumber) as unknown[];
      },
      async getPreferredOpenRouterApiKey() {
        const snapshot = capabilities.session.getAutoTutorSessionSnapshot();
        const capability = await meteorCallAsync('getOpenRouterCapability', snapshot.currentTdfId) as { configured?: unknown } | null;
        return capability?.configured ? '__server_resolved_openrouter__' : null;
      },
    },
    stimuli: {
      getStimCluster(clusterIndex: number) {
        return getStimCluster(clusterIndex) as { clusterKC?: unknown; stims?: unknown[] } | null;
      },
    },
    history: {
      normalizeResult(result: unknown) {
        return result as AutoTutorHistoryTurn;
      },
      async writeResult(result: AutoTutorHistoryTurn) {
        await this.writeAutoTutorTurn(result);
      },
      async writeAutoTutorTurn(turn: AutoTutorHistoryTurn) {
        await insertAutoTutorHistoryTurn(turn.config as AutoTutorConfig, turn.state as AutoTutorState, {
          capabilities,
          studentAnswer: turn.studentAnswer,
          tutorMessage: turn.tutorMessage,
          turnStartedAt: turn.startedAt,
          turnEndedAt: turn.endedAt,
        });
      },
      async writeCanonicalHistory(record: AutoTutorCanonicalHistoryRecord) {
        await insertCompressedHistory(record);
      },
    },
    aiProvider: {
      async callOpenRouterJson(options) {
        const snapshot = capabilities.session.getAutoTutorSessionSnapshot();
        const serverResult = await meteorCallAsync('callResolvedOpenRouterJson', {
          tdfId: snapshot.currentTdfId,
          model: options.model,
          messages: options.messages,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          requireUsageCost: options.requireUsageCost,
          telemetry: options.telemetry,
          intent: {
            title: options.intent.title,
            schemaName: options.intent.schemaName,
            schema: options.intent.schema,
            strictSchema: options.intent.strictSchema,
            missingContentMessage: options.intent.missingContentMessage,
          },
        }) as { rawContent: string; responseBody: unknown; costUsd?: number };
        const value = options.intent.parse(extractJsonObject(serverResult.rawContent));
        return {
          value,
          rawContent: serverResult.rawContent,
          responseBody: serverResult.responseBody,
          ...(serverResult.costUsd !== undefined ? { costUsd: serverResult.costUsd } : {}),
        };
      },
    },
    logger: {
      log(level: number, ...args: unknown[]) {
        clientConsole(level, '[AutoTutor]', ...args);
      },
    },
  };
  return capabilities;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`AutoTutor runtime requires ${field}`);
  }
  return value.trim();
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function isCompleteAutoTutorRelationshipGraph(config: AutoTutorConfig): boolean {
  const expectations = config.script.expectations;
  if (expectations.length < 2) {
    return true;
  }
  const graph = config.script.expectationRelationships;
  if (!graph || typeof graph !== 'object') {
    return false;
  }
  for (const source of expectations) {
    const relationships = graph[source.id];
    if (!relationships || typeof relationships !== 'object') {
      return false;
    }
    for (const target of expectations) {
      if (target.id === source.id) {
        continue;
      }
      const score = relationships[target.id];
      if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) {
        return false;
      }
    }
  }
  const provenance = config.script.expectationRelationshipProvenance;
  if (!provenance?.model || !provenance.cacheKey) {
    return false;
  }
  return provenance.cacheKey === computeAutoTutorRelationshipCacheKey(expectations, provenance.model);
}

async function ensureAutoTutorRelationshipGraph(
  capabilities: AutoTutorRuntimeCapabilities,
  config: AutoTutorConfig,
  preferredOpenRouterApiKey: string | null,
): Promise<void> {
  if (isCompleteAutoTutorRelationshipGraph(config)) {
    return;
  }
  const snapshot = capabilities.session.getAutoTutorSessionSnapshot();
  const capability = await meteorCallAsync('getOpenRouterCapability', snapshot.currentTdfId) as { source?: 'tdf' | 'user' | 'admin' } | null;
  const result = await generateAutoTutorExpectationRelationships(config.script, {
    apiKey: config.apiKey,
    sourceKeyType: capability?.source || (preferredOpenRouterApiKey ? 'user' : 'tdf'),
    callEmbeddings: async (model, input) => {
      return await meteorCallAsync('callResolvedOpenRouterEmbeddings', {
        tdfId: snapshot.currentTdfId,
        model,
        input,
        telemetry: {
          surface: 'autotutor-runtime',
          operation: 'autotutor-relationship-embedding',
          componentId: 'mofacts.autotutor-unit',
          unitType: 'autotutor',
        },
      }) as OpenRouterEmbeddingResult;
    },
  });
  config.script.expectationRelationships = result.expectationRelationships;
  config.script.expectationRelationshipProvenance = result.expectationRelationshipProvenance;

  await meteorCallAsync(
    'persistAutoTutorExpectationRelationships',
    snapshot.currentTdfId,
    config.clusterIndex,
    config.script.id,
    result.expectationRelationships,
    result.expectationRelationshipProvenance,
  );
}

function buildScoringSystemPrompt(config: AutoTutorConfig, scoreableExpectationIds: string[]): string {
  const frozenExpectationIds = config.script.expectations
    .map((expectation) => expectation.id)
    .filter((id) => !scoreableExpectationIds.includes(id));
  return [
    'You are the MoFaCTS AutoTutor semantic scorer for one learner.',
    'Score the latest learner answer against the authored AutoTutor script and role-preserving dialogue history.',
    'Only learner-generated text may count as expectation coverage. Tutor turns may provide context for short learner answers, but tutor hints, prompts, assertions, summaries, and corrections are not learner knowledge.',
    'If the latest learner answer is abusive, profane, hostile, playful, or otherwise off-task rather than a substantive content claim, ignore that behavior for semantic scoring: do not mark any expectation covered, do not mark or strengthen any misconception, and do not reduce previously demonstrated expectation coverage.',
    'Classify whether the learner asked a substantive question and whether it is answerable from the provided authored lesson content or dialogue context.',
    'Classify the latest learner contribution as exactly one learnerContribution.type: assertion, idk, help_request, uncertainty, affect, meta, question, or off_task. Use assertion for substantive content claims or restatements. Use idk for "I do not know" or equivalent. Use help_request for requests for help, hints, or the answer. Use uncertainty for tentative or low-confidence content attempts. Use affect for frustration, confidence, boredom, or emotional comments. Use meta for comments about the task, interface, rules, progress, or procedure. Use question for substantive content questions. Use off_task for playful, abusive, irrelevant, or non-instructional turns.',
    'Set learnerContribution.confidence from 0 to 1 and provide brief evidence.',
    'Always include learnerQuestion.current and learnerQuestion.answerableFromAuthoredContent as booleans. When learnerContribution.type is question, set learnerQuestion.current true and decide answerableFromAuthoredContent from the authored content and dialogue context. For non-question turns, set learnerQuestion.current false and learnerQuestion.answerableFromAuthoredContent false. For meta comments about procedure rather than lesson content, use learnerContribution.type meta and leave learnerQuestion.current false unless the learner also asks a substantive content question.',
    'Misconception repair is a first-class scoring decision. If the prior tutor state last selected a misconception target and the latest tutor turn asked its repair question or otherwise requested repair, score the latest learner answer first as a repair attempt for that misconception.',
    'A concise answer can repair a misconception when it directly answers the repair question or rejects the mistaken contrast, even if it does not cover a full expectation. For example, if the tutor asks whether an interval estimates individual scores or the population mean, "the population mean" repairs the individual-scores misconception.',
    'When scoring a repair answer, interpret pronouns and short phrases in the context of the tutor question and active repair context. Do not require the learner to restate every contrast perfectly if their answer substantially accepts the repair target.',
    'If an authored misconception includes repairCriteria or acceptableRepairAnswers, use those fields as the authoritative standard for whether the latest learner answer repaired that misconception.',
    'If the latest learner answer uses words such as it, they, them, each one, repetitions, or those intervals, resolve those words from the latest tutor repair question before judging misconception evidence.',
    'For confidence intervals, if the tutor asks about repeating the sampling and interval-construction process, an answer like "sometimes it would have the mean and sometimes not; 95% of the time, in the long run, it would have the mean" should repair the misconception that the fixed population mean has a 95% probability of lying in this one already-computed interval, because "it" refers to the repeated/new intervals in the asked context.',
    'For confidence intervals, if the tutor asks whether newly computed intervals would contain the true mean about 95% of the time, an answer like "they would always or never have the true mean because it is fixed; 95% of repetitions would have the true mean; each one is yes or no" repairs the specific-interval probability misconception. It may still be missing some expectation wording, but it should not keep that misconception active.',
    'When a latest repair answer is mostly right but slightly ambiguous, prefer lowering or clearing the active misconception and recording remaining missing expectation elements over keeping the misconception active from prior dialogue.',
    'If you keep a misconception active after a repair question, the misconception evidence must quote or tightly paraphrase the latest learner answer itself. Do not use wording from earlier learner turns as evidence that the latest answer still has the misconception.',
    'When the latest learner answer repairs a misconception, set that misconception to current false, confidence 0, repaired true, and explain the repair in repairEvidence. Do not carry forward a prior misconception solely because earlier dialogue showed it.',
    'For a previously repaired misconception, keep current false and confidence 0 unless the latest learner answer reintroduces that misconception. If it is reintroduced, set current true and repaired false.',
    'Assertion restatement is also a first-class scoring decision. If the prior tutor state shows an expectation was tutoredByAssertion and the latest tutor turn asked the learner to restate or apply that asserted idea, score the latest learner answer first as uptake of that expectation.',
    'A cooperative restatement or concrete application of the asserted idea counts as learner knowledge. When the latest learner answer adequately restates or applies the asserted expectation, set learnerRestatedAfterAssertion true and assign enough expectation coverage for that idea to count as learned, even if earlier learner attempts had low coverage.',
    'Do not let prior failures prevent a proper post-assertion restatement from counting. Prior dialogue may explain why the assertion was needed, but the latest learner answer is the fresh evidence for whether the asserted idea is now understood.',
    'Do not choose a dialogue target, choose a dialogue move, or write the tutor response.',
    'Return JSON only. Do not wrap it in Markdown. The JSON object must exactly follow this envelope shape:',
    JSON.stringify(AUTO_TUTOR_SCORE_ENVELOPE_SCHEMA, null, 2),
    scoreableExpectationIds.length > 0
      ? `Include exactly these expectation IDs under expectationScores on this turn: ${JSON.stringify(scoreableExpectationIds)}.`
      : 'Set expectationScores to an empty object on this turn.',
    frozenExpectationIds.length > 0
      ? `Do not include these already covered expectation IDs under expectationScores: ${JSON.stringify(frozenExpectationIds)}. The app will carry their prior scores forward unchanged.`
      : 'No authored expectations are frozen on this turn.',
    'Include every authored misconception ID under misconceptionScores on every turn.',
    'Do not invent expectation or misconception IDs.',
    'For every returned expectation score, always include current as a boolean and coverage as a number from 0 to 1. Set expectation coverage from 0 to 1, provide brief evidence, and include missing elements when coverage is incomplete.',
    'Set misconception confidence from 0 to 1.',
    'Do not return frontier, coherence, centrality, or priority. The app derives those planner values deterministically from learner coverage and the authored expectation relationship graph.',
    '',
    'Question prompt:',
    config.prompt,
    '',
    'Authored AutoTutor script:',
    JSON.stringify(config.script, null, 2),
  ].join('\n');
}

function getActiveRepairContext(config: AutoTutorConfig, state: AutoTutorState) {
  const lastTargetType = state.planner.lastSelectedTargetType;
  const lastTargetId = state.planner.lastSelectedTargetId;
  if (lastTargetType !== 'misconception' || !lastTargetId) {
    return null;
  }
  const misconception = (config.script.misconceptions || [])
    .find((entry) => entry.id === lastTargetId);
  if (!misconception) {
    return null;
  }
  const latestTutorTurn = [...state.dialogue].reverse()
    .find((turn) => turn.role === 'tutor');
  return {
    activeMisconceptionId: lastTargetId,
    latestTutorRepairQuestionOrPrompt: latestTutorTurn?.text || '',
    authoredRepairQuestion: misconception.repairQuestion,
    repairCriteria: misconception.repairCriteria || '',
    acceptableRepairAnswers: misconception.acceptableRepairAnswers || [],
  };
}

function buildScoringUserPrompt(config: AutoTutorConfig, studentAnswer: string, state: AutoTutorState, scoreableExpectationIds: string[]): string {
  return [
    'Latest student answer:',
    studentAnswer,
    '',
    'Expectation score scope. Score only these expectation IDs. Treat all other prior expectation scores as frozen context:',
    JSON.stringify(scoreableExpectationIds, null, 2),
    '',
    'Active repair context. If present, score the latest answer against this repair context before carrying forward prior misconception state:',
    JSON.stringify(getActiveRepairContext(config, state), null, 2),
    '',
    'Prior tutor state:',
    JSON.stringify(summarizeAutoTutorState(state), null, 2),
    '',
    'Full dialogue history:',
    JSON.stringify(state.dialogue, null, 2),
  ].join('\n');
}

function buildUtteranceSystemPrompt(config: AutoTutorConfig): string {
  return [
    'You are the MoFaCTS AutoTutor tutor voice for one learner.',
    'The application has already selected the tutorial target and dialogue move. You must not change them.',
    'Echo the selected targetType, targetId, and selectedMove exactly. If targetId is null, return null; do not invent a script ID or lesson ID.',
    'The targetType, targetId, selectedMove, expectation IDs, misconception IDs, rubric labels, scoring fields, and planner state are internal application metadata. Never mention them in tutorMessage.',
    'When referring to prior learner progress or the next focus, use only regular English concepts from the visible dialogue, the learner’s own words, and the authored lesson content. Translate internal targets into plain lesson language before speaking.',
    'Use only the authored AutoTutor lesson content and the supplied dialogue context. For out-of-scope learner questions, state that this tutor can only answer from the lesson content, then continue with the selected move.',
    'Every non-summary move must keep the dialogue going with a concrete follow-up question to the learner.',
    'When the learner has made progress on or covered a prior expectation, briefly acknowledge that progress before continuing.',
    'Use learnerContribution metadata to shape tone without changing the selected plan. For idk or help_request, be supportive and give the selected hint, prompt, or assertion. For uncertainty, validate the tentative attempt briefly before continuing. For affect, briefly acknowledge the feeling without analyzing it, then continue the selected instructional move. For meta, answer the procedural concern briefly if possible, then resume the selected instructional move. For off_task, redirect briefly into the selected move without scolding.',
    'The user prompt includes transition metadata. When targetChanged is true, begin tutorMessage with a brief acknowledgement of what the learner just contributed or repaired, then name the new focus before asking the next hint, prompt, pump, or correction.',
    'Use the full dialogue history to avoid repeating failed attempts. When a hint, prompt, assertion, or correction has not helped the learner make progress, take a new pathway or perspective toward the unspoken expectation or unresolved misconception.',
    'If the latest learner answer is abusive, profane, hostile, playful, or otherwise off-task, do not scold or analyze the behavior. Re-prompt from a new angle for the app-selected target and move.',
    'Correction moves include an app-selected correctionStage. Treat the authored repairQuestion as the repair goal, not as a required verbatim line.',
    'For correctionStage "hint", give a light cue that helps the learner notice why the misconception may not work, then ask a short question from a fresh angle.',
    'For correctionStage "prompt", ask a targeted question that helps the learner explain why the misconception is wrong. Do not repeat the previous correction question verbatim.',
    'For correctionStage "assertion", state exactly how the misconception is wrong and ask the learner to restate or apply the repair in their own words.',
    'If the same misconception remains active across turns, continue the repair from the selected correctionStage and full dialogue history. Never ask the identical repair question twice in a row.',
    'For assertion moves, supply the missing content briefly, then ask the learner to restate or apply that idea.',
    'Keep the tutor message concise, conversational, and addressed to the student.',
    'Return JSON only. Do not wrap it in Markdown. The JSON object must exactly follow this envelope shape:',
    JSON.stringify(AUTO_TUTOR_UTTERANCE_ENVELOPE_SCHEMA, null, 2),
    '',
    'Question prompt:',
    config.prompt,
    '',
    'Authored AutoTutor script:',
    JSON.stringify(config.script, null, 2),
  ].join('\n');
}

function buildCorrectionStageGuidance(plan: AutoTutorPlan): string {
  if (plan.target.type !== 'misconception' || !plan.correctionStage) {
    return 'No correction-stage guidance applies.';
  }
  if (plan.correctionStage === 'hint') {
    return 'Use a misconception repair hint. Point to the contrast the learner should notice, but do not fully state the repair yet. Ask a brief follow-up question that is not just the authored repairQuestion copied verbatim.';
  }
  if (plan.correctionStage === 'prompt') {
    return 'Use a misconception repair prompt. Ask the learner to make the key contrast explicitly. If this misconception was already prompted earlier, change the wording and angle rather than repeating the same question.';
  }
  return 'Use a misconception repair assertion. State the correct distinction directly, then ask the learner to restate or apply it. Do not merely ask the authored repairQuestion again.';
}

function getTargetContent(config: AutoTutorConfig, plan: AutoTutorPlan): unknown {
  if (plan.target.type === 'expectation') {
    return config.script.expectations.find((expectation) => expectation.id === plan.target.id);
  }
  if (plan.target.type === 'misconception') {
    return (config.script.misconceptions || []).find((misconception) => misconception.id === plan.target.id);
  }
  if (plan.target.type === 'completion') {
    return { summary: config.script.summary };
  }
  return { authoredContentBoundary: 'Answer only from the supplied lesson content and dialogue history.' };
}

function getPlanTransitionMetadata(state: AutoTutorState, plan: AutoTutorPlan) {
  const previousTargetType = state.planner.lastSelectedTargetType || null;
  const previousTargetId = state.planner.lastSelectedTargetId || null;
  const currentTargetType = plan.target.type;
  const currentTargetId = plan.target.id || null;
  const targetChanged = previousTargetType !== currentTargetType || previousTargetId !== currentTargetId;
  return {
    previousTargetType,
    previousTargetId,
    currentTargetType,
    currentTargetId,
    targetChanged,
  };
}

function buildUtteranceUserPrompt(config: AutoTutorConfig, studentAnswer: string, state: AutoTutorState, plan: AutoTutorPlan): string {
  const transition = getPlanTransitionMetadata(state, plan);
  return [
    'Latest student answer:',
    studentAnswer,
    '',
    'Learner contribution classification:',
    JSON.stringify(state.learnerContribution, null, 2),
    '',
    'App-selected plan. Echo targetType, targetId, and selectedMove exactly in the response. Use correctionStage when present:',
    JSON.stringify({
      targetType: plan.target.type,
      targetId: plan.target.id || null,
      selectedMove: plan.selectedMove,
      correctionStage: plan.correctionStage || null,
    }, null, 2),
    '',
    'App-selected pedagogical state. For learner questions, questionScope and answerableFromAuthoredContent are already decided by the application before this utterance is generated:',
    JSON.stringify(state.pedagogicalState, null, 2),
    '',
    'Correction-stage guidance:',
    buildCorrectionStageGuidance(plan),
    '',
    'Transition metadata. If targetChanged is true, begin tutorMessage with a brief acknowledgement of the learner contribution or repaired understanding that allowed the transition, then name the new focus before asking the selected move:',
    JSON.stringify(transition, null, 2),
    '',
    'Tutor-message boundary: do not expose IDs or internal labels from the app-selected plan, transition metadata, scored planner state, or authored script. Talk about the underlying lesson idea in ordinary English.',
    '',
    'Relevant authored target content:',
    JSON.stringify(getTargetContent(config, plan), null, 2),
    '',
    'Current scored planner state:',
    JSON.stringify(state.planner, null, 2),
    '',
    'Full dialogue history:',
    JSON.stringify(state.dialogue, null, 2),
  ].join('\n');
}

function validateUtteranceEnvelope(envelope: AutoTutorUtteranceEnvelope, plan: AutoTutorPlan): void {
  if (envelope.targetType !== plan.target.type) {
    throw new Error(`AutoTutor utterance response changed target type from "${plan.target.type}" to "${envelope.targetType}"`);
  }
  if ((envelope.targetId || undefined) !== (plan.target.id || undefined)) {
    throw new Error(`AutoTutor utterance response changed target ID from "${plan.target.id || ''}" to "${envelope.targetId || ''}"`);
  }
  if (envelope.selectedMove !== plan.selectedMove) {
    throw new Error(`AutoTutor utterance response changed selected move from "${plan.selectedMove}" to "${envelope.selectedMove}"`);
  }
}

async function callAutoTutorOpenRouter<T>(
  capabilities: AutoTutorRuntimeCapabilities,
  config: AutoTutorConfig,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  temperature: number,
  intent: {
    schemaName: string;
    schema: OpenRouterJsonSchema;
    parse: (value: unknown) => T;
    missingContentMessage: string;
  },
) {
  const result = await capabilities.aiProvider.callOpenRouterJson({
    apiKey: config.apiKey,
    model: config.model,
    messages,
    temperature,
    requireUsageCost: true,
    telemetry: {
      surface: 'autotutor-runtime',
      operation: intent.schemaName,
      componentId: 'mofacts.autotutor-unit',
      unitType: 'autotutor',
    },
    intent: {
      title: 'MoFaCTS AutoTutor',
      schemaName: intent.schemaName,
      schema: intent.schema,
      missingContentMessage: intent.missingContentMessage,
      parse: intent.parse,
    },
  });
  return result;
}

async function callOpenRouterScoring(
  capabilities: AutoTutorRuntimeCapabilities,
  config: AutoTutorConfig,
  state: AutoTutorState,
  studentAnswer: string,
  scoreableExpectationIds: string[],
) {
  const frozenExpectationIds = config.script.expectations
    .map((expectation) => expectation.id)
    .filter((id) => !scoreableExpectationIds.includes(id));
  return await callAutoTutorOpenRouter(capabilities, config, [
    { role: 'system', content: buildScoringSystemPrompt(config, scoreableExpectationIds) },
    { role: 'user', content: buildScoringUserPrompt(config, studentAnswer, state, scoreableExpectationIds) },
  ], AUTO_TUTOR_SCORING_TEMPERATURE, {
    schemaName: 'mofacts_autotutor_score',
    schema: AUTO_TUTOR_SCORE_JSON_SCHEMA,
    missingContentMessage: 'OpenRouter AutoTutor scoring response did not include message content.',
    parse(value) {
      return parseAutoTutorScoreEnvelope(value, {
        scoreableExpectationIds,
        frozenExpectationIds,
      });
    },
  });
}

async function callOpenRouterUtterance(
  capabilities: AutoTutorRuntimeCapabilities,
  config: AutoTutorConfig,
  state: AutoTutorState,
  studentAnswer: string,
  plan: AutoTutorPlan,
) {
  return await callAutoTutorOpenRouter(capabilities, config, [
    { role: 'system', content: buildUtteranceSystemPrompt(config) },
    { role: 'user', content: buildUtteranceUserPrompt(config, studentAnswer, state, plan) },
  ], config.utteranceTemperature, {
    schemaName: 'mofacts_autotutor_utterance',
    schema: AUTO_TUTOR_UTTERANCE_JSON_SCHEMA,
    missingContentMessage: 'OpenRouter AutoTutor utterance response did not include message content.',
    parse(value) {
      const envelope = parseAutoTutorUtteranceEnvelope(value);
      validateUtteranceEnvelope(envelope, plan);
      return envelope;
    },
  });
}

function publishState(capabilities: AutoTutorRuntimeCapabilities, state: AutoTutorState, config: AutoTutorConfig): void {
  capabilities.session.publishAutoTutorState(buildAutoTutorPublishState(state, config));
}

async function loadSavedAutoTutorHistory(capabilities: AutoTutorRuntimeCapabilities): Promise<AutoTutorHistoryRow[]> {
  const snapshot = capabilities.session.getAutoTutorSessionSnapshot();
  if (!snapshot.currentUserId) {
    throw new Error('AutoTutor resume requires current user, TDF id, and unit number');
  }
  return await capabilities.serverMethods.getAutoTutorHistoryForUnit(
    snapshot.currentUserId,
    snapshot.currentTdfId,
    snapshot.currentUnitNumber,
  ) as AutoTutorHistoryRow[];
}

async function insertAutoTutorHistoryTurn(config: AutoTutorConfig, state: AutoTutorState, args: {
  capabilities: AutoTutorRuntimeCapabilities;
  studentAnswer: string;
  tutorMessage: string;
  turnStartedAt: number;
  turnEndedAt: number;
}) {
  const snapshot = args.capabilities.session.getAutoTutorSessionSnapshot();
  const currentTdfFile = snapshot.currentTdfFile as {
    tdfs?: { tutor?: { unit?: unknown[] } };
  } | null | undefined;
  const tutor = currentTdfFile?.tdfs?.tutor;
  const unitNumber = snapshot.currentUnitNumber;
  const unit = (tutor?.unit?.[unitNumber] || {}) as { unitname?: unknown };
  const unitName = typeof unit?.unitname === 'string' ? unit.unitname : config.unitName;
  const cluster = args.capabilities.stimuli.getStimCluster(config.clusterIndex);
  const stim = (cluster?.stims?.[0] || {}) as { _id?: unknown; stimulusKC?: unknown };
  const sessionID = (new Date(args.turnStartedAt)).toUTCString().substr(0, 16) + ' ' + snapshot.currentTdfName;
  const note = buildAutoTutorHistoryNote(config, state, args.tutorMessage);

  const historyRecord: AutoTutorCanonicalHistoryRecord = {
    itemId: stim?._id || config.script.id,
    KCId: stim?.stimulusKC || config.script.id,
    userId: snapshot.currentUserId,
    TDFId: snapshot.currentTdfId,
    outcome: state.mastered ? 'correct' : 'incorrect',
    probabilityEstimate: null,
    typeOfResponse: 'autotutor-chat',
    responseValue: legacyTrim(args.studentAnswer),
    displayedStimulus: { text: config.prompt },
    sectionId: snapshot.sectionId,
    teacherId: snapshot.teacherId,
    anonStudentId: snapshot.currentUsername,
    sessionID,
    conditionNameA: 'tdf file',
    conditionTypeA: snapshot.currentTdfName,
    conditionNameB: 'xcondition',
    conditionTypeB: snapshot.conditionName || null,
    conditionNameC: 'schedule condition',
    conditionTypeC: null,
    conditionNameD: 'how answered',
    conditionTypeD: 'autotutor-chat',
    conditionNameE: 'section',
    conditionTypeE: snapshot.entryPoint && snapshot.entryPoint !== 'direct'
      ? snapshot.entryPoint
      : null,
    responseDuration: args.turnEndedAt - args.turnStartedAt,
    levelUnit: unitNumber,
    levelUnitName: unitName,
    levelUnitType: 'autotutor',
    problemName: config.prompt,
    stepName: config.script.id,
    time: args.turnEndedAt,
    problemStartTime: args.turnStartedAt,
    selection: 'autotutor-chat',
    action: getAutoTutorHistoryAction(state),
    input: legacyTrim(args.studentAnswer),
    studentResponseType: 'ATTEMPT',
    studentResponseSubtype: 'autotutor',
    tutorResponseType: state.completed ? 'RESULT' : 'HINT_MSG',
    KCDefault: stim?.stimulusKC || config.script.id,
    KCCategoryDefault: '',
    KCCluster: cluster?.clusterKC || config.script.topic,
    KCCategoryCluster: '',
    CFAudioInputEnabled: false,
    CFAudioOutputEnabled: false,
    CFDisplayOrder: state.turnCount,
    CFStimFileIndex: config.clusterIndex,
    CFSetShuffledIndex: config.clusterIndex,
    CFAlternateDisplayIndex: null,
    CFStimulusVersion: 0,
    CFCorrectAnswer: config.script.idealAnswer,
    CFOverlearning: false,
    CFResponseTime: args.turnEndedAt,
    CFStartLatency: 0,
    CFEndLatency: args.turnEndedAt - args.turnStartedAt,
    CFFeedbackLatency: 0,
    CFReviewEntry: '',
    CFButtonOrder: '',
    CFItemRemoved: false,
    CFNote: JSON.stringify(note),
    feedbackText: legacyTrim(args.tutorMessage),
    feedbackType: state.mastered ? 'correct' : (state.completed ? 'incorrect' : 'autotutor'),
    instructionQuestionResult: false,
    entryPoint: snapshot.entryPoint || '',
    eventType: 'autotutor-turn',
  };
  await args.capabilities.history.writeCanonicalHistory(historyRecord);
}

export async function createAutoTutorRuntime(
  capabilities: AutoTutorRuntimeCapabilities = createMeteorAutoTutorRuntimeCapabilities(),
): Promise<AutoTutorRuntime> {
  const preferredOpenRouterApiKey = capabilities.serverMethods.getPreferredOpenRouterApiKey
    ? await capabilities.serverMethods.getPreferredOpenRouterApiKey()
    : null;
  const config = readAutoTutorConfigWithOptions(capabilities, {
    preferredOpenRouterApiKey,
    allowServerResolvedOpenRouterApiKey: preferredOpenRouterApiKey === '__server_resolved_openrouter__',
  });
  await ensureAutoTutorRelationshipGraph(capabilities, config, preferredOpenRouterApiKey);
  validateGraduationAgainstScript(config);
  const state = createInitialAutoTutorState(config.script);
  applySavedAutoTutorHistory(config, state, await loadSavedAutoTutorHistory(capabilities));
  publishState(capabilities, state, config);

  return {
    config,
    getState: () => cloneJson(state),
    getProgress: () => computeAutoTutorProgress(state),
    getProgressCounts: () => computeAutoTutorProgressCounts(state, config),
    getDialogue: () => cloneJson(state.dialogue),
    async submitStudentAnswer(studentAnswer: string) {
      const cleanedAnswer = validateAutoTutorLearnerInput(state, studentAnswer);
      const turnStartedAt = Date.now();
      try {
        Object.assign(state, transitionAutoTutorOperationalPhase(state, 'scoring_learner', 'learner answer submitted', turnStartedAt));
        const scoreableExpectationIds = getAutoTutorScoreableExpectationIds(config, state);
        const scoreResult = await callOpenRouterScoring(capabilities, config, state, cleanedAnswer, scoreableExpectationIds);
        const scoreEnvelope = scoreResult.value;
        const plannedTurn = scoreAndPlanAutoTutorTurn({
          config,
          state,
          studentAnswer: cleanedAnswer,
        }, scoreEnvelope, scoreResult.costUsd || 0);
        let nextState = plannedTurn.nextState;
        if (isAutoTutorCostCapReached(nextState)) {
          nextState = addAutoTutorUtteranceToTurn(nextState, AUTO_TUTOR_COST_CAP_MESSAGE, 0);
          nextState = applyAutoTutorCostCap(nextState);
          const turnEndedAt = Date.now();
          await capabilities.history.writeAutoTutorTurn({
            config,
            state: nextState,
            studentAnswer: cleanedAnswer,
            tutorMessage: AUTO_TUTOR_COST_CAP_MESSAGE,
            startedAt: turnStartedAt,
            endedAt: turnEndedAt,
          });
          nextState = markAutoTutorHistoryWritten(nextState);
          nextState = markAutoTutorStatePublished(nextState);
          Object.assign(state, nextState);
          publishState(capabilities, state, config);

          return {
            message: AUTO_TUTOR_COST_CAP_MESSAGE,
            completed: state.completed,
            mastered: state.mastered,
            endReason: state.endReason,
            stoppedByCost: state.stoppedByCost,
          };
        }

        const utteranceResult = await callOpenRouterUtterance(
          capabilities,
          config,
          plannedTurn.stateForUtterancePlan,
          cleanedAnswer,
          plannedTurn.plan,
        );
        nextState = addAutoTutorUtteranceToTurn(
          nextState,
          utteranceResult.value.tutorMessage,
          utteranceResult.costUsd || 0,
        );
        const tutorMessage = utteranceResult.value.tutorMessage;
        if (isAutoTutorCostCapReached(nextState)) {
          nextState = applyAutoTutorCostCap(nextState);
        }
        const turnEndedAt = Date.now();
        await capabilities.history.writeAutoTutorTurn({
          config,
          state: nextState,
          studentAnswer: cleanedAnswer,
          tutorMessage,
          startedAt: turnStartedAt,
          endedAt: turnEndedAt,
        });
        nextState = markAutoTutorHistoryWritten(nextState);
        nextState = markAutoTutorStatePublished(nextState);
        Object.assign(state, nextState);
        publishState(capabilities, state, config);

        return {
          message: tutorMessage,
          completed: state.completed,
          mastered: state.mastered,
          endReason: state.endReason,
          stoppedByCost: state.stoppedByCost,
        };
      } catch (error) {
        Object.assign(state, markAutoTutorErrored(state));
        publishState(capabilities, state, config);
        throw error;
      }
    },
  };
}
