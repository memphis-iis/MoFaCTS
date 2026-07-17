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

type TestRunnerInstance = Blaze.TemplateInstance & {
  readinessState: ReactiveVar<AsyncCommandState<DeploymentReadinessResult>>;
  readinessCommand: AsyncCommandController<DeploymentReadinessResult>;
  sparcLiveState: ReactiveVar<AsyncCommandState<SparcCompoundInterestLiveEvaluationResult>>;
  sparcLiveCommand: AsyncCommandController<SparcCompoundInterestLiveEvaluationResult>;
  sparcLiveSavedJson: ReactiveVar<string>;
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
});

Template.testRunner.onDestroyed(function(this: TestRunnerInstance) {
  this.readinessCommand.destroy();
  this.sparcLiveCommand.destroy();
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
});
