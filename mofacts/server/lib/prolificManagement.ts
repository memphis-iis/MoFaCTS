import { createHash, randomBytes } from 'crypto';
import { prolificId, prolificAmount, prolificCompletionUrl } from '../../common/prolific';
import { prolificRequest, prolificPage, ProlificApiError } from './prolificApi';
import { ProlificConnections, ProlificStudies, ProlificParticipations, ProlificOperations, ProlificReminders } from './prolificCollections';
import { createProlificTestSetup } from './prolificTestSetup';

type Deps = {
  resolveExperimentTargetFamily: (target: string) => Promise<{ root: any } | null>;
  Tdfs: any; encrypt: (value: string) => string; decrypt: (value: string) => string;
  progress: (participation: any) => Promise<{ state: any; tdfId: string }>;
  audit: (action: string, actor: string | null, target: string | null, details?: any) => Promise<void>;
  request?: typeof prolificRequest;
  testExperiment?: Pick<Parameters<typeof createProlificTestSetup>[0], 'inspect' | 'configure' | 'baseUrl'>;
};
const stores = { connections: ProlificConnections, studies: ProlificStudies, participants: ProlificParticipations, operations: ProlificOperations, reminders: ProlificReminders };
function text(value: unknown, max = 5000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('prolific.invalidInput');
  return value.trim();
}
function page(value: unknown): number {
  const n = Number(value ?? 1);
  if (!Number.isSafeInteger(n) || n < 1 || n > 10000) throw new Error('prolific.invalidInput');
  return n;
}
const publicOperation = (o: any) => ({ id: o._id, kind: o.kind, status: o.status, rows: o.rows, currency: o.currency, quote: o.quote, createdAt: o.createdAt, outcomes: o.outcomes });

