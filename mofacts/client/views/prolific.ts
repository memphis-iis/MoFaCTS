import { translatePlatformString } from '../lib/interfaceI18n';
import { getActiveUiLocale } from '../lib/interfaceLocaleState';
import { PLATFORM_STRING_KEYS, type PlatformStringKey } from '../lib/interfaceI18nResources';
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { meteorCallAsync } from '../lib/meteorAsync';
import './prolific.html';

Template.prolific.onCreated(function(this: any) {
  this.viewState = new ReactiveVar({ busy: false, error: false, workspaces: [], projects: [], studies: [], lessons: [] });
  this.active = true;
  this.studyPage = 1;
  void run(this, async () => { update(this, { testOperations: await meteorCallAsync('prolificTestSetupStatus') }); });
});
Template.prolific.onDestroyed(function(this: any) { this.active = false; });
const current = () => (Template.instance() as any).viewState.get();
Template.prolific.helpers({
  operationStatus: (status: string) => translatePlatformString(getActiveUiLocale(), `prolific.status.${status}` as PlatformStringKey),
  operationKind: (kind: string) => translatePlatformString(getActiveUiLocale(), `prolific.${kind}` as PlatformStringKey),
  busy: () => current().busy, error: () => current().error,
  errorText: () => errorText(current().errorKey),
  testError: (key: string) => errorText(key),
  testPreview: () => current().testPreview,
  completionCodes: () => current().completionCodes,
  testOperations: () => current().testOperations,
  canExecuteTest: (status: string, kind: string) => kind === 'test-study' && ['prepared', 'failed', 'setup-incomplete'].includes(status),
  canRetryTestParticipant: (status: string, kind: string) => kind === 'test-participant' && status === 'failed',
  testReady: (status: string) => status === 'ready',
  workspaces: () => current().workspaces, projects: () => current().projects, studies: () => current().studies,
  lessons: () => current().lessons, moreStudies: () => current().moreStudies, moreLessons: () => current().moreLessons,
  dashboard: () => current().dashboard, messages: () => current().messages,
  currency: () => current().dashboard?.currency,
  preview: () => current().preview, previewBody: () => current().previewBody,
  prepared: () => current().preview?.status === 'prepared',
  canReview: (status: string) => ['accepted', 'review-required', 'failed'].includes(status),
  canRetry: (status: string) => status === 'failed',
  displayAmount: (cents: unknown) => typeof cents === 'number' ? (cents / 100).toFixed(2) : '',
});
function value(t: any, id: string): string { return t.find(`#prolific-${id}`)?.value || ''; }
function errorText(key: string) {
  const safeKey: PlatformStringKey = (PLATFORM_STRING_KEYS as readonly string[]).includes(key) ? key as PlatformStringKey : 'prolific.error';
  return translatePlatformString(getActiveUiLocale(), safeKey);
}
function update(t: any, patch: any) { if (t.active) t.viewState.set({ ...t.viewState.get(), ...patch }); }
async function run(t: any, action: () => Promise<void>) {
  if (t.viewState.get().busy) return;
  update(t, { busy: true, error: false });
  try { await action(); } catch (error: any) { update(t, { error: true, errorKey: /^prolific\.[A-Za-z]+$/.test(error?.error) ? error.error : 'prolific.error' }); }
  finally { update(t, { busy: false }); }
}
async function list(t: any, kind: string, extra = {}) {
  return meteorCallAsync('prolificList', { kind, workspaceId: value(t, 'workspace'), projectId: value(t, 'project'), ...extra }) as Promise<any>;
}
async function refresh(t: any, after = '') {
  update(t, { dashboard: await meteorCallAsync('prolificDashboard', { studyId: value(t, 'study'), after }) });
}
Template.prolific.events({
  'submit #prolific-test-participant': function(event: Event, t: any) {
    event.preventDefault();
    void run(t, async () => {
      const email = value(t, 'test-email');
      if (t.testEmail !== email) { t.testEmail = email; t.testParticipantRequest = crypto.randomUUID(); }
      await meteorCallAsync('prolificCreateTestParticipant', { email, requestId: t.testParticipantRequest });
      update(t, { testOperations: await meteorCallAsync('prolificTestSetupStatus') });
    });
  },
  'submit #prolific-connect': function(event: Event, t: any) {
    event.preventDefault();
    void run(t, async () => {
      const input = t.find('#prolific-token');
      const token = input.value;
      input.value = '';
      await meteorCallAsync('prolificConnect', { token });
      update(t, { workspaces: await list(t, 'workspaces'), projects: [], studies: [], lessons: [], dashboard: null, preview: null, messages: [] });
    });
  },
  'change #prolific-workspace': function(_event: Event, t: any) {
    void run(t, async () => { update(t, { projects: [], studies: [], dashboard: null, preview: null }); update(t, { projects: await list(t, 'projects') }); });
  },
  'change #prolific-project': function(_event: Event, t: any) {
    void run(t, async () => {
      t.studyPage = 1;
      update(t, { studies: [], dashboard: null, preview: null });
      const studies = await list(t, 'studies', { page: 1 });
      const lessons = await list(t, 'lessons');
      update(t, { studies: studies.results, moreStudies: studies.hasMore, lessons: lessons.results, moreLessons: lessons.hasMore });
    });
  },
  'change #prolific-study': function(_event: Event, t: any) { update(t, { dashboard: null, preview: null, messages: [] }); },
  'click [data-action]': function(event: Event, t: any) {
    const button = event.currentTarget as HTMLButtonElement;
    const action = button.dataset.action;
    void run(t, async () => {
      const studyId = value(t, 'study');
      if (action === 'test-prepare') {
        const input = { sourceStudyId: studyId, workspaceId: value(t, 'workspace'), projectId: value(t, 'project'),
          rootTdfId: value(t, 'lesson'), reminderText: value(t, 'reminder'), completionCode: value(t, 'test-code') };
        const result: any = await meteorCallAsync('prolificPrepareTestStudy', { ...input, requestId: crypto.randomUUID() });
        update(t, { completionCodes: result.status === 'choose-code' ? result.completionCodes : [],
          testPreview: result.status === 'prepared' ? result : null,
          testOperations: await meteorCallAsync('prolificTestSetupStatus') });
      } else if (action === 'test-participant-retry') {
        await meteorCallAsync('prolificCreateTestParticipant', { operationId: button.dataset.operation });
        update(t, { testOperations: await meteorCallAsync('prolificTestSetupStatus') });
      } else if (action === 'test-execute') {
        await meteorCallAsync('prolificExecuteTestStudy', { operationId: button.dataset.operation });
        update(t, { testPreview: null, testOperations: await meteorCallAsync('prolificTestSetupStatus') });
      } else if (action === 'test-refresh') update(t, { testOperations: await meteorCallAsync('prolificTestSetupStatus') });
      else if (action === 'workspaces') update(t, { workspaces: await list(t, 'workspaces') });
      else if (action === 'bind') {
        await meteorCallAsync('prolificBindStudy', { workspaceId: value(t, 'workspace'), projectId: value(t, 'project'), studyId, rootTdfId: value(t, 'lesson'), reminderText: value(t, 'reminder') });
        await refresh(t);
      } else if (action === 'dashboard') await refresh(t);
      else if (action === 'participants-next') await refresh(t, t.viewState.get().dashboard.results.at(-1).id);
      else if (action === 'studies-next') {
        const result = await list(t, 'studies', { page: ++t.studyPage });
        update(t, { studies: result.results, moreStudies: result.hasMore, dashboard: null, preview: null });
      } else if (action === 'lessons-next') {
        const result = await list(t, 'lessons', { after: t.viewState.get().lessons.at(-1).id });
        update(t, { lessons: result.results, moreLessons: result.hasMore });
      } else if (action === 'messages') update(t, { messages: await meteorCallAsync('prolificMessages', { studyId, submissionId: button.dataset.submission }) });
      else if (['approve', 'bonus', 'message'].includes(action || '')) {
        const rows = Array.from(t.findAll('.prolific-select:checked') as HTMLInputElement[]).map(input => ({ submissionId: input.value, amount: t.find(`.prolific-amount[data-submission="${input.value}"]`).value }));
        const body = value(t, 'message');
        const preview = await meteorCallAsync('prolificPrepareOperation', { studyId, kind: action, rows, body, requestId: crypto.randomUUID() });
        update(t, { preview, previewBody: action === 'message' ? body : '' });
      } else if (action === 'confirm') {
        update(t, { preview: await meteorCallAsync('prolificConfirmOperation', { operationId: t.viewState.get().preview.id }) });
        await refresh(t);
      } else if (action === 'review') {
        await meteorCallAsync('prolificReviewOperation', { operationId: button.dataset.operation, note: value(t, 'review') });
        await refresh(t);
      } else if (action === 'retry-reminder') {
        await meteorCallAsync('prolificRetryReminder', { reminderId: button.dataset.reminder });
        await refresh(t);
      }
    });
  },
});
