import { createHash, randomBytes } from 'crypto';
import { prolificId, prolificCompletionUrl } from '../../common/prolific';
import { ProlificApiError, type prolificRequest } from './prolificApi';

type Dependencies = {
  operations: any;
  connection: (ownerId: string) => Promise<{ token: string; accountId: string }>;
  request: typeof prolificRequest;
  baseUrl: () => string;
  encrypt: (value: string) => string;
  decrypt: (value: string) => string;
  inspect: (ownerId: string, rootId: string) => Promise<{ name: string; revisions: Record<string, number> }>;
  configure: (ownerId: string, operation: any) => Promise<void>;
  audit: (action: string, actor: string, target: string | null, details?: any) => Promise<void>;
};
const kinds = ['test-participant', 'test-study'];
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function text(value: unknown, limit = 128) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error('prolific.invalidInput');
  return value.trim();
}
function codes(study: any): string[] {
  if (!Array.isArray(study?.completion_codes)) throw new Error('prolific.invalidConfiguration');
  return [...new Set<string>(study.completion_codes.map((item: any) => {
    const code = text(item?.code);
    prolificCompletionUrl(`https://app.prolific.com/submissions/complete?cc=${code}`);
    return code;
  }))];
}
function testLink(value: unknown, studyId: string) {
  const raw = text(value, 2048);
  const url = new URL(raw);
  if (url.protocol !== 'https:' || !['app.prolific.com', 'app.prolific.co'].includes(url.hostname)
    || url.username || url.password || url.port || url.search || url.hash || url.pathname !== `/studies/${studyId}/test`) {
    throw new Error('prolific.invalidConfiguration');
  }
  return raw;
}
function publicStatus(o: any) {
  return { id: o._id, kind: o.kind, status: o.status, phase: o.phase, sourceStudyId: o.sourceStudyId,
    studyId: o.studyId, rootTdfId: o.rootTdfId, participantId: o.participantId, testUrl: o.testUrl,
    launchUrl: o.launchUrl, completionCode: o.completionCode, completionCodes: o.completionCodes,
    workspaceId: o.workspaceId, projectId: o.projectId, lessonName: o.lessonName, draftName: o.draftName,
    errorKey: o.errorKey, createdAt: o.createdAt };
}

