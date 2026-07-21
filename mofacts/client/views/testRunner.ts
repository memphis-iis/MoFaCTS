import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';
import { Template } from 'meteor/templating';
import './testRunner.html';
import './shared/adminUi/adminUi';
import {
  createAsyncCommandController,
  type AsyncCommandController,
  type AsyncCommandState,
} from '../lib/adminUi/asyncCommandState';
import { getErrorMessage } from '../lib/errorUtils';
import { getActiveUiLocale } from '../lib/interfaceLocaleState';
import { translatePlatformString } from '../lib/interfaceI18n';
import {
  normalizeDeploymentReadinessResult,
  type DeploymentReadinessResult,
} from './testRunnerState';
import {
  runSparcCompoundInterestLiveEvaluation,
  type SparcCompoundInterestLiveEvaluationResult,
} from './experiment/svelte/services/sparcCompoundInterestLiveEvaluation';
import {
  AI_CONTENT_CONTRACT_VERSION,
  AI_GENERATED_PAIR_RESPONSE_SCHEMA,
  validateGeneratedPairResponse,
} from '../../common/aiContentContract';
import { AI_CONTENT_SYSTEM_PROMPT, buildPairGenerationPrompt } from '../lib/aiContentPrompts';
import { discoverAuthoritativeWikimediaPairs } from '../lib/aiContentImageSets';
import { copyablePromptLabPairs } from '../lib/aiContentPromptLabState';

type OpenRouterStrictPreflightResult = {
  ok: true;
  model: string;
  source: string;
  reasoningLevel: string;
  message: string;
};

type TestRunnerInstance = Blaze.TemplateInstance & {
  readinessState: ReactiveVar<AsyncCommandState<DeploymentReadinessResult>>;
  readinessCommand: AsyncCommandController<DeploymentReadinessResult>;
  sparcLiveState: ReactiveVar<AsyncCommandState<SparcCompoundInterestLiveEvaluationResult>>;
  sparcLiveCommand: AsyncCommandController<SparcCompoundInterestLiveEvaluationResult>;
  sparcLiveSavedJson: ReactiveVar<string>;
  openRouterPreflightState: ReactiveVar<AsyncCommandState<OpenRouterStrictPreflightResult>>;
  openRouterPreflightCommand: AsyncCommandController<OpenRouterStrictPreflightResult>;
  promptLabRequest: ReactiveVar<string>;
  promptLabResult: ReactiveVar<string>;
  promptLabPairs: ReactiveVar<string>;
  promptLabError: ReactiveVar<string>;
  promptLabPending: ReactiveVar<boolean>;
  wikimediaLabNotes: ReactiveVar<string>;
  wikimediaLabResult: ReactiveVar<string>;
  wikimediaLabError: ReactiveVar<string>;
  wikimediaLabPending: ReactiveVar<boolean>;
  wikimediaLabModel: ReactiveVar<string>;
};

function testText(
  key: Parameters<typeof translatePlatformString>[1],
  values?: Parameters<typeof translatePlatformString>[2],
): string {
  return translatePlatformString(getActiveUiLocale(), key, values);
}

function runDeploymentReadiness(): Promise<DeploymentReadinessResult> {
  return new Promise((resolve, reject) => {
    Meteor.call('deploymentReadiness', (error: Meteor.Error | undefined, result: unknown) => {
      if (error) {
        reject(error);
        return;
      }
      try {
        resolve(normalizeDeploymentReadinessResult(result));
      } catch (contractError: unknown) {
        reject(contractError);
      }
    });
  });
}

function readinessState(): AsyncCommandState<DeploymentReadinessResult> {
  return (Template.instance() as TestRunnerInstance).readinessState.get();
}

function sparcLiveState(): AsyncCommandState<SparcCompoundInterestLiveEvaluationResult> {
  return (Template.instance() as TestRunnerInstance).sparcLiveState.get();
}

function openRouterPreflightState(): AsyncCommandState<OpenRouterStrictPreflightResult> {
  return (Template.instance() as TestRunnerInstance).openRouterPreflightState.get();
}

