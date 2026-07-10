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

type TestRunnerInstance = Blaze.TemplateInstance & {
  readinessState: ReactiveVar<AsyncCommandState<DeploymentReadinessResult>>;
  readinessCommand: AsyncCommandController<DeploymentReadinessResult>;
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

Template.testRunner.onCreated(function(this: TestRunnerInstance) {
  this.readinessState = new ReactiveVar<AsyncCommandState<DeploymentReadinessResult>>({ status: 'idle' });
  this.readinessCommand = createAsyncCommandController((state) => {
    this.readinessState.set(state);
  });
});

Template.testRunner.onDestroyed(function(this: TestRunnerInstance) {
  this.readinessCommand.destroy();
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
});

Template.testRunner.events({
  async 'click .run-deployment-readiness'(event: Event, instance: TestRunnerInstance) {
    event.preventDefault();
    await instance.readinessCommand.run(runDeploymentReadiness, {
      getErrorMessage,
    });
  },
});
