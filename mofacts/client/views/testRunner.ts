import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';
import { Template } from 'meteor/templating';
import './testRunner.html';
import './aiContentPromptLab';
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
  type SparcCompoundInterestLiveEvaluationSource,
  type SparcCompoundInterestLiveEvaluationResult,
} from './experiment/svelte/services/sparcCompoundInterestLiveEvaluation';
import { AI_CONTENT_CONTRACT_VERSION } from '../../common/aiContentContract';

type OpenRouterStrictPreflightResult = {
  ok: true;
  model: string;
  source: string;
  reasoningLevel: string;
  message: string;
};

type SparcCompoundInterestSourceOption = Readonly<{
  tdfId: string;
  tdfName: string;
  pageId: string;
}>;

type TestRunnerInstance = Blaze.TemplateInstance & {
  readinessState: ReactiveVar<AsyncCommandState<DeploymentReadinessResult>>;
  readinessCommand: AsyncCommandController<DeploymentReadinessResult>;
  sparcLiveState: ReactiveVar<AsyncCommandState<SparcCompoundInterestLiveEvaluationResult>>;
  sparcLiveCommand: AsyncCommandController<SparcCompoundInterestLiveEvaluationResult>;
  sparcLiveSavedJson: ReactiveVar<string>;
  sparcSourceOptions: ReactiveVar<readonly SparcCompoundInterestSourceOption[]>;
  sparcSelectedSourceKey: ReactiveVar<string>;
  sparcSourceError: ReactiveVar<string>;
  sparcSourcesPending: ReactiveVar<boolean>;
  openRouterPreflightState: ReactiveVar<AsyncCommandState<OpenRouterStrictPreflightResult>>;
  openRouterPreflightCommand: AsyncCommandController<OpenRouterStrictPreflightResult>;
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
      { role: 'system', content: 'Return only JSON matching the supplied schema.' },
      { role: 'user', content: 'Return the numeric answer to 2 + 2 as a string.' },
    ],
    max_tokens: 80,
    reasoning: { effort: capability.reasoningLevel },
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: `mofacts_openrouter_preflight_v${AI_CONTENT_CONTRACT_VERSION}`,
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['answer'],
          properties: { answer: { type: 'string', enum: ['4'] } },
        },
      },
    },
    provider: { require_parameters: true, allow_fallbacks: false },
    stream: false,
  });
  if (result?.parsedContent?.answer !== '4' || result?.validation?.ok !== true) {
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

const SPARC_LIVE_RESULT_STORAGE_KEY = 'mofacts.adminTests.sparcCompoundInterestLiveEvaluation.latest';

function sparcSourceKey(source: Pick<SparcCompoundInterestSourceOption, 'tdfId' | 'pageId'>): string {
  return `${source.tdfId}\t${source.pageId}`;
}

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
  this.sparcSourceOptions = new ReactiveVar<readonly SparcCompoundInterestSourceOption[]>([]);
  this.sparcSelectedSourceKey = new ReactiveVar<string>('');
  this.sparcSourceError = new ReactiveVar<string>('');
  this.sparcSourcesPending = new ReactiveVar<boolean>(true);
  this.openRouterPreflightState = new ReactiveVar<AsyncCommandState<OpenRouterStrictPreflightResult>>({ status: 'idle' });
  this.openRouterPreflightCommand = createAsyncCommandController((state) => this.openRouterPreflightState.set(state));
  void (Meteor as typeof Meteor & { callAsync: (name: string, ...args: any[]) => Promise<any> })
    .callAsync('getAdminTestSparcCompoundInterestSources')
    .then((sources: unknown) => {
      const options = Array.isArray(sources)
        ? sources.filter((source): source is SparcCompoundInterestSourceOption => (
          source !== null
          && typeof source === 'object'
          && typeof source.tdfId === 'string'
          && typeof source.tdfName === 'string'
          && typeof source.pageId === 'string'
        ))
        : [];
      this.sparcSourceOptions.set(options);
      this.sparcSelectedSourceKey.set(options[0] ? sparcSourceKey(options[0]) : '');
    })
    .catch((error) => this.sparcSourceError.set(getErrorMessage(error)))
    .finally(() => this.sparcSourcesPending.set(false));
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
          checks: state.result.checks.map((check) => {
            const expressionFailures = check.details?.failures.map((failure) => ({
              ...failure,
              accessibleLabel: testText('adminTests.expressionFailureLocation', failure),
            })) ?? [];
            return {
              ...check,
              rowClass: check.status === 'pass' ? 'table-success' : 'table-danger',
              displayStatus: check.status === 'pass'
                ? testText('adminTests.pass')
                : testText('adminTests.fail'),
              expressionFailures,
              expressionFailureListLabel: testText('adminTests.invalidExpressionLocations'),
              omittedFailureMessage: check.details?.omittedFailureCount
                ? testText('adminTests.additionalExpressionLocationsOmitted', {
                  count: check.details.omittedFailureCount,
                })
                : '',
            };
          }),
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
  sparcSourceOptions() {
    const instance = Template.instance() as TestRunnerInstance;
    const selectedKey = instance.sparcSelectedSourceKey.get();
    return instance.sparcSourceOptions.get().map((source) => ({
      ...source,
      key: sparcSourceKey(source),
      label: `${source.tdfName} (${source.pageId})`,
      selected: sparcSourceKey(source) === selectedKey,
    }));
  },
  sparcSourceError() {
    return (Template.instance() as TestRunnerInstance).sparcSourceError.get();
  },
  sparcHasSourceOptions() {
    return (Template.instance() as TestRunnerInstance).sparcSourceOptions.get().length > 0;
  },
  sparcSourcesPending() {
    return (Template.instance() as TestRunnerInstance).sparcSourcesPending.get();
  },
  sparcLiveUnavailable() {
    const instance = Template.instance() as TestRunnerInstance;
    return instance.sparcSourcesPending.get()
      || !instance.sparcSelectedSourceKey.get()
      || instance.sparcLiveState.get().status === 'pending';
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
          sourceLabel: `${state.result.sourceTdfName} (${state.result.sourcePageId}; ${state.result.sourceTdfId})`,
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
    const selectedKey = instance.sparcSelectedSourceKey.get();
    const selected = instance.sparcSourceOptions.get()
      .find((source) => sparcSourceKey(source) === selectedKey);
    if (!selected) {
      instance.sparcSourceError.set('Select an uploaded compatible SPARC TDF before running the evaluation.');
      return;
    }
    instance.sparcSourceError.set('');
    await instance.sparcLiveCommand.run(async () => {
      const source = await (Meteor as typeof Meteor & {
        callAsync: (name: string, ...args: any[]) => Promise<SparcCompoundInterestLiveEvaluationSource>;
      }).callAsync(
        'getAdminTestSparcCompoundInterestSource',
        selected.tdfId,
        selected.pageId,
      );
      return runSparcCompoundInterestLiveEvaluation({ source });
    }, {
      getErrorMessage,
      onSuccess: () => {
        instance.sparcLiveSavedJson.set(savedSparcLiveResultJson());
      },
    });
  },
  'change #sparc-live-evaluation-source'(event: Event, instance: TestRunnerInstance) {
    instance.sparcSelectedSourceKey.set((event.currentTarget as HTMLSelectElement).value);
    instance.sparcSourceError.set('');
  },
  'click .download-sparc-live-evaluation'(event: Event) {
    event.preventDefault();
    downloadSavedSparcLiveResult();
  },
  async 'click .run-openrouter-strict-preflight'(event: Event, instance: TestRunnerInstance) {
    event.preventDefault();
    await instance.openRouterPreflightCommand.run(runOpenRouterStrictPreflight, { getErrorMessage });
  },
});
