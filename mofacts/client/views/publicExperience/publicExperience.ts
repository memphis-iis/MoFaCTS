import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import { resolveThemeBrandLabel } from '../../../common/themeBranding';
import { isPublicDemoKind, PUBLIC_DEMO_DEFINITIONS, type PublicDemoKind } from '../../../common/publicDemoContract';
import { getActiveUiLocale } from '../../lib/interfaceLocaleState';
import { meteorCallAsync } from '../../lib/meteorAsync';
import { getErrorMessage } from '../../lib/errorUtils';
import { clientConsole } from '../../lib/clientLogger';
import { Cookie } from '../../lib/cookies';
import { setExperimentParticipantContext } from '../../lib/idContext';
import { completeExperimentSignIn } from '../login/signIn';
import { publicExperienceText, type PublicExperienceKey } from './publicExperienceI18n';
import './publicLanding.html';
import './publicDemoLaunch.html';
import './publicExperience.css';

type PublicDemoLaunchResult = {
  loginToken: string;
  launchPath: string;
  expiresAt: Date | string;
};

type StoredPublicDemo = {
  kind: PublicDemoKind;
  experimentTarget: string;
  expiresAt: string;
};

const PUBLIC_AUDIENCES = ['student', 'teacher', 'researcher'] as const;
type PublicAudience = typeof PUBLIC_AUDIENCES[number];

type PublicAudiencePresentation = {
  labelKey: PublicExperienceKey;
  titleKey: PublicExperienceKey;
  copyKey: PublicExperienceKey;
  actionKey: PublicExperienceKey;
  path: string;
  tabId: string;
  icon: string;
  secondaryIcon: string;
};

const PUBLIC_AUDIENCE_PRESENTATIONS: Record<PublicAudience, PublicAudiencePresentation> = {
  student: { labelKey: 'navStudents', titleKey: 'studentTitle', copyKey: 'studentCopy', actionKey: 'studentAction', path: '/demo/student', tabId: 'publicAudienceStudent', icon: 'fa-graduation-cap', secondaryIcon: 'fa-line-chart' },
  teacher: { labelKey: 'navTeachers', titleKey: 'teacherTitle', copyKey: 'teacherCopy', actionKey: 'teacherAction', path: '/demo/teacher', tabId: 'publicAudienceTeacher', icon: 'fa-comments', secondaryIcon: 'fa-pencil' },
  researcher: { labelKey: 'navResearchers', titleKey: 'researcherTitle', copyKey: 'researcherCopy', actionKey: 'researcherAction', path: '/demo/researcher', tabId: 'publicAudienceResearcher', icon: 'fa-flask', secondaryIcon: 'fa-table' },
};

function isPublicAudience(value: unknown): value is PublicAudience {
  return typeof value === 'string' && PUBLIC_AUDIENCES.includes(value as PublicAudience);
}

function audienceFromHash(): PublicAudience {
  const hash = window.location.hash.replace(/^#/, '');
  if (hash === 'teachers') return 'teacher';
  if (hash === 'researchers') return 'researcher';
  return 'student';
}

function audienceHash(audience: PublicAudience): string {
  if (audience === 'teacher') return '#teachers';
  if (audience === 'researcher') return '#researchers';
  return '#students';
}

function readStoredPublicDemo(): StoredPublicDemo | null {
  const raw = window.sessionStorage.getItem('mofacts.publicDemo.v1');
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredPublicDemo>;
    if (!isPublicDemoKind(value.kind) || typeof value.experimentTarget !== 'string' || typeof value.expiresAt !== 'string') {
      window.sessionStorage.removeItem('mofacts.publicDemo.v1');
      return null;
    }
    return value as StoredPublicDemo;
  } catch {
    window.sessionStorage.removeItem('mofacts.publicDemo.v1');
    return null;
  }
}

function currentPublicText(key: PublicExperienceKey): string {
  return publicExperienceText(getActiveUiLocale(), key);
}

function systemName(): string {
  return resolveThemeBrandLabel(Session.get('curTheme'), Meteor.settings.public?.systemName);
}

