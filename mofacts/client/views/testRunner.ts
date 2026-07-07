import { Template } from 'meteor/templating';
import { Meteor } from 'meteor/meteor';
import './testRunner.html';
import { getActiveUiLocale } from '../lib/interfaceLocaleState';
import { translatePlatformString } from '../lib/interfaceI18n';

declare const $: (selector: string | EventTarget | null) => {
  html(value: string): void;
};

type ReadinessCheck = {
  name: string;
  status: 'pass' | 'fail';
  message: string;
};

function testText(key: Parameters<typeof translatePlatformString>[1], values?: Parameters<typeof translatePlatformString>[2]): string {
  return translatePlatformString(getActiveUiLocale(), key, values);
}

function readinessStatusLabel(status: ReadinessCheck['status']): string {
  return status === 'pass' ? testText('adminTests.pass') : testText('adminTests.fail');
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

Template.testRunner.helpers({
  testText(key: Parameters<typeof translatePlatformString>[1]) {
    return testText(key);
  },
});

Template.testRunner.events({
  'click .run-deployment-readiness'(event: Event) {
    event.preventDefault();
    $('#deployment-readiness-output').html(escapeHtml(testText('adminTests.runningReadinessChecks')));
    Meteor.call('deploymentReadiness', (error: Meteor.Error | undefined, result: any) => {
      if (error) {
        $('#deployment-readiness-output').html(`<div class="alert alert-danger">${escapeHtml(error.reason || error.message)}</div>`);
        return;
      }
      const checks = Array.isArray(result?.checks) ? result.checks as ReadinessCheck[] : [];
      const rows = checks.map((check) => {
        const className = check.status === 'pass' ? 'table-success' : 'table-danger';
        return `<tr class="${className}"><td>${escapeHtml(check.name)}</td><td>${escapeHtml(readinessStatusLabel(check.status))}</td><td>${escapeHtml(check.message)}</td></tr>`;
      }).join('');
      $('#deployment-readiness-output').html(`
        <div class="alert ${result?.ok ? 'alert-success' : 'alert-danger'}">
          ${escapeHtml(testText(result?.ok ? 'adminTests.readinessPassed' : 'adminTests.readinessFailed', { generatedAt: result?.generatedAt }))}
        </div>
        <table class="table table-sm table-bordered">
          <thead><tr><th>${escapeHtml(testText('adminTests.check'))}</th><th>${escapeHtml(testText('adminTests.status'))}</th><th>${escapeHtml(testText('adminTests.message'))}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `);
    });
  }
});