async function runOpenRouterStrictPreflight(): Promise<OpenRouterStrictPreflightResult> {
  const meteor = Meteor as typeof Meteor & { callAsync: (name: string, ...args: any[]) => Promise<any> };
  const capability = await meteor.callAsync('getAdminTestOpenRouterCapability');
  const result = await meteor.callAsync('callAdminTestOpenRouterRequest', {
    model: capability.model,
    messages: [
      { role: 'system', content: AI_CONTENT_SYSTEM_PROMPT },
      { role: 'user', content: 'Return exactly one text pair whose stimulus is "2 + 2" and whose response is "4".' },
    ],
    max_tokens: 80,
    response_format: {
      type: 'json_schema',
      json_schema: { name: `mofacts_ai_content_pairs_v${AI_CONTENT_CONTRACT_VERSION}`, strict: true, schema: AI_GENERATED_PAIR_RESPONSE_SCHEMA },
    },
    provider: { require_parameters: true, allow_fallbacks: false },
    stream: false,
  });
  const pairs = validateGeneratedPairResponse(result?.parsedContent);
  if (pairs.length !== 1 || pairs[0]?.kind !== 'text' || pairs[0]?.stimulus !== '2 + 2' || pairs[0]?.response !== '4' || result?.validation?.ok !== true) {
    throw new Error('OpenRouter returned content that did not satisfy the strict preflight contract.');
  }
  return {
    ok: true,
    model: String(result.model || ''),
    source: String(result.source || ''),
    reasoningLevel: String(result.reasoningLevel || ''),
    message: `Strict schema v${AI_CONTENT_CONTRACT_VERSION} passed with ${String(result.model || 'the configured model')}.`,
  };
}

function seedPromptLabRequest(model = ''): string {
  return JSON.stringify({
    model,
    messages: [
      { role: 'system', content: AI_CONTENT_SYSTEM_PROMPT },
      { role: 'user', content: buildPairGenerationPrompt('Create text prompts for the capitals of Tennessee, Arkansas, and Mississippi.') },
    ],
    max_tokens: 12000,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: `mofacts_ai_content_pairs_v${AI_CONTENT_CONTRACT_VERSION}`,
        strict: true,
        schema: AI_GENERATED_PAIR_RESPONSE_SCHEMA,
      },
    },
    provider: { require_parameters: true, allow_fallbacks: false },
    stream: false,
  }, null, 2);
}

function promptLabErrorDetails(error: unknown): string {
  const meteorError = error as { error?: unknown; reason?: unknown; message?: unknown; details?: unknown };
  let details: unknown = meteorError?.details;
  if (typeof details === 'string') {
    try { details = JSON.parse(details); } catch { /* Keep the provider's sanitized text. */ }
  }
  return JSON.stringify({
    code: meteorError?.error || null,
    message: meteorError?.reason || meteorError?.message || getErrorMessage(error),
    details: details || null,
  }, null, 2);
}

function discoveryLabResultJson(result: Awaited<ReturnType<typeof discoverAuthoritativeWikimediaPairs>>): string {
  return JSON.stringify(result, (key, value) => (key === 'sourceBytes' || key === 'webpBytes') && value instanceof Uint8Array
    ? { byteLength: value.byteLength, retainedOnlyForThisBrowserRun: true }
    : value, 2);
}

function discoveryLabErrorDetails(error: unknown): string {
  const value = error as { message?: unknown; attempts?: unknown };
  return JSON.stringify({
    message: value?.message || getErrorMessage(error),
    ...(Array.isArray(value?.attempts) ? { topicPlanningAttempts: value.attempts } : {}),
  }, null, 2);
}

const WIKIMEDIA_LAB_NOTES = 'bones of the human hand and wrist with image prompts';

const SPARC_LIVE_RESULT_STORAGE_KEY = 'mofacts.adminTests.sparcCompoundInterestLiveEvaluation.latest';

function savedSparcLiveResultJson(): string {
  return globalThis.localStorage?.getItem(SPARC_LIVE_RESULT_STORAGE_KEY) ?? '';
}

