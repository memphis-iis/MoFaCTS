import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { auditDigest } from '../../../common/securityAudit/canonicalReport.ts';
import { createAuditReportStoreV2 } from '../../../server/securityAudit/securityAuditReportStoreV2.ts';
import { auditDownloadBytesV2 } from '../../../server/securityAudit/securityAuditPresentationV2.ts';
import { errorReport, ingestionContext } from './fixtures/v2Fixtures.mjs';

const clock = new Date('2026-11-05T12:02:00.000Z');
async function resign(report) {
  const { digestSha256: _old, ...payload } = report;
  return { ...payload, digestSha256: await auditDigest(payload) };
}
function database(initial = []) {
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
const stored = report => ({...report,_id:'synthetic-id',ingestNonce:'synthetic-opaque-nonce-0001',ingestedAt:clock,expiresAt:new Date(clock.getTime()+90*86400000)});

test('V2 storage: independently validate before insertion, preserve flat report bytes and the existing TTL contract',async()=>{
  const report=await errorReport();const db=database();await db.store.ensureIndexes();
  await db.store.store(report,'synthetic-opaque-nonce-0001',ingestionContext);
  assert.deepEqual(await db.store.get(report.reportId),report);
  assert.equal(db.rows[0].expiresAt-db.rows[0].ingestedAt,90*86400000);
  assert.equal(Object.hasOwn(db.rows[0],'summary'),false);
  assert.equal(db.indexes.filter(i=>i.options?.unique).length,3);
  assert.ok(db.indexes.some(i=>i.keys.schema===1&&i.keys.catalogDigestSha256===1&&i.keys.completedAt===-1));
  await assert.rejects(db.store.store(report,'synthetic-opaque-nonce-0002',ingestionContext),error=>error.code===11000);
  const corrupt=structuredClone(report);corrupt.sections.external.controls.pop();
  await assert.rejects(db.store.store(corrupt,'synthetic-opaque-nonce-0003',ingestionContext));
  assert.equal(db.rows.length,1);
});

test('V2 summary reads use one exact schema/id lookup and never fetch controls or legacy rows', async () => {
  const report = await errorReport(), db = database([stored(report), { schema: 'SecurityAuditReportV1', reportId: 'retained-v1' }]);
  const result = await db.store.getSummary(report.reportId);
  assert.equal(result.reportId, report.reportId);
  assert.equal(Object.hasOwn(result, 'sections'), false);
  assert.equal(Object.hasOwn(result, 'evidence'), false);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].selector, { schema: 'SecurityAuditReportV2', reportId: report.reportId });
  assert.equal(db.calls[0].options.fields['sections.internal.status'], 1);
  assert.equal(db.calls[0].options.fields['sections.internal.controls'], undefined);
  assert.equal(await db.store.getSummary('retained-v1'), null);
  await assert.rejects(db.store.getSummary(''));
});

test('V2 storage: bounded projected history excludes V1 while indexed active latest is independent of the 200-row window',async()=>{
  const template=await errorReport();const rows=[];
  for(let i=0;i<201;i++)rows.push(stored(await resign({...template,reportId:`synthetic-history-${i}`})));
  const exposure=await errorReport('exposure');exposure.reportId='synthetic-earlier-exposure';
  exposure.startedAt='2026-11-05T11:59:00.000Z';exposure.completedAt='2026-11-05T12:00:00.000Z';
  rows.push(stored(await resign(exposure)));
  rows.push({schema:'SecurityAuditReportV1',reportType:'full',completedAt:'2050-01-01T00:00:00.000Z',reportId:'retained-v1'});
  const db=database(rows);const result=await db.store.list();
  assert.equal(result.reports.length,200);
  assert.equal(result.latestExposure.reportId,'synthetic-earlier-exposure');
  assert.equal(result.reports.some(r=>r.reportId==='retained-v1'),false);
  assert.equal(result.reports.some(r=>r.reportId==='synthetic-earlier-exposure'),false);
  assert.equal(JSON.stringify(result).includes('Synthetic contract qualification'),false);
  assert.equal(JSON.stringify(result).includes('synthetic-opaque-nonce'),false);
  assert.equal(await db.store.get('retained-v1'),null);
  for(const call of db.calls.filter(c=>c.options?.fields)) {
    assert.ok(Object.keys(call.options.fields).every(key=>!key.includes('controls')&&!key.includes('evidence')));
    assert.equal(call.options.fields.ingestNonce,undefined);
  }
  assert.equal(db.calls.filter(c=>c.kind==='one'&&c.selector.catalogDigestSha256).length,2);
});

test('V2 storage: corrupt selected reports and malformed summaries fail visibly without changing stored records',async()=>{
  const report=await errorReport();const row=stored(report);
  const db=database([row]);db.rows[0].sections.external.controls[0].evidence.summary='A changed observation.';
  await assert.rejects(db.store.get(report.reportId));
  db.rows[0].catalogVersion=999;
  await assert.rejects(db.store.list());
  assert.equal(db.rows.length,1);
});

test('V2 downloads: exact JSON/report digest, escaped HTML with no-script CSP, and independent byte checksum',async()=>{
  const report=await errorReport();report.sections.external.controls[0].evidence.summary='<img src=x onerror=alert(1)>';
  const valid=await resign(report);
  const json=await auditDownloadBytesV2(valid,'json');assert.deepEqual(JSON.parse(json.body.toString()),valid);
  assert.equal(json.sha256,crypto.createHash('sha256').update(json.body).digest('hex'));
  const exported=await auditDownloadBytesV2(valid,'html');const html=exported.body.toString();
  assert.ok(html.includes("content=\"default-src 'none'\""));assert.ok(html.includes('&lt;img'));
  assert.equal(html.includes('<img'),false);assert.ok(html.includes(valid.digestSha256));
  assert.ok(html.includes(valid.catalogDigestSha256));assert.ok(html.includes('Execution errors'));
  assert.ok(html.includes('external.dns-addresses'));
  const corrupt=structuredClone(valid);corrupt.digestSha256='0'.repeat(64);
  await assert.rejects(auditDownloadBytesV2(corrupt,'json'));
  await assert.rejects(auditDownloadBytesV2(valid,'pdf'));
});
