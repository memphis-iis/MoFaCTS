import { Template } from 'meteor/templating';
import { Meteor } from 'meteor/meteor';
import './svelteCardTester';
import './testRunner.html';

declare const $: (selector: string | EventTarget | null) => {
  slideDown(): void;
  slideUp(): void;
  removeClass(className: string): { addClass(className: string): void };
  html(value: string): void;
};

type ReadinessCheck = {
  name: string;
  status: 'pass' | 'fail';
  message: string;
};

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

Template.testRunner.events({
  'click .open-svelte-tester'(event: Event) {
    event.preventDefault();
    $('#svelte-tester-container').slideDown();
    $('.open-svelte-tester').html('<i class="fa fa-eye-slash"></i> Hide Svelte Card Tester');
    $('.open-svelte-tester').removeClass('open-svelte-tester').addClass('close-svelte-tester');
  },

  'click .close-svelte-tester'(event: Event) {
    event.preventDefault();
    $('#svelte-tester-container').slideUp();
    $('.close-svelte-tester').html('<i class="fa fa-eye"></i> Open Svelte Card Tester');
    $('.close-svelte-tester').removeClass('close-svelte-tester').addClass('open-svelte-tester');
  },

  'click .run-deployment-readiness'(event: Event) {
    event.preventDefault();
    $('#deployment-readiness-output').html('Running deployment readiness checks...');
    Meteor.call('deploymentReadiness', (error: Meteor.Error | undefined, result: any) => {
      if (error) {
        $('#deployment-readiness-output').html(`<div class="alert alert-danger">${escapeHtml(error.reason || error.message)}</div>`);
        return;
      }
      const checks = Array.isArray(result?.checks) ? result.checks as ReadinessCheck[] : [];
      const rows = checks.map((check) => {
        const className = check.status === 'pass' ? 'table-success' : 'table-danger';
        return `<tr class="${className}"><td>${escapeHtml(check.name)}</td><td>${escapeHtml(check.status)}</td><td>${escapeHtml(check.message)}</td></tr>`;
      }).join('');
      $('#deployment-readiness-output').html(`
        <div class="alert ${result?.ok ? 'alert-success' : 'alert-danger'}">
          Deployment readiness ${result?.ok ? 'passed' : 'failed'} at ${escapeHtml(result?.generatedAt)}
        </div>
        <table class="table table-sm table-bordered">
          <thead><tr><th>Check</th><th>Status</th><th>Message</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `);
    });
  }
});