function currentDemoKind(): PublicDemoKind | null {
  const kind = (FlowRouter.current() as { params?: { kind?: unknown } } | undefined)?.params?.kind;
  return isPublicDemoKind(kind) ? kind : null;
}

function demoCopy(kind: PublicDemoKind | null): { title: string; description: string } {
  if (kind === 'teacher') return { title: currentPublicText('teacherTitle'), description: currentPublicText('teacherCopy') };
  if (kind === 'researcher') return { title: currentPublicText('researcherTitle'), description: currentPublicText('researcherCopy') };
  return { title: currentPublicText('studentTitle'), description: currentPublicText('studentCopy') };
}

Template.publicLanding.onCreated(function(this: any) {
  this.selectedAudience = new ReactiveVar<PublicAudience>(audienceFromHash());
});

Template.publicLanding.helpers({
  systemName,
  pt(key: PublicExperienceKey) { return currentPublicText(key); },
  audienceCurrent(audience: PublicAudience) { return (Template.instance() as any).selectedAudience.get() === audience ? 'page' : false; },
  audienceSelected(audience: PublicAudience) { return (Template.instance() as any).selectedAudience.get() === audience ? 'true' : 'false'; },
  audienceTabIndex(audience: PublicAudience) { return (Template.instance() as any).selectedAudience.get() === audience ? '0' : '-1'; },
  activeAudienceTabId() { return PUBLIC_AUDIENCE_PRESENTATIONS[(Template.instance() as any).selectedAudience.get() as PublicAudience].tabId; },
  activeAudienceLabel() { return currentPublicText(PUBLIC_AUDIENCE_PRESENTATIONS[(Template.instance() as any).selectedAudience.get() as PublicAudience].labelKey); },
  activeAudienceTitle() { return currentPublicText(PUBLIC_AUDIENCE_PRESENTATIONS[(Template.instance() as any).selectedAudience.get() as PublicAudience].titleKey); },
  activeAudienceCopy() { return currentPublicText(PUBLIC_AUDIENCE_PRESENTATIONS[(Template.instance() as any).selectedAudience.get() as PublicAudience].copyKey); },
  activeAudienceAction() { return currentPublicText(PUBLIC_AUDIENCE_PRESENTATIONS[(Template.instance() as any).selectedAudience.get() as PublicAudience].actionKey); },
  activeAudiencePath() { return PUBLIC_AUDIENCE_PRESENTATIONS[(Template.instance() as any).selectedAudience.get() as PublicAudience].path; },
  activeAudienceIcon() { return PUBLIC_AUDIENCE_PRESENTATIONS[(Template.instance() as any).selectedAudience.get() as PublicAudience].icon; },
  activePreviewSecondaryIcon() { return PUBLIC_AUDIENCE_PRESENTATIONS[(Template.instance() as any).selectedAudience.get() as PublicAudience].secondaryIcon; },
});

function selectPublicAudience(template: any, audience: PublicAudience, shouldScroll: boolean): void {
  template.selectedAudience.set(audience);
  window.history.replaceState(window.history.state, '', audienceHash(audience));
  if (shouldScroll) {
    document.getElementById('publicAudiences')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

Template.publicLanding.events({
  'click [data-public-audience]'(event: Event, template: any) {
    const audience = (event.currentTarget as HTMLElement).dataset.publicAudience;
    if (!isPublicAudience(audience)) return;
    event.preventDefault();
    selectPublicAudience(template, audience, true);
  },
  'keydown [role="tab"]'(event: KeyboardEvent, template: any) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const selected = template.selectedAudience.get() as PublicAudience;
    const currentIndex = PUBLIC_AUDIENCES.indexOf(selected);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? PUBLIC_AUDIENCES.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + PUBLIC_AUDIENCES.length) % PUBLIC_AUDIENCES.length;
    const nextAudience = PUBLIC_AUDIENCES[nextIndex]!;
    selectPublicAudience(template, nextAudience, false);
    requestAnimationFrame(() => {
      document.getElementById(PUBLIC_AUDIENCE_PRESENTATIONS[nextAudience].tabId)?.focus();
    });
  },
});

