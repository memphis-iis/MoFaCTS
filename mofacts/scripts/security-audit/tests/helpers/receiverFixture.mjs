import { createProtectedSecurityAuditReceiverV2, createSecurityAuditReceiverV2 } from '../../../../server/securityAudit/securityAuditReceiverV2.ts';
export const receiverClock = new Date('2026-11-05T12:02:00.000Z');
export const receiverSecret = 'synthetic-inert-receiver-signing-material';
const absent = { state: 'unavailable', reason: 'not-provided' };
export function receiverFixture({ build = absent, image = absent, protectedMetadata = false } = {}) {
  const rows = [], calls = [], names = [];
  const db = {
    find(selector, options) { calls.push({ kind: 'find', selector, options }); return { fetchAsync: async () => select(selector, options) }; },
    async findOneAsync(selector, options) { calls.push({ kind: 'one', selector, options }); return select(selector, options)[0]; },
    async insertAsync(row) {
      if (rows.some(old => old.ingestNonce === row.ingestNonce || old.reportId === row.reportId || old.digestSha256 === row.digestSha256)) {
        const error = new Error('Synthetic unique collision'); error.code = 11000; throw error;
      }
      rows.push(structuredClone(row));
    },
    rawCollection: () => ({ async createIndex() { calls.push({ kind: 'index' }); } }),
  };
  function select(selector, options = {}) {
    let result = rows.filter(row => Object.entries(selector).every(([key, value]) => row[key] === value));
    if (options.sort) result = [...result].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    if (options.limit !== undefined) result = result.slice(0, options.limit);
    return result.map(row => {
      if (!options.fields) return structuredClone(row);
      const value = {};
      for (const [key, include] of Object.entries(options.fields)) {
        if (!include) continue;
        const parts = key.split('.'); let source = row, target = value;
        for (const part of parts.slice(0, -1)) { source = source?.[part]; target[part] ??= {}; target = target[part]; }
        target[parts.at(-1)] = structuredClone(source?.[parts.at(-1)]);
      }
      return value;
    });
  }
  let isAdmin = true, identityCalls = 0;
  const deps = {
    createReports(name) { names.push(name); return db; },
    async requireAdminUser(userId) {
      if (userId !== 'synthetic-admin' || !isAdmin) throw Object.assign(new Error('Synthetic admin denial'), { error: 'not-authorized' });
    },
    targetOrigin: () => 'https://audit.example', ingestSecret: () => receiverSecret, now: () => new Date(receiverClock),
  };
  const receiver = protectedMetadata ? createProtectedSecurityAuditReceiverV2(deps) : createSecurityAuditReceiverV2({ ...deps,
    platformIdentity: async () => { identityCalls++; return image; }, loadBuildIdentity: async () => build });
  return { receiver, rows, calls, names, revoke: () => { isAdmin = false; }, identityCalls: () => identityCalls };
}
