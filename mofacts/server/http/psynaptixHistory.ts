/**
 * MoFaCTS core code -- AGPLv3 licensed.
 *
 * Psynaptix session-history ingestion (issue #560 / mofacts #M5).
 *
 * The psynaptix service writes a session summary to mofacts history on
 * session completion (server-to-server). This endpoint is the mofacts half
 * of that contract:
 *
 *   POST /api/psynaptix/history
 *   Authorization: Bearer <PSYNAPTIX_SERVICE_TOKEN>
 *   { sessionId, tdfId, userId, result, completedAt, eventId }
 *
 * Security:
 *  - The endpoint ONLY accepts the configured SERVICE token. The service
 *    token is validated CONSTANT-TIME (timingSafeEqual); missing/mismatched
 *    tokens get a uniform 401 with no token material echoed back. The
 *    learner-facing path (the browser) uses the short-lived capability from
 *    psynaptix #558/#566, never this token — this endpoint is
 *    server-to-server only.
 *  - The endpoint is DISABLED (503) when PSYNAPTIX_SERVICE_TOKEN is unset —
 *    there is no default/empty-token accept.
 *
 * Idempotency: the mofacts row carries psynaptixEventId (the psynaptix
 * #559 event id); a duplicate (sessionID + psynaptixEventId) returns 200
 * {duplicate:true} without a second insert.
 */

import { timingSafeEqual } from 'node:crypto';
import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import type { IncomingMessage, ServerResponse } from 'http';
import { Histories } from '../../common/Collections';
import {
  assertCanonicalHistoryEnvelope,
  validateHistoryWirePayload,
  withCanonicalHistorySchemaVersion,
} from '../../common/historyEnvelope';
import {
  sanitizePsynaptixSessionSummary,
  serializePsynaptixSessionSummary,
} from '../../common/psynaptixSessionSummary';
import {
  isPsynaptixPostprocessResult,
  mapPostprocessMetricsToProbabilityEstimate,
  sanitizePsynaptixPostprocessResult,
} from '../../common/psynaptixPostprocessMetrics';

const MAX_BODY_BYTES = 256 * 1024;

function configuredServiceToken(): string {
  return process.env.PSYNAPTIX_SERVICE_TOKEN ?? '';
}

/**
 * Constant-time bearer comparison. Length is compared first (fast fail) but
 * a mismatched length still runs a dummy compare so the timing does not leak
 * the token length.
 */
export function constantTimeEqual(expected: string, candidate: string): boolean {
  const exp = Buffer.from(expected, 'utf8');
  const cand = Buffer.from(candidate, 'utf8');
  if (exp.length !== cand.length) {
    timingSafeEqual(exp, exp); // burn comparable time on the mismatch path
    return false;
  }
  return timingSafeEqual(exp, cand);
}

/** Extract + validate the bearer token (constant-time). */
export function authorizeServiceToken(authHeader: string | undefined, expectedToken: string): boolean {
  if (!expectedToken) return false;
  const match = /^Bearer\s+(.+)$/.exec(authHeader ?? '');
  if (!match) return false;
  return constantTimeEqual(expectedToken, match[1] ?? '');
}

/**
 * Build the canonical mofacts history record from the psynaptix session
 * summary (issue #560 / mofacts #M5) or postprocess metrics (#589).
 * Exported for tests.
 */