Template.publicDemoLaunch.onCreated(function(this: any) {
  this.launching = new ReactiveVar(false);
  this.launchError = new ReactiveVar('');
  const stored = readStoredPublicDemo();
  this.expired = new ReactiveVar(Boolean(stored && new Date(stored.expiresAt).getTime() <= Date.now()));
  if (this.expired.get()) window.sessionStorage.removeItem('mofacts.publicDemo.v1');
});

Template.publicDemoLaunch.helpers({
  systemName,
  pt(key: PublicExperienceKey) { return currentPublicText(key); },
  demoTitle() { return demoCopy(currentDemoKind()).title; },
  demoDescription() { return demoCopy(currentDemoKind()).description; },
  isTeacher() { return currentDemoKind() === 'teacher'; },
  isResearcher() { return currentDemoKind() === 'researcher'; },
  launchError() { return (Template.instance() as any).launchError.get(); },
  expiredMessage() { return (Template.instance() as any).expired.get() ? currentPublicText('demoExpired') : ''; },
  signedInMessage() {
    const user = Meteor.user() as any;
    return user && user?.profile?.createdBy !== 'publicDemo' ? currentPublicText('demoSignedIn') : '';
  },
  startDisabled() {
    const instance = Template.instance() as any;
    const user = Meteor.user() as any;
    return instance.launching.get() || Boolean(user && user?.profile?.createdBy !== 'publicDemo');
  },
  startLabel() {
    if ((Template.instance() as any).launching.get()) return currentPublicText('demoStarting');
    const user = Meteor.user() as any;
    return user?.profile?.createdBy === 'publicDemo' && user?.profile?.publicDemoKind === currentDemoKind()
      ? currentPublicText('demoResume')
      : currentPublicText('demoStart');
  },
  launchStatus() { return (Template.instance() as any).launching.get() ? currentPublicText('demoStarting') : ''; },
});

Template.publicDemoLaunch.events({
  async 'click [data-public-demo-start]'(_event: Event, template: any) {
    const kind = currentDemoKind();
    if (!kind || template.launching.get()) return;
    const currentUser = Meteor.user() as any;
    if (currentUser && currentUser?.profile?.createdBy !== 'publicDemo') {
      FlowRouter.go('/home');
      return;
    }
    const definition = PUBLIC_DEMO_DEFINITIONS[kind];
    if (currentUser?.profile?.createdBy === 'publicDemo') {
      if (currentUser?.profile?.publicDemoKind === kind) {
        FlowRouter.go(definition.launchPath);
      } else {
        template.launchError.set(currentPublicText('demoSignedIn'));
      }
      return;
    }
    template.launching.set(true);
    template.launchError.set('');
    try {
      const result = await meteorCallAsync<PublicDemoLaunchResult>('startPublicDemo', { kind });
      if (!result?.loginToken) throw new Error(currentPublicText('demoFailed'));
      if (result.launchPath !== definition.launchPath) {
        throw new Error('The public demo launch contract returned an unexpected destination.');
      }
      Session.set('loginMode', 'experiment');
      Session.set('experimentTarget', definition.experimentTarget);
      Session.set('experimentXCond', '');
      Session.set('useEmbeddedAPIKeys', true);
      Session.set('curModule', 'experiment');
      setExperimentParticipantContext({ experimentTarget: definition.experimentTarget }, 'publicDemo.launch');
      Cookie.set('isExperiment', '1', 1);
      Cookie.set('experimentTarget', definition.experimentTarget, 1);
      Cookie.set('experimentXCond', '', 1);
      window.sessionStorage.setItem('mofacts.publicDemo.v1', JSON.stringify({ kind, experimentTarget: definition.experimentTarget, expiresAt: result.expiresAt }));
      const loginWithTokenAsync = (Meteor as any).promisify((Meteor as any).loginWithToken);
      await loginWithTokenAsync(result.loginToken);
      await completeExperimentSignIn();
    } catch (error: unknown) {
      clientConsole(1, '[PUBLIC-DEMO] launch failed', getErrorMessage(error));
      template.launchError.set(currentPublicText('demoFailed'));
      template.launching.set(false);
    }
  },
});
