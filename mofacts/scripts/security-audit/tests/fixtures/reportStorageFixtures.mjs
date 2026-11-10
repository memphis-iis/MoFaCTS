import { auditDigest } from '../../../../common/securityAudit/canonicalReport.ts';
import { createAuditReportStoreV2 } from '../../../../server/securityAudit/securityAuditReportStoreV2.ts';

const clock = new Date('2026-11-05T12:02:00.000Z');
export async function resign(report) {
  const { digestSha256: _old, ...payload } = report;
  return { ...payload, digestSha256: await auditDigest(payload) };
}
export function database(initial = []) {
  const rows = structuredClone(initial), calls = [], indexes = [];
  function select(selector, options = {}) {
    let matches = rows.filter(row => Object.entries(selector).every(([key, value]) => row[key] === value));
    if (options.sort) matches = [...matches].sort((a,b) => b.completedAt.localeCompare(a.completedAt));
    if (options.limit !== undefined) matches = matches.slice(0,options.limit);
    return matches.map(row => {
      if (!options.fields) return structuredClone(row);
      const projected = {};
      for (const [key,include] of Object.entries(options.fields)) {
        if (!include) continue;
        const parts = key.split('.'); let source=row, destination=projected;
        for (const part of parts.slice(0,-1)) { source=source?.[part]; destination[part]??={}; destination=destination[part]; }
        destination[parts.at(-1)] = structuredClone(source?.[parts.at(-1)]);
      }
      return projected;
    });
  }
  const reports = {
    find(selector, options) { calls.push({kind:'list',selector:structuredClone(selector),options:structuredClone(options)});return {fetchAsync:async()=>select(selector,options)}; },
    async findOneAsync(selector,options) { calls.push({kind:'one',selector:structuredClone(selector),options:structuredClone(options)});return select(selector,options)[0]; },
    async insertAsync(row) {
      if (rows.some(old=>old.reportId===row.reportId||old.digestSha256===row.digestSha256||old.ingestNonce===row.ingestNonce)) {
        const error=new Error('Duplicate synthetic audit identity');error.code=11000;throw error;
      }
      rows.push(structuredClone(row));return 'synthetic-row';
    },
    rawCollection:()=>({async createIndex(keys,options){indexes.push({keys,options});}}),
  };
  return {rows,calls,indexes,store:createAuditReportStoreV2(reports,()=>new Date(clock))};
}
export const stored = report => ({...report,_id:'synthetic-id',ingestNonce:'synthetic-opaque-nonce-0001',ingestedAt:clock,expiresAt:new Date(clock.getTime()+90*86400000)});