function downloadSavedSparcLiveResult(): void {
  const json = savedSparcLiveResultJson();
  if (!json) {
    throw new Error('No saved SPARC live evaluation result is available to download.');
  }
  const parsed = JSON.parse(json) as { generatedAt?: unknown };
  const timestamp = typeof parsed.generatedAt === 'string'
    ? parsed.generatedAt.replaceAll(':', '-').replaceAll('.', '-')
    : new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `sparc-compound-interest-live-evaluation-${timestamp}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

Template.testRunner.onCreated(function(this: TestRunnerInstance) {
  this.readinessState = new ReactiveVar<AsyncCommandState<DeploymentReadinessResult>>({ status: 'idle' });
  this.readinessCommand = createAsyncCommandController((state) => {
    this.readinessState.set(state);
  });
  this.sparcLiveState = new ReactiveVar<AsyncCommandState<SparcCompoundInterestLiveEvaluationResult>>({ status: 'idle' });
  this.sparcLiveCommand = createAsyncCommandController((state) => {
    this.sparcLiveState.set(state);
  });
  this.sparcLiveSavedJson = new ReactiveVar<string>(savedSparcLiveResultJson());
  this.openRouterPreflightState = new ReactiveVar<AsyncCommandState<OpenRouterStrictPreflightResult>>({ status: 'idle' });
  this.openRouterPreflightCommand = createAsyncCommandController((state) => this.openRouterPreflightState.set(state));
  this.promptLabRequest = new ReactiveVar(seedPromptLabRequest());
  this.promptLabResult = new ReactiveVar('');
  this.promptLabPairs = new ReactiveVar('');
  this.promptLabError = new ReactiveVar('');
  this.promptLabPending = new ReactiveVar(false);
  this.wikimediaLabNotes = new ReactiveVar(WIKIMEDIA_LAB_NOTES);
  this.wikimediaLabResult = new ReactiveVar('');
  this.wikimediaLabError = new ReactiveVar('');
  this.wikimediaLabPending = new ReactiveVar(false);
  this.wikimediaLabModel = new ReactiveVar('');
  void (Meteor as typeof Meteor & { callAsync: (name: string, ...args: any[]) => Promise<any> })
    .callAsync('getAdminTestOpenRouterCapability')
    .then((capability) => {
      const model = String(capability?.model || '');
      this.wikimediaLabModel.set(model);
      this.promptLabRequest.set(seedPromptLabRequest(model));
    })
    .catch((error) => this.promptLabError.set(getErrorMessage(error)));
});

Template.testRunner.onDestroyed(function(this: TestRunnerInstance) {
  this.readinessCommand.destroy();
  this.sparcLiveCommand.destroy();
  this.openRouterPreflightCommand.destroy();
});

Template.testRunner.helpers({
  testText(key: Parameters<typeof translatePlatformString>[1]) {
    return testText(key);
  },
  readinessPending() {
    return readinessState().status === 'pending';
  },
  readinessOutput() {
    const state = readinessState();
    if (state.status === 'pending') {
      return {
        template: 'adminStatus',
        data: {
          variant: 'info',
          text: testText('adminTests.runningReadinessChecks'),
          urgent: false,
        },
      };
    }
    if (state.status === 'error') {
      return {
        template: 'adminStatus',
        data: {
          variant: 'error',
          text: state.message,
          urgent: true,
        },
      };
    }
    if (state.status === 'success') {
      return {
        template: 'testRunnerReadinessResult',
        data: {
          summaryVariant: state.result.ok ? 'success' : 'error',
          summaryText: testText(
            state.result.ok ? 'adminTests.readinessPassed' : 'adminTests.readinessFailed',
            { generatedAt: state.result.generatedAt },
          ),
          summaryUrgent: !state.result.ok,
          tableLabel: testText('adminTests.deploymentReadiness'),
          checkLabel: testText('adminTests.check'),
          statusLabel: testText('adminTests.status'),
          messageLabel: testText('adminTests.message'),
          emptyText: testText('adminTests.noChecksReturned'),
          checks: state.result.checks.map((check) => ({
            ...check,
            rowClass: check.status === 'pass' ? 'table-success' : 'table-danger',
            displayStatus: check.status === 'pass'
              ? testText('adminTests.pass')
              : testText('adminTests.fail'),
          })),
        },
      };
    }
    return null;
  },
  sparcLivePending() {
    return sparcLiveState().status === 'pending';
  },
  sparcLiveSavedJson() {
    return (Template.instance() as TestRunnerInstance).sparcLiveSavedJson.get();
  },
  sparcLiveHasSavedJson() {
    return Boolean((Template.instance() as TestRunnerInstance).sparcLiveSavedJson.get());
  },
  sparcLiveOutput() {
    const state = sparcLiveState();
    if (state.status === 'pending') {
      return {
        template: 'adminStatus',
        data: {
          variant: 'info',
          text: testText('adminTests.runningSparcLiveEvaluation'),
          urgent: false,
        },
      };
    }
    if (state.status === 'error') {
      return {
        template: 'adminStatus',
        data: {
          variant: 'error',
          text: state.message,
          urgent: true,
        },
      };
    }
    if (state.status === 'success') {
      return {
        template: 'testRunnerSparcLiveResult',
        data: {
          summaryVariant: state.result.ok ? 'success' : 'error',
          summaryText: testText(
            state.result.ok ? 'adminTests.sparcLivePassed' : 'adminTests.sparcLiveFailed',
            {
              robustnessPassedRuns: state.result.robustnessPassedRuns,
              graduationPassedRuns: state.result.graduationPassedRuns,
              evaluatedRuns: state.result.evaluatedRuns,
              evaluationErrorRuns: state.result.evaluationErrorRuns,
              notRunRuns: state.result.notRunRuns,
              totalRuns: state.result.totalRuns,
              passRate: state.result.passRate === null
                ? testText('adminTests.notEvaluated')
                : `${Math.round(state.result.passRate * 100)}%`,
              requiredGraduationRuns: state.result.requiredGraduationRuns,
            },
          ),
          summaryUrgent: !state.result.ok,
          tableLabel: testText('adminTests.sparcLiveEvaluation'),
          checkLabel: testText('adminTests.run'),
          graduationLabel: testText('adminTests.sparcLiveGraduation'),
          robustnessLabel: testText('adminTests.sparcLiveRobustness'),
          messageLabel: testText('adminTests.message'),
          runs: state.result.runs.map((run) => ({
            ...run,
            rowClass: run.overallOutcome === 'evaluation-error'
              ? 'table-danger'
              : (run.overallOutcome === 'not-run'
              ? 'table-warning'
              : (run.studentOutcome === 'not-graduated'
                ? 'table-danger'
                : (run.robustnessOutcome === 'passed' ? 'table-success' : 'table-warning'))),
            displayStudentOutcome: run.overallOutcome === 'not-run'
              ? testText('adminTests.notRun')
              : (run.studentOutcome === 'not-evaluated'
                ? testText('adminTests.notEvaluated')
              : (run.studentOutcome === 'graduated'
                ? testText('adminTests.pass')
                : testText('adminTests.fail'))),
            displayRobustnessOutcome: run.robustnessOutcome === 'not-evaluated'
              ? (run.overallOutcome === 'not-run'
                ? testText('adminTests.notRun')
                : testText('adminTests.notEvaluated'))
              : (run.robustnessOutcome === 'passed'
                ? testText('adminTests.pass')
                : testText('adminTests.fail')),
          })),
        },
      };
    }
    return null;
  },
  openRouterPreflightPending() {
    return openRouterPreflightState().status === 'pending';
  },
  openRouterPreflightOutput() {
    const state = openRouterPreflightState();
    if (state.status === 'pending') return { template: 'adminStatus', data: { variant: 'info', text: 'Testing the configured OpenRouter model with strict JSON Schema...', urgent: false } };
    if (state.status === 'error') return { template: 'adminStatus', data: { variant: 'error', text: state.message, urgent: true } };
    if (state.status === 'success') return { template: 'adminStatus', data: { variant: 'success', text: `${state.result.message} Source: ${state.result.source}; reasoning: ${state.result.reasoningLevel}.`, urgent: false } };
    return null;
  },
  promptLabRequest() { return (Template.instance() as TestRunnerInstance).promptLabRequest.get(); },
  promptLabResult() { return (Template.instance() as TestRunnerInstance).promptLabResult.get(); },
  promptLabPairs() { return (Template.instance() as TestRunnerInstance).promptLabPairs.get(); },
  promptLabError() { return (Template.instance() as TestRunnerInstance).promptLabError.get(); },
  promptLabPending() { return (Template.instance() as TestRunnerInstance).promptLabPending.get(); },
  wikimediaLabNotes() { return (Template.instance() as TestRunnerInstance).wikimediaLabNotes.get(); },
  wikimediaLabResult() { return (Template.instance() as TestRunnerInstance).wikimediaLabResult.get(); },
  wikimediaLabError() { return (Template.instance() as TestRunnerInstance).wikimediaLabError.get(); },
  wikimediaLabPending() { return (Template.instance() as TestRunnerInstance).wikimediaLabPending.get(); },
});

Template.testRunner.events({
  async 'click .run-deployment-readiness'(event: Event, instance: TestRunnerInstance) {
    event.preventDefault();
    await instance.readinessCommand.run(runDeploymentReadiness, {
      getErrorMessage,
    });
  },
  async 'click .run-sparc-live-evaluation'(event: Event, instance: TestRunnerInstance) {
    event.preventDefault();
    await instance.sparcLiveCommand.run(runSparcCompoundInterestLiveEvaluation, {
      getErrorMessage,
      onSuccess: () => {
        instance.sparcLiveSavedJson.set(savedSparcLiveResultJson());
      },
    });
  },
  'click .download-sparc-live-evaluation'(event: Event) {
    event.preventDefault();
    downloadSavedSparcLiveResult();
  },
  async 'click .run-openrouter-strict-preflight'(event: Event, instance: TestRunnerInstance) {
    event.preventDefault();
    await instance.openRouterPreflightCommand.run(runOpenRouterStrictPreflight, { getErrorMessage });
  },
  'input #ai-content-prompt-lab-request'(event: Event, instance: TestRunnerInstance) {
    instance.promptLabRequest.set((event.currentTarget as HTMLTextAreaElement).value);
  },
  async 'click .run-ai-content-prompt-lab'(event: Event, instance: TestRunnerInstance) {
    event.preventDefault();
    instance.promptLabPending.set(true);
    instance.promptLabError.set('');
    instance.promptLabResult.set('');
    instance.promptLabPairs.set('');
    try {
      const request = JSON.parse(instance.promptLabRequest.get());
      const result = await (Meteor as typeof Meteor & { callAsync: (name: string, ...args: any[]) => Promise<any> })
        .callAsync('callAdminTestOpenRouterRequest', request);
      instance.promptLabResult.set(JSON.stringify(result, null, 2));
      instance.promptLabPairs.set(copyablePromptLabPairs(result));
    } catch (error) {
      instance.promptLabError.set(promptLabErrorDetails(error));
    } finally {
      instance.promptLabPending.set(false);
    }
  },
  'input #wikimedia-lab-notes'(event: Event, instance: TestRunnerInstance) {
    instance.wikimediaLabNotes.set((event.currentTarget as HTMLTextAreaElement).value);
  },
  async 'click .run-wikimedia-discovery-lab'(event: Event, instance: TestRunnerInstance) {
    event.preventDefault();
    instance.wikimediaLabPending.set(true);
    instance.wikimediaLabError.set('');
    instance.wikimediaLabResult.set('');
    try {
      const model = instance.wikimediaLabModel.get();
      if (!model) throw new Error('No configured OpenRouter model is available for Wikipedia topic planning.');
      const result = await discoverAuthoritativeWikimediaPairs({
        notes: instance.wikimediaLabNotes.get(),
        model,
      });
      instance.wikimediaLabResult.set(discoveryLabResultJson(result));
    } catch (error) {
      instance.wikimediaLabError.set(discoveryLabErrorDetails(error));
    } finally {
      instance.wikimediaLabPending.set(false);
    }
  },
});