export function buildPsynaptixHistoryRecord(body: Record<string, unknown>): Record<string, unknown> {
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
  const tdfId = typeof body.tdfId === 'string' ? body.tdfId.trim() : '';
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  const completedAt = typeof body.completedAt === 'string' ? body.completedAt : '';
  const ts = completedAt ? Date.parse(completedAt) : Date.now();

  // Issue #589: postprocess metrics export (raw + postprocessed markers).
  if (isPsynaptixPostprocessResult(body.result)) {
    const sanitized = sanitizePsynaptixPostprocessResult(body.result);
    if (!sanitized) {
      // Fall through to empty session-summary style rather than reject here —
      // the envelope validators still require a coherent record.
      const empty = {};
      const emptyJson = '{}';
      return withCanonicalHistorySchemaVersion({
        userId: userId || undefined,
        anonStudentId: userId || '',
        TDFId: tdfId || undefined,
        sessionID: sessionId,
        levelUnit: 0,
        levelUnitType: 'instruction',
        problemName: 'Postprocess metrics',
        stepName: 'Postprocess metrics',
        time: ts,
        problemStartTime: ts,
        selection: 'postprocess-metrics',
        action: 'exported',
        outcome: 'completed',
        typeOfResponse: 'psynaptix-postprocess',
        responseValue: emptyJson,
        input: emptyJson,
        displayedStimulus: null,
        eventType: 'psynaptix-postprocess',
        source: 'psynaptix-postprocess',
        psynaptixEventId: eventId,
        result: empty,
      } as Record<string, unknown>);
    }
    const resultJson = JSON.stringify(sanitized);
    const probabilityEstimate = sanitized.modelInput === 'performance'
      ? mapPostprocessMetricsToProbabilityEstimate(sanitized.metrics, sanitized.modelMapping)
      : undefined;
    return withCanonicalHistorySchemaVersion({
      userId: userId || undefined,
      anonStudentId: userId || '',
      TDFId: tdfId || undefined,
      sessionID: sessionId,
      levelUnit: 0,
      levelUnitType: 'instruction',
      problemName: 'Postprocess metrics',
      stepName: 'Postprocess metrics',
      time: ts,
      problemStartTime: ts,
      selection: sanitized.signalId,
      action: 'exported',
      outcome: 'completed',
      typeOfResponse: 'psynaptix-postprocess',
      responseValue: resultJson,
      input: resultJson,
      displayedStimulus: sanitized.formula,
      eventType: 'psynaptix-postprocess',
      source: 'psynaptix-postprocess',
      psynaptixEventId: eventId,
      result: sanitized,
      ...(probabilityEstimate !== undefined ? { probabilityEstimate } : {}),
    } as Record<string, unknown>);
  }

  const result = sanitizePsynaptixSessionSummary(body.result);
  const resultJson = serializePsynaptixSessionSummary(body.result);
  return withCanonicalHistorySchemaVersion({
    userId: userId || undefined,
    // Opaque Meteor userId is fine as a join key; never dump email/WorkerId here (#281/#286).
    anonStudentId: userId || '',
    TDFId: tdfId || undefined,
    sessionID: sessionId,
    levelUnit: 0,
    levelUnitType: 'instruction',
    problemName: 'Session summary',
    stepName: 'Session summary',
    time: ts,
    problemStartTime: ts,
    selection: 'session-summary',
    action: 'completed',
    outcome: 'completed',
    typeOfResponse: 'session-summary',
    responseValue: resultJson,
    input: resultJson,
    displayedStimulus: null,
    eventType: 'session-summary',
    source: 'psynaptix',
    psynaptixEventId: eventId,
    result,
  } as Record<string, unknown>);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function handleHistoryWrite(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }

  // --- Service-token auth (constant-time) ---
  const expected = configuredServiceToken();
  if (!expected) {
    sendJson(res, 503, { error: 'PSYNAPTIX_SERVICE_TOKEN is not configured' });
    return;
  }
  if (!authorizeServiceToken(req.headers.authorization, expected)) {
    sendJson(res, 401, { error: 'unauthorized' });
    return;
  }

  // --- Payload ---
  let body: Record<string, unknown>;
  try {
    const raw = await readBody(req);
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      sendJson(res, 400, { error: 'invalid JSON body' });
      return;
    }
    body = parsed as Record<string, unknown>;
  } catch (err) {
    sendJson(res, 400, { error: err instanceof Error ? err.message : 'invalid body' });
    return;
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';

  if (!sessionId || !eventId) {
    sendJson(res, 400, { error: 'sessionId and eventId are required' });
    return;
  }

  // --- Canonical history envelope (the same wire contract as the client) ---
  const record = buildPsynaptixHistoryRecord(body);

  try {
    assertCanonicalHistoryEnvelope(record);
    validateHistoryWirePayload(record);
  } catch (err) {
    sendJson(res, 400, { error: err instanceof Error ? err.message : 'invalid history record' });
    return;
  }

  // --- Idempotency: (sessionID, psynaptixEventId) ---
  try {
    const existing = await Histories.findOneAsync({
      sessionID: sessionId,
      psynaptixEventId: eventId,
    });
    if (existing) {
      sendJson(res, 200, { ok: true, duplicate: true });
      return;
    }
    const sanitized = Object.assign({}, record, {
      recordedServerTime: Date.now(),
      dynamicTagFields: [],
    });
    await Histories.insertAsync(sanitized);
    sendJson(res, 201, { ok: true });
  } catch (err) {
    Meteor._debug?.('[psynaptixHistory] insert failed', err);
    sendJson(res, 500, { error: 'history insert failed' });
  }
}

WebApp.connectHandlers.use('/api/psynaptix/history', (req: IncomingMessage, res: ServerResponse) => {
  void handleHistoryWrite(req, res).catch((err: unknown) => {
    sendJson(res, 500, { error: err instanceof Error ? err.message : 'internal error' });
  });
});
