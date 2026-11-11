import { expect } from 'chai';
import sinon from 'sinon';
import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { Template } from 'meteor/templating';
import { Tracker } from 'meteor/tracker';
import type { AuditReportSummaryV2 } from '../../common/securityAudit/summaryTypes.ts';
import './adminSecurityAuditsV2';

declare const Blaze: any;

if (Meteor.isClient) describe('V2 security audit admin view rendered by Blaze', function () {
  let container: HTMLDivElement;
  let view: any;
  let call: sinon.SinonStub;
  let clock: sinon.SinonFakeTimers;
  let originalLocale: unknown;

  function report(reportType: 'exposure' | 'full'): AuditReportSummaryV2 {
    const time = new Date().toISOString();
    return {
      schema: 'SecurityAuditReportV2', catalogId: 'mofacts.security-audit', catalogVersion: 1,
      catalogDigestSha256: 'a'.repeat(64), reportId: `synthetic-${reportType}`, reportType,
      startedAt: time, completedAt: time, ingestedAt: time, target: 'https://audit.example.test',
      scannerSourceRevision: 'b'.repeat(40),
      deployedApplicationRevision: { state: 'observed', value: 'c'.repeat(40) },
      deployedImageDigest: { state: 'unavailable', reason: 'not-provided' },
      digestSha256: 'd'.repeat(64), executionErrorCount: 0, overallStatus: 'PASS',
      counts: { pass: 23, fail: 0, error: 0, notApplicable: 0, info: 0, low: 0, medium: 0, high: 0, critical: 0 },
      sectionStatuses: { external: 'PASS', authentication: 'NOT_APPLICABLE', internal: 'PASS', repository: 'NOT_APPLICABLE' },
    };
  }
  function snapshot() {
    const exposure = report('exposure'), full = report('full');
    full.deployedApplicationRevision = { state: 'conflicting', reason: 'independent-observations-disagree' };
    return { reports: [exposure, full], latestExposure: exposure, latestFull: full };
  }
  async function settle() {
    await new Promise(resolve => setTimeout(resolve, 0));
    Tracker.flush();
  }
  async function render() {
    view = Blaze.render((Template as any).adminSecurityAuditsV2, container);
    await settle();
    await settle();
  }
  beforeEach(() => {
    originalLocale = Session.get('uiLocale');
    Session.set('uiLocale', 'en');
    const helpers = (Template as any).adminSecurityAuditsV2.__helpers;
    const has = helpers.has.bind(helpers), get = helpers.get.bind(helpers);
    sinon.stub(helpers, 'has').callsFake((name: unknown) => name === 'isInRole' || has(name));
    sinon.stub(helpers, 'get').callsFake((name: unknown) => name === 'isInRole' ? () => true : get(name));
    call = sinon.stub(Meteor as any, 'callAsync');
    call.withArgs('admin.securityAudits.list').resolves(snapshot());
    clock = sinon.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    container = document.createElement('div');
    document.body.append(container);
  });
  afterEach(() => {
    if (view) Blaze.remove(view);
    view = null;
    container.remove();
    clock.restore();
    sinon.restore();
    Session.set('uiLocale', originalLocale);
  });

  it('renders independent latest cards, separate identities and both exact download formats', async () => {
    await render();
    const cards = container.querySelectorAll('.security-audit-latest-grid > section');
    expect(cards).to.have.length(2);
    expect(cards[0]!.getAttribute('aria-label')).to.equal('Latest exposure audit');
    expect(cards[1]!.getAttribute('aria-label')).to.equal('Latest full audit');
    const rows = container.querySelectorAll('.security-audit-history-row');
    expect(rows).to.have.length(2);
    const metadata = Array.from(rows[0]!.querySelectorAll('dl dd'), element => element.textContent);
    expect(metadata).to.deep.equal(['b'.repeat(40), 'c'.repeat(40), 'Unavailable', 'mofacts.security-audit / 1', 'a'.repeat(64), 'd'.repeat(64)]);
    expect(rows[1]!.querySelector('dl')!.textContent).to.contain('Conflicting observations');
    expect(Array.from(rows[0]!.querySelectorAll('button'), button => button.dataset.format)).to.deep.equal(['json', 'html']);
    expect(container.querySelector('.security-audit-announcement')!.getAttribute('aria-live')).to.equal('polite');
    expect(container.textContent).to.contain('This report is current.');
  });

  it('renders an empty history and independently missing latest cards', async () => {
    call.withArgs('admin.securityAudits.list').resolves({ reports: [], latestExposure: null, latestFull: null });
    await render();
    expect(container.textContent).to.contain('No exposure report has been received.');
    expect(container.textContent).to.contain('No full report has been received.');
    expect(container.textContent).to.contain('No security audit reports have been received.');
    expect(container.querySelector('.securityAuditDownload')).to.equal(null);
  });

  it('shows a rejected V1 response and retries using the V2 projection', async () => {
    call.withArgs('admin.securityAudits.list').onFirstCall().resolves({ generatedAt: new Date().toISOString(), reports: [] });
    await render();
    expect(container.textContent).to.contain('Failed to load security audit reports');
    container.querySelector<HTMLButtonElement>('.securityAuditRetry')!.click();
    await settle();
    expect(container.querySelectorAll('.security-audit-history-row')).to.have.length(2);
  });

  it('downloads only the selected report, prevents duplicate clicks and restores keyboard focus', async () => {
    let resolve!: (value: { url: string }) => void;
    call.withArgs('admin.securityAudits.downloadToken', 'synthetic-exposure', 'html').returns(new Promise(done => { resolve = done; }));
    const anchorClick = sinon.stub(HTMLAnchorElement.prototype, 'click');
    await render();
    const button = container.querySelector<HTMLButtonElement>('[data-report-id="synthetic-exposure"][data-format="html"]')!;
    button.click();
    button.click();
    expect(button.disabled).to.equal(true);
    expect(call.getCalls().filter(item => item.args[0] === 'admin.securityAudits.downloadToken').map(item => item.args))
      .to.deep.equal([['admin.securityAudits.downloadToken', 'synthetic-exposure', 'html']]);
    resolve({ url: '/__security-audit/download/synthetic-token' });
    await settle();
    expect(anchorClick.calledOnce).to.equal(true);
    expect((anchorClick.firstCall.thisValue as HTMLAnchorElement).getAttribute('href')).to.equal('/__security-audit/download/synthetic-token');
    expect(button.disabled).to.equal(false);
    expect(document.activeElement).to.equal(button);
    expect(container.querySelector('.security-audit-announcement')!.textContent).to.contain('download has started');
    call.withArgs('admin.securityAudits.downloadToken', 'synthetic-exposure', 'html').rejects(new Error('Synthetic denial'));
    button.click();
    await settle();
    expect(anchorClick.calledOnce).to.equal(true);
    expect(container.querySelector('.security-audit-announcement')!.textContent).to.contain('Synthetic denial');
    expect(document.activeElement).to.equal(button);
  });

  it('cancels polling and ignores a response arriving after the view is destroyed', async () => {
    let resolve!: (value: ReturnType<typeof snapshot>) => void;
    call.withArgs('admin.securityAudits.list').returns(new Promise(done => { resolve = done; }));
    await render();
    const instance = view.templateInstance();
    Blaze.remove(view);
    view = null;
    resolve(snapshot());
    await settle();
    clock.tick(10 * 60 * 1000);
    expect(instance.viewState.get().status).to.equal('loading');
    expect(call.getCalls().filter(item => item.args[0] === 'admin.securityAudits.list')).to.have.length(1);
  });
});
