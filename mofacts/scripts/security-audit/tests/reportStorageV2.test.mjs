import assert from 'node:assert/strict';
import test from 'node:test';
import { database, resign, stored } from './fixtures/reportStorageFixtures.mjs';
import { errorReport, ingestionContext } from './fixtures/v2Fixtures.mjs';

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