/** Owns durable test provisioning. Never retries an external creation after an uncertain result. */
export function createProlificTestSetup(deps: Dependencies) {
  const db = deps.operations;
  async function remoteDraft(ownerId: string, input: any) {
    const c = await deps.connection(ownerId);
    const workspaceId = prolificId(input.workspaceId), projectId = prolificId(input.projectId);
    const sourceStudyId = prolificId(input.sourceStudyId);
    // Verify the selected project directly, avoiding incomplete workspace pagination.
    const project = await deps.request(c.token, `projects/${projectId}/`);
    if (project.id !== projectId || project.workspace !== workspaceId) throw new Error('prolific.accessDenied');
    const remote = await deps.request(c.token, `studies/${sourceStudyId}/`);
    if (remote.id !== sourceStudyId || remote.project !== projectId) throw new Error('prolific.accessDenied');
    if (remote.status !== 'UNPUBLISHED') throw new Error('prolific.draftRequired');
    return { c, remote, workspaceId, projectId, sourceStudyId };
  }
  async function receipt(ownerId: string, requestId: string, fingerprint: string, data: any) {
    const existing = await db.findOneAsync({ ownerId, requestId });
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new Error('prolific.identityConflict');
      return existing;
    }
    const row = { _id: randomBytes(16).toString('hex'), ownerId, requestId, fingerprint, createdAt: new Date(), ...data };
    try { await db.insertAsync(row); }
    catch (error: any) {
      if (error?.code !== 11000) throw error;
      const concurrent = await db.findOneAsync({ ownerId, requestId });
      if (concurrent?.fingerprint === fingerprint) return concurrent;
      throw new Error('prolific.setupConflict');
    }
    return row;
  }
  async function fail(o: any, error: unknown, externalStarted: boolean) {
    const uncertain = error instanceof ProlificApiError ? error.uncertain : externalStarted;
    const errorKey = error instanceof Error && /^prolific\.[A-Za-z]+$/.test(error.message) ? error.message : 'prolific.failed';
    await db.updateAsync({ _id: o._id, status: 'sending' }, { $set: {
      status: uncertain ? 'review-required' : 'failed', errorKey,
    } });
  }
  async function participant(ownerId: string, input: any) {
    if (input?.operationId) {
      const previous = await db.findOneAsync({ _id: text(input.operationId), ownerId, kind: 'test-participant' });
      if (!previous) throw new Error('prolific.accessDenied');
      if (previous.status !== 'failed') return publicStatus(previous);
      input = { email: deps.decrypt(previous.emailEncrypted), requestId: previous.requestId };
    }
    const email = text(input?.email, 254);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('prolific.invalidInput');
    const requestId = text(input?.requestId);
    const c = await deps.connection(ownerId);
    const fingerprint = digest({ accountId: c.accountId, email: email.toLowerCase() });
    const o = await receipt(ownerId, requestId, fingerprint, { kind: 'test-participant', status: 'prepared',
      accountId: c.accountId, emailEncrypted: deps.encrypt(email), testParticipantKey: `${c.accountId}:${fingerprint}` });
    if (!await db.updateAsync({ _id: o._id, status: { $in: ['prepared', 'failed'] } }, { $set: { status: 'sending', sentAt: new Date() }, $unset: { errorKey: '' } })) return publicStatus(await db.findOneAsync({ _id: o._id }));
    let sent = false;
    try {
      sent = true;
      const result = await deps.request(c.token, 'researchers/participants/', { email: deps.decrypt(o.emailEncrypted) });
      const participantId = prolificId(result?.participant_id);
      await db.updateAsync({ _id: o._id, status: 'sending' }, { $set: { status: 'accepted', participantId }, $unset: { emailEncrypted: '' } });
      await deps.audit('prolific.testParticipant.created', ownerId, null, { operationId: o._id });
    } catch (error) { await fail(o, error, sent); }
    return publicStatus(await db.findOneAsync({ _id: o._id }));
  }
  async function prepare(ownerId: string, input: any) {
    const requestId = text(input?.requestId), rootTdfId = text(input?.rootTdfId);
    const context = await remoteDraft(ownerId, input);
    const lesson = await deps.inspect(ownerId, rootTdfId);
    const balance = await deps.request(context.c.token, `workspaces/${context.workspaceId}/balance/`);
    if (!['USD', 'GBP'].includes(balance?.currency_code)) throw new Error('prolific.invalidConfiguration');
    const completionCodes = codes(context.remote);
    const completionCode = input.completionCode || (completionCodes.length === 1 ? completionCodes[0] : undefined);
    if (!completionCode) return { status: 'choose-code', completionCodes };
    if (!completionCodes.includes(completionCode)) throw new Error('prolific.invalidConfiguration');
    const base = new URL(deps.baseUrl());
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('prolific.invalidConfiguration');
    const launchUrl = `${base.origin}/experiment/{{%STUDY_ID%}}?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}`;
    const reminderText = text(input.reminderText, 4500);
    const data = { kind: 'test-study', status: 'prepared', phase: 'draft', rootTdfId,
      accountId: context.c.accountId, workspaceId: context.workspaceId, projectId: context.projectId, currency: balance.currency_code,
      sourceStudyId: context.sourceStudyId, lessonName: lesson.name, revisions: lesson.revisions,
      draftName: text(context.remote.name, 1000), completionCode, completionCodes, launchUrl, reminderText,
      draftFingerprint: digest(context.remote), testRootKey: rootTdfId, testDraftKey: context.sourceStudyId };
    const previous = await db.findOneAsync({ testRootKey: rootTdfId });
    // A new explicit review can supersede an unsent or definitively failed setup.
    // Never release a reservation while a call is in flight or its outcome is unknown.
    if (previous && previous.requestId !== requestId) {
      if (previous.ownerId !== ownerId || previous.studyId || !['prepared', 'failed'].includes(previous.status)
        || previous.sourceStudyId !== context.sourceStudyId) throw new Error('prolific.setupConflict');
      if (!await db.updateAsync({ _id: previous._id, status: previous.status }, {
        $set: { status: 'reviewed', phase: 'superseded' }, $unset: { testRootKey: '', testDraftKey: '' },
      })) throw new Error('prolific.setupConflict');
    }
    const o = await receipt(ownerId, requestId, digest(data), data);
    return publicStatus(o);
  }
  async function execute(ownerId: string, input: any) {
    const id = text(input?.operationId);
    let o = await db.findOneAsync({ _id: id, ownerId, kind: 'test-study' });
    if (!o) throw new Error('prolific.accessDenied');
    if (!['prepared', 'failed', 'setup-incomplete'].includes(o.status)) return publicStatus(o);
    const c = await deps.connection(ownerId);
    if (c.accountId !== o.accountId) throw new Error('prolific.identityConflict');
    if (!await db.updateAsync({ _id: id, ownerId, status: o.status }, { $set: { status: 'sending', sentAt: new Date() } })) return publicStatus(await db.findOneAsync({ _id: id, ownerId }));
    let externalStarted = false;
    try {
      if (!o.studyId) {
        const current = await remoteDraft(ownerId, o);
        if (digest(current.remote) !== o.draftFingerprint) throw new Error('prolific.setupChanged');
        const lesson = await deps.inspect(ownerId, o.rootTdfId);
        if (digest(lesson.revisions) !== digest(o.revisions)) throw new Error('prolific.setupChanged');
        externalStarted = true;
        await deps.request(c.token, `studies/${o.sourceStudyId}/`, { external_study_url: o.launchUrl }, undefined, 'PATCH');
        const configured = await deps.request(c.token, `studies/${o.sourceStudyId}/`);
        if (configured.external_study_url !== o.launchUrl || configured.status !== 'UNPUBLISHED'
          || !codes(configured).includes(o.completionCode)) throw new Error('prolific.invalidConfiguration');
        await db.updateAsync({ _id: id }, { $set: { phase: 'creating', draftFingerprint: digest(configured) } });
        o.draftFingerprint = digest(configured);
        const result = await deps.request(c.token, `studies/${o.sourceStudyId}/test-study`, {});
        const studyId = prolificId(result?.study_id), testUrl = testLink(result?.study_url, studyId);
        await db.updateAsync({ _id: id }, { $set: { studyId, testUrl, phase: 'configuring' } });
        o = { ...o, studyId, testUrl };
      }
      const remote = await deps.request(c.token, `studies/${o.studyId}/`);
      if (remote.id !== o.studyId || remote.project !== o.projectId || remote.external_study_url !== o.launchUrl
        || !codes(remote).includes(o.completionCode)) throw new Error('prolific.invalidConfiguration');
      await deps.configure(ownerId, o);
      await db.updateAsync({ _id: id }, { $set: { status: 'ready', phase: 'complete' }, $unset: { errorKey: '' } });
      await deps.audit('prolific.testStudy.ready', ownerId, null, { operationId: id });
    } catch (error) {
      if (o.studyId) await db.updateAsync({ _id: id, status: 'sending' }, { $set: { status: 'setup-incomplete',
        errorKey: error instanceof Error && /^prolific\.[A-Za-z]+$/.test(error.message) ? error.message : 'prolific.setupIncomplete' } });
      else await fail(o, error, externalStarted);
    }
    return publicStatus(await db.findOneAsync({ _id: id, ownerId }));
  }
  async function status(ownerId: string) {
    return (await db.find({ ownerId, kind: { $in: kinds } }, { sort: { createdAt: -1 }, limit: 50 }).fetchAsync()).map(publicStatus);
  }
  return { participant, prepare, execute, status };
}