export function createProlificManagementService(deps: Deps, db = stores) {
  const request = deps.request || prolificRequest;
  async function connection(ownerId: string) {
    const c = await db.connections.findOneAsync({ ownerId });
    if (!c) throw new Error('prolific.connectionRequired');
    return { ...c, token: deps.decrypt(c.tokenEncrypted) };
  }
  function testing() {
    if (!deps.testExperiment) throw new Error('Prolific test setup dependencies are required');
    return createProlificTestSetup({ ...deps.testExperiment, operations: db.operations, connection,
      request, encrypt: deps.encrypt, decrypt: deps.decrypt, audit: deps.audit });
  }
  async function study(ownerId: string, rawId: unknown) {
    const studyId = prolificId(rawId);
    const binding = await db.studies.findOneAsync({ ownerId, studyId });
    if (!binding) throw new Error('prolific.accessDenied');
    const root = await deps.Tdfs.findOneAsync({ _id: binding.rootTdfId, ownerId });
    if (!root) throw new Error('prolific.accessDenied');
    const c = await connection(ownerId);
    const remote = await request(c.token, `studies/${studyId}/`);
    if (remote.id !== studyId || remote.project !== binding.projectId || c.accountId !== binding.accountId) throw new Error('prolific.accessDenied');
    return { binding, c, remote };
  }
  async function submission(token: string, studyId: string, id: string, participantId?: string) {
    const s = await request(token, `submissions/${prolificId(id)}/`);
    if (s.study_id !== studyId || s.id !== id || (participantId && s.participant !== participantId)) throw new Error('prolific.identityConflict');
    return s;
  }
  async function connect(ownerId: string, input: any) {
    const token = text(input?.token, 512);
    if (/\s/.test(token)) throw new Error('prolific.invalidInput');
    const me = await request(token, 'users/me/');
    const accountId = prolificId(me?.id);
    const existing = await db.connections.findOneAsync({ ownerId });
    if (existing && existing.accountId !== accountId && await db.studies.findOneAsync({ ownerId })) throw new Error('prolific.identityConflict');
    await db.connections.upsertAsync({ ownerId }, { $set: { accountId, tokenEncrypted: deps.encrypt(token), updatedAt: new Date() } });
    await deps.audit('prolific.connection.saved', ownerId, null);
    return { connected: true };
  }
  async function list(ownerId: string, input: any) {
    const c = await connection(ownerId);
    if (input?.kind === 'workspaces') {
      return prolificPage(await request(c.token, 'workspaces/')).results.map(r => ({ id: r.id, name: r.title }));
    }
    if (input?.kind === 'projects') {
      return prolificPage(await request(c.token, `workspaces/${prolificId(input.workspaceId)}/projects/`)).results.map(r => ({ id: r.id, name: r.title }));
    }
    if (input?.kind === 'studies') {
      const result = prolificPage(await request(c.token, `projects/${prolificId(input.projectId)}/studies/?page=${page(input.page)}&page_size=20`));
      return { ...result, results: result.results.map(r => ({ id: r.id, name: r.name, status: r.status })) };
    }
    if (input?.kind === 'lessons') {
      const after = typeof input.after === 'string' ? input.after : '';
      const rows = await deps.Tdfs.find({ ownerId, ...(after ? { _id: { $gt: after } } : {}) }, { fields: { 'content.tdfs.tutor.setspec.lessonname': 1, 'content.tdfs.tutor.setspec.experimentTarget': 1 }, sort: { _id: 1 }, limit: 21 }).fetchAsync();
      return { results: rows.slice(0, 20).map((r: any) => ({ id: r._id, name: r.content.tdfs.tutor.setspec.lessonname, target: r.content.tdfs.tutor.setspec.experimentTarget })), hasMore: rows.length > 20 };
    }
    throw new Error('prolific.invalidInput');
  }
  async function bind(ownerId: string, input: any) {
    const c = await connection(ownerId);
    const studyId = prolificId(input?.studyId), workspaceId = prolificId(input?.workspaceId), projectId = prolificId(input?.projectId);
    const projects = prolificPage(await request(c.token, `workspaces/${workspaceId}/projects/`)).results;
    if (!projects.some(p => p.id === projectId)) throw new Error('prolific.accessDenied');
    const remote = await request(c.token, `studies/${studyId}/`);
    if (remote.project !== projectId) throw new Error('prolific.accessDenied');
    const rootTdfId = text(input?.rootTdfId, 100);
    const root = (await deps.resolveExperimentTargetFamily(studyId))?.root;
    if (root?._id !== rootTdfId || root?.ownerId !== ownerId) throw new Error('prolific.accessDenied');
    const spec = root?.content?.tdfs?.tutor?.setspec;
    if (!spec || spec.experimentTarget?.toLowerCase() !== studyId || [true, 'true'].includes(spec.experimentPasswordRequired)) throw new Error('prolific.invalidConfiguration');
    prolificCompletionUrl(spec.prolificCompletionUrl);
    const balance = await request(c.token, `workspaces/${workspaceId}/balance/`);
    if (!['USD', 'GBP'].includes(balance?.currency_code)) throw new Error('prolific.invalidConfiguration');
    const reminderText = text(input?.reminderText, 4500);
    const existing = await db.studies.findOneAsync({ studyId });
    if (existing && (existing.ownerId !== ownerId || existing.rootTdfId !== rootTdfId || existing.accountId !== c.accountId || existing.projectId !== projectId || existing.workspaceId !== workspaceId)) throw new Error('prolific.identityConflict');
    await db.studies.upsertAsync({ studyId, ownerId, rootTdfId }, { $set: { workspaceId, projectId, accountId: c.accountId, currency: balance.currency_code, reminderText, updatedAt: new Date() } });
    await deps.audit('prolific.study.linked', ownerId, null);
    return { linked: true };
  }
  async function dashboard(ownerId: string, input: any) {
    const { binding, c, remote } = await study(ownerId, input?.studyId);
    const after = input?.after ? text(input.after, 100) : '';
    const participants = await db.participants.find({ studyId: binding.studyId, ...(after ? { _id: { $gt: after } } : {}) }, { sort: { _id: 1 }, limit: 21 }).fetchAsync();
    const results = [];
    // Bounded external requests; no broad publication of participant identities.
    for (const p of participants.slice(0, 20)) {
      const s = await submission(c.token, p.studyId, p.submissionId, p.participantId);
      results.push({ id: p._id, participantId: p.participantId, submissionId: p.submissionId, sessions: p.sessions?.length || 0, firstSessionCompletedAt: p.firstSessionCompletedAt, completedAt: p.completedAt, status: s.status, payment: s.payment_info?.status, bonuses: s.bonus_payments || [] });
    }
    const operations = await db.operations.find({ ownerId, studyId: binding.studyId }, { sort: { createdAt: -1 }, limit: 50 }).fetchAsync();
    const reminders = await db.reminders.find({ ownerId, studyId: binding.studyId }, { fields: { status: 1, dueAt: 1, participationId: 1 }, sort: { createdAt: -1 }, limit: 50 }).fetchAsync();
    return { results, hasMore: participants.length > 20, currency: binding.currency, name: remote.name, operations: operations.map(publicOperation), reminders };
  }
  async function messages(ownerId: string, input: any) {
    const { c, binding } = await study(ownerId, input?.studyId);
    const p = await db.participants.findOneAsync({ studyId: binding.studyId, submissionId: prolificId(input?.submissionId) });
    if (!p) throw new Error('prolific.accessDenied');
    await submission(c.token, p.studyId, p.submissionId, p.participantId);
    const result = prolificPage(await request(c.token, `messages/?user_id=${p.participantId}`));
    return result.results.filter(r => !r.data?.study_id || r.data.study_id === p.studyId).sort((a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at)).slice(-100).map(r => ({ id: r.id, body: r.body, sentAt: r.sent_at, participantId: p.participantId, unassignedStudy: !r.data?.study_id, fromResearcher: r.sender_id === c.accountId }));
  }
  async function prepare(ownerId: string, input: any) {
    const { c, binding } = await study(ownerId, input?.studyId);
    const kind = input?.kind;
    if (!['approve', 'bonus', 'message'].includes(kind) || !Array.isArray(input?.rows) || !input.rows.length || input.rows.length > 50) throw new Error('prolific.invalidInput');
    const requestId = text(input.requestId, 100);
    const rows = input.rows.map((row: any) => ({ submissionId: prolificId(row.submissionId), ...(kind === 'bonus' ? { cents: prolificAmount(row.amount) } : {}) }));
    if (new Set(rows.map((r: any) => r.submissionId)).size !== rows.length) throw new Error('prolific.invalidInput');
    const body = kind === 'message' ? text(input.body) : undefined;
    const fingerprint = createHash('sha256').update(JSON.stringify({ studyId: binding.studyId, kind, rows, body })).digest('hex');
    const duplicate = await db.operations.findOneAsync({ ownerId, requestId });
    if (duplicate) {
      if (duplicate.fingerprint !== fingerprint) throw new Error('prolific.identityConflict');
      return publicOperation(duplicate);
    }
    if (await db.operations.findOneAsync({ ownerId, studyId: binding.studyId, kind, status: { $in: ['sending', 'review-required'] }, 'rows.submissionId': { $in: rows.map((r: any) => r.submissionId) } })) throw new Error('prolific.reviewRequired');
    const participants = await db.participants.find({ studyId: binding.studyId, submissionId: { $in: rows.map((r: any) => r.submissionId) } }).fetchAsync();
    if (participants.length !== rows.length) throw new Error('prolific.accessDenied');
    for (const row of rows) {
      const p = participants.find((p: any) => p.submissionId === row.submissionId);
      const s = await submission(c.token, binding.studyId, row.submissionId, p.participantId);
      if (kind === 'approve' && s.status !== 'AWAITING REVIEW') throw new Error('prolific.notAwaitingReview');
      row.participantId = p.participantId;
    }
    const id = randomBytes(16).toString('hex');
    await db.operations.insertAsync({ _id: id, ownerId, requestId, fingerprint, studyId: binding.studyId, kind, rows, currency: binding.currency, ...(body ? { bodyEncrypted: deps.encrypt(body) } : {}), status: 'preparing', createdAt: new Date() });
    try {
      let quote;
      if (kind === 'bonus') {
        quote = await request(c.token, 'submissions/bonus-payments/', { study_id: binding.studyId, csv_bonuses: rows.map((r: any) => `${r.submissionId},${(r.cents / 100).toFixed(2)}`).join('\n') });
        // Prolific can quote fractional cents for fees/tax. Require the full
        // breakdown for confirmation, without silently inventing missing costs.
        if (!quote?.id || ![quote.amount, quote.fees, quote.vat, quote.total_amount].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER)
          || quote.amount !== rows.reduce((sum: number, row: any) => sum + row.cents, 0)
          || quote.total_amount < quote.amount || (quote.study && quote.study !== binding.studyId)) throw new Error('prolific.remoteFailed');
        quote = { id: prolificId(quote.id), amount: quote.amount, fees: quote.fees, vat: quote.vat, total: quote.total_amount };
      }
      await db.operations.updateAsync({ _id: id }, { $set: { status: 'prepared', ...(quote ? { quote } : {}) } });
      await deps.audit('prolific.operation.prepared', ownerId, null, { operationId: id, kind, count: rows.length });
      return publicOperation(await db.operations.findOneAsync({ _id: id }));
    } catch (error) {
      await db.operations.updateAsync({ _id: id }, { $set: { status: 'failed' } });
      throw error;
    }
  }
  async function confirm(ownerId: string, input: any) {
    const id = text(input?.operationId, 100);
    const op = await db.operations.findOneAsync({ _id: id, ownerId });
    if (!op) throw new Error('prolific.accessDenied');
    const { c } = await study(ownerId, op.studyId);
    if (op.status !== 'prepared') return publicOperation(op);
    // Atomic claim plus a unique active-study index serializes confirmations across replicas.
    // Unknown outcomes retain the claim until the researcher records an external review.
    try {
      if (!await db.operations.updateAsync({ _id: id, ownerId, status: 'prepared' }, { $set: { status: 'sending', sentAt: new Date(), activeStudy: op.studyId } })) return publicOperation(await db.operations.findOneAsync({ _id: id, ownerId }));
    } catch (error: any) {
      if (error?.code === 11000) throw new Error('prolific.reviewRequired');
      throw error;
    }
    const outcomes = [];
    try {
      if (op.kind === 'bonus') {
        for (const row of op.rows) await submission(c.token, op.studyId, row.submissionId, row.participantId);
        await request(c.token, `bulk-bonus-payments/${prolificId(op.quote.id)}/pay/`, {});
      } else {
        for (const row of op.rows) {
          const s = await submission(c.token, op.studyId, row.submissionId, row.participantId);
          if (op.kind === 'approve') {
            if (s.status !== 'AWAITING REVIEW') throw new Error('prolific.notAwaitingReview');
            await request(c.token, `submissions/${row.submissionId}/transition/`, { action: 'APPROVE' });
          } else {
            await request(c.token, 'messages/', { recipient_id: row.participantId, study_id: op.studyId, body: deps.decrypt(op.bodyEncrypted) });
          }
          outcomes.push({ submissionId: row.submissionId, status: 'accepted' });
          await db.operations.updateAsync({ _id: id }, { $set: { outcomes } });
        }
      }
      await db.operations.updateAsync({ _id: id }, { $set: { status: 'accepted', outcomes } });
      await deps.audit('prolific.operation.accepted', ownerId, null, { operationId: id, kind: op.kind, count: op.rows.length });
    } catch (error) {
      await db.operations.updateAsync({ _id: id }, { $set: { status: error instanceof ProlificApiError && !error.uncertain && !outcomes.length ? 'failed' : 'review-required', outcomes } });
      await deps.audit('prolific.operation.review', ownerId, null, { operationId: id });
    }
    const result = await db.operations.findOneAsync({ _id: id });
    if (result.status !== 'review-required') await db.operations.updateAsync({ _id: id }, { $unset: { activeStudy: 1 } });
    return publicOperation(result);
  }
  async function review(ownerId: string, input: any) {
    const id = text(input?.operationId, 100);
    const op = await db.operations.findOneAsync({ _id: id, ownerId });
    if (!op) throw new Error('prolific.accessDenied');
    await study(ownerId, op.studyId);
    const note = text(input?.note, 1000);
    if (!['review-required', 'accepted', 'failed'].includes(op.status)) throw new Error('prolific.invalidInput');
    // This records a human review, never fabricates a provider-confirmed payment or resends it.
    await db.operations.updateAsync({ _id: id, ownerId, status: op.status }, { $set: { status: 'reviewed', reviewedAt: new Date(), reviewNoteEncrypted: deps.encrypt(note) } });
    await db.operations.updateAsync({ _id: id }, { $unset: { activeStudy: 1 } });
    await deps.audit('prolific.operation.reviewed', ownerId, null, { operationId: id });
    return { reviewed: true };
  }
  async function retryReminder(ownerId: string, input: any) {
    const id = text(input?.reminderId, 100);
    const reminder = await db.reminders.findOneAsync({ _id: id, ownerId });
    if (!reminder) throw new Error('prolific.accessDenied');
    await study(ownerId, reminder.studyId);
    if (!await db.reminders.updateAsync({ _id: id, ownerId, status: 'failed' }, { $set: { status: 'pending' } })) throw new Error('prolific.reviewRequired');
    await deps.audit('prolific.reminder.retry', ownerId, null, { reminderId: id });
    return { queued: true };
  }
  async function processReminders() {
    // A crashed claimed send remains visible for review; it is never automatically resent.
    for (const [collection, age] of [[db.reminders, 120000], [db.operations, 3600000]] as const) {
      const stale = await collection.find({ status: 'sending', sentAt: { $lt: new Date(Date.now() - age) } }, { fields: { _id: 1, kind: 1, studyId: 1 }, limit: 50 }).fetchAsync();
      const resumable = stale.filter((r: any) => r.kind === 'test-study' && r.studyId).map((r: any) => r._id);
      const uncertain = stale.filter((r: any) => !resumable.includes(r._id)).map((r: any) => r._id);
      if (resumable.length) await collection.updateAsync({ _id: { $in: resumable }, status: 'sending' }, { $set: { status: 'setup-incomplete' } }, { multi: true });
      if (uncertain.length) await collection.updateAsync({ _id: { $in: uncertain }, status: 'sending' }, { $set: { status: 'review-required' } }, { multi: true });
    }
    const due = await db.reminders.find({ status: 'pending', dueAt: { $lte: new Date() } }, { sort: { dueAt: 1 }, limit: 20 }).fetchAsync();
    for (const item of due) {
      if (!await db.reminders.updateAsync({ _id: item._id, status: 'pending' }, { $set: { status: 'sending', sentAt: new Date() } })) continue;
      let sendStarted = false;
      try {
        const p = await db.participants.findOneAsync({ _id: item.participationId });
        if (!p || p.completedAt) {
          await db.reminders.updateAsync({ _id: item._id }, { $set: { status: 'cancelled' } });
          continue;
        }
        const current = await deps.progress(p);
        if (current.tdfId !== item.tdfId || Number(current.state.currentUnitNumber) !== item.unit) {
          await db.reminders.updateAsync({ _id: item._id }, { $set: { status: 'cancelled' } });
          continue;
        }
        const { c } = await study(item.ownerId, item.studyId);
        await submission(c.token, p.studyId, p.submissionId, p.participantId);
        sendStarted = true;
        await request(c.token, 'messages/', { recipient_id: p.participantId, study_id: p.studyId, body: deps.decrypt(item.bodyEncrypted) });
        await db.reminders.updateAsync({ _id: item._id }, { $set: { status: 'sent' } });
      } catch (error) {
        await db.reminders.updateAsync({ _id: item._id }, { $set: { status: (error instanceof ProlificApiError ? error.uncertain : sendStarted) ? 'review-required' : 'failed' } });
      }
    }
  }
  return { connect, list, bind, dashboard, messages, prepare, confirm, review, retryReminder, processReminders,
    createTestParticipant: (ownerId: string, input: unknown) => testing().participant(ownerId, input),
    prepareTestStudy: (ownerId: string, input: unknown) => testing().prepare(ownerId, input),
    executeTestStudy: (ownerId: string, input: unknown) => testing().execute(ownerId, input),
    testSetupStatus: (ownerId: string) => testing().status(ownerId),
  };
}
