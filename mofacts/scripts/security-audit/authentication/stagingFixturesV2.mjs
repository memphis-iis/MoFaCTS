import { randomBytes } from 'node:crypto';
import { AUTHORIZATION_VERIFICATIONS } from '../../../common/securityAudit/verificationCatalog.ts';
import { proofRecord, proofString } from '../../../common/securityAudit/proofFields.ts';

export const STAGING_FIXTURE_ACTORS_V2 = Object.freeze([...new Set(AUTHORIZATION_VERIFICATIONS.map(row => row.actor)
  .filter(actor => !['anonymous', 'admin'].includes(actor)))].sort());

export function fixtureNamespaceV2(value = `mofacts_audit_fixture_${randomBytes(6).toString('hex')}`) {
  if (typeof value !== 'string' || !/^mofacts_audit_fixture_[a-f0-9]{12}$/.test(value)) throw new Error('Invalid staging authorization fixture namespace');
  return value;
}
export function createFixtureCredentialsV2(namespace) {
  fixtureNamespaceV2(namespace);
  const aliases = STAGING_FIXTURE_ACTORS_V2;
  if (aliases.length !== 4 || aliases.filter(actor => actor.startsWith('teacher')).length !== 2) throw new Error('Fixture access scope needs review');
  return Object.fromEntries(aliases.map(alias => [alias, {
    username: `${namespace}-${alias.toLowerCase()}@localhost.invalid`, password: randomBytes(32).toString('base64url'),
  }]));
}
export function parseFixtureActorV2(value, namespace) {
  fixtureNamespaceV2(namespace);
  const actor = proofRecord(value, ['alias', 'userId', 'username']);
  if (!STAGING_FIXTURE_ACTORS_V2.includes(actor.alias)
    || actor.username !== `${namespace}-${actor.alias.toLowerCase()}@localhost.invalid`) throw new Error('Invalid owned fixture actor');
  proofString(actor.userId, /^[A-Za-z0-9_-]+$/, 128); return actor;
}

// Synthetic trial state only; no TDF, course, existing learner, model or provider
// configuration is changed. The actual source owner validates the canonical
// history before its expected download is rendered.
export function createFixtureHistoryV2({ namespace, userId, alias, now = Date.now() }) {
  fixtureNamespaceV2(namespace);
  if (!['learnerA', 'learnerB'].includes(alias) || typeof userId !== 'string' || !userId
    || userId.length > 128 || !Number.isSafeInteger(now) || now < 0) throw new Error('Invalid synthetic history binding');
  return { _id: `${namespace}-history-${alias}`, historySchemaVersion: 1,
    stimuliSetId: `${namespace}-set`, stimulusKC: `${namespace}-kc`, clusterKC: `${namespace}-cluster`, KCId: `${namespace}-kc`,
    userId, TDFId: `${namespace}-lesson`, outcome: 'correct', probabilityEstimate: 0.5,
    typeOfResponse: 'text', responseValue: `${namespace}-${alias}-answer`, displayedStimulus: { text: `${namespace}-prompt` },
    anonStudentId: `${namespace}-${alias}`, sessionID: `${namespace}-session-${alias}`, responseDuration: 300,
    levelUnit: 0, levelUnitName: 'Synthetic qualification', levelUnitType: 'model', problemName: `${namespace}-prompt`, stepName: `${namespace}-prompt`,
    time: now, problemStartTime: now - 1000, selection: 'answer', action: 'respond', input: `${namespace}-${alias}-answer`,
    studentResponseType: 'ATTEMPT', studentResponseSubtype: 'T', tutorResponseType: 'RESULT',
    KCDefault: `${namespace}-kc`, KCCategoryDefault: '', KCCluster: `${namespace}-cluster`, KCCategoryCluster: '',
    CFStartLatency: 100, CFEndLatency: 500, CFFeedbackLatency: 250, feedbackText: 'Correct', feedbackType: 'correct', entryPoint: 'direct', eventType: '' };
}
