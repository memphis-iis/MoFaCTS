import { AUTHORIZATION_VERIFICATIONS } from '../../../common/securityAudit/verificationCatalog.ts';
import { proofRecord } from '../../../common/securityAudit/proofFields.ts';
import { auditReportId } from '../../../common/securityAudit/reportV2.ts';

const invalid = () => { throw new Error('Protected authorization bindings are invalid'); };
function text(value, max = 256) {
  if (typeof value !== 'string' || !value || value.length > max
    || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) invalid();
  return value;
}
export function parseAuthorizationBindingsV2(value) {
  const row = proofRecord(value, ['schema', 'actors', 'values']);
  if (row.schema !== 'MoFaCTSAuditAuthorizationBindingsV1') invalid();
  const actorNames = [...new Set(AUTHORIZATION_VERIFICATIONS.map(entry => entry.actor).filter(actor => actor !== 'anonymous'))];
  const actors = proofRecord(row.actors, actorNames), ids = new Set(), names = new Set();
  for (const name of actorNames) {
    const actor = parseAuthorizationActorBindingV2(actors[name]);
    if (ids.has(actor.userId) || names.has(actor.username)) invalid();
    ids.add(actor.userId); names.add(actor.username);
  }
  const aliases = [...new Set(AUTHORIZATION_VERIFICATIONS.flatMap(entry => entry.bindingAliases))];
  const values = proofRecord(row.values, aliases);
  text(values['lesson.progress'], 128);
  const progress = new Set();
  for (const name of ['learnerA', 'learnerB', 'teacherA', 'teacherB']) {
    const id = text(values[`progress.${name}`], 128);
    if (progress.has(id)) invalid(); progress.add(id);
  }
  const performance = proofRecord(values['performance.learnerB'], ['numCorrect', 'numIncorrect', 'stimsIntroduced', 'practiceDuration', 'totalStimCount']);
  if (Object.values(performance).some(number => typeof number !== 'number' || !Number.isFinite(number) || number < 0)
    || Number(performance.stimsIntroduced) < 1) invalid();
  const settings = proofRecord(values['settings.canary'], ['documentId', 'key', 'value']);
  text(settings.documentId, 128); text(settings.key, 128);
  if (!['string', 'number', 'boolean'].includes(typeof settings.value) || typeof settings.value === 'string' && settings.value.length > 256
    || typeof settings.value === 'number' && !Number.isFinite(settings.value)) invalid();
  const history = proofRecord(values['history.learnerA'], ['sha256']);
  if (typeof history.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(history.sha256)) invalid();
  const report = proofRecord(values['audit.report'], ['reportId', 'digestSha256']);
  auditReportId(report.reportId);
  if (typeof report.digestSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(report.digestSha256)) invalid();
  return structuredClone({ schema: row.schema, actors, values });
}

export function parseAuthorizationActorBindingV2(value) {
  const actor = proofRecord(value, ['userId', 'username', 'password']);
  text(actor.userId, 128); text(actor.username); text(actor.password, 1024);
  return structuredClone(actor);
}
