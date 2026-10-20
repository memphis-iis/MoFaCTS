import { expect } from 'chai';
import { createRecoverableWarningMethods } from './recoverableWarningMethods';
import { RECOVERABLE_WARNING_ACTION, type RecoverableWarning, type RecoverableWarningRow, type SparcOutputLimitWarning } from '../../common/recoverableWarnings';

function fixture(rows: RecoverableWarningRow[] = []) {
  const writes: Record<string, unknown>[] = [];
  const reads: Array<{ selector: Record<string, unknown>; options: Record<string, unknown> }> = [];
  const methods = createRecoverableWarningMethods({
    auditLog: {
      async insertAsync(document) { writes.push(document); return 'event-1'; },
      find(selector, options) { reads.push({ selector, options }); return { fetchAsync: async () => rows }; },
    },
    async requireAdminUser(userId) { if (userId !== 'admin') throw new Error('Admin access required'); },
  });
  return { writes, reads, methods };
}
const warning = { code: 'autotutor.citationMismatch' as const, tdfId: 'tdf-demo', mismatchCount: 2 };
async function rejected(operation: () => Promise<unknown>) {
  let failure: unknown;
  try { await operation(); } catch (error) { failure = error; }
  expect(failure).to.be.instanceOf(Error);
}

describe('recoverable warning log methods', function() {
  it('stores text-free output-limit outcomes and rejects forged, unbounded, or text-bearing metadata', async function() {
    const { methods, writes } = fixture();
    const outputWarning: SparcOutputLimitWarning = { code: 'autotutor.outputLimit', tdfId: 'tdf-demo',
      operation: 'utterance', field: 'tutorMessage', unit: 'json-utf8-bytes', observedSize: 2050,
      limit: 2048, attempts: 2, outcome: 'regenerated' };
    for (const outcome of ['regenerated', 'retry-needed', 'failed'] as const) {
      await methods.reportRecoverableWarning.call({ userId: 'learner' }, { ...outputWarning, outcome });
    }
    expect(writes).to.have.length(3);
    expect(writes[0]!.details).to.deep.equal(outputWarning);
    expect(writes[0]!.actorUserId).to.equal('learner');
    for (const payload of [
      { ...outputWarning, text: 'Never accept student or tutor text' },
      { ...outputWarning, field: 'arbitrary text' },
      { ...outputWarning, operation: 'arbitrary operation' },
      { ...outputWarning, outcome: 'unknown' },
      { ...outputWarning, unit: 'unknown' },
      { ...outputWarning, attempts: 100 },
      { ...outputWarning, observedSize: 10000001 },
      { ...outputWarning, limit: -1 },
      { ...outputWarning, observedSize: 2048 },
      { ...outputWarning, observedSize: 1.5 },
      { ...outputWarning, createdAt: new Date() },
      { ...outputWarning, actorUserId: 'another-user' },
    ]) await rejected(() => methods.reportRecoverableWarning.call({ userId: 'learner' }, payload as RecoverableWarning));
    await rejected(() => methods.reportRecoverableWarning.call({}, outputWarning));
    expect(writes).to.have.length(3);
  });
  it('accepts bounded authenticated reports and derives identity and time on the server', async function() {
    const { methods, writes } = fixture();
    await methods.reportRecoverableWarning.call({ userId: 'learner' }, warning);
    expect(writes).to.have.length(1);
    expect(writes[0]).to.include({ action: RECOVERABLE_WARNING_ACTION, actorUserId: 'learner', origin: 'client' });
    expect(writes[0]!.details).to.deep.equal(warning);
    expect(writes[0]!.createdAt).to.be.instanceOf(Date);
  });

  it('rejects anonymous, unknown, oversized and text-bearing reports', async function() {
    const { methods, writes } = fixture();
    await rejected(() => methods.reportRecoverableWarning.call({}, warning));
    for (const payload of [
      { ...warning, code: 'arbitrary.event' },
      { ...warning, mismatchCount: 0 },
      { ...warning, mismatchCount: 10001 },
      { ...warning, tdfId: 'x'.repeat(129) },
      { ...warning, quote: 'Student text must never be retained here.' },
      { ...warning, actorUserId: 'another-user' },
    ]) {
      await rejected(() => methods.reportRecoverableWarning.call({ userId: 'learner' }, payload as typeof warning));
    }
    expect(writes).to.deep.equal([]);
  });

  it('denies non-admin reads before querying and uses bounded chronological cursor pages', async function() {
    const createdAt = new Date('2026-09-13T00:00:00Z');
    const rows = Array.from({ length: 51 }, (_, index) => ({ _id: `event-${index}`, createdAt, details: warning }));
    const { methods, reads } = fixture(rows);
    for (const userId of [null, 'learner']) {
      await rejected(() => methods.getRecoverableWarnings.call({ userId }));
    }
    expect(reads).to.deep.equal([]);
    const page = await methods.getRecoverableWarnings.call({ userId: 'admin' });
    expect(page.rows).to.have.length(50);
    expect(page.nextCursor).to.deep.equal({ createdAt, id: 'event-49' });
    expect(reads[0]).to.deep.equal({
      selector: { action: RECOVERABLE_WARNING_ACTION },
      options: { sort: { createdAt: -1, _id: -1 }, limit: 51, fields: { _id: 1, createdAt: 1, details: 1 } },
    });
    await methods.getRecoverableWarnings.call({ userId: 'admin' }, page.nextCursor);
    expect(reads[1]!.selector.$or).to.deep.equal([
      { createdAt: { $lt: createdAt } }, { createdAt, _id: { $lt: 'event-49' } },
    ]);
  });
});
