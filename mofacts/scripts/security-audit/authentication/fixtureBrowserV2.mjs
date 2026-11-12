import { auditTargetOrigin } from '../../../common/securityAudit/reportV2.ts';
import { proofRecord, proofString } from '../../../common/securityAudit/proofFields.ts';
import { fixtureNamespaceV2, parseFixtureActorV2 } from './stagingFixturesV2.mjs';
import { validateAuthorizationActorPageV2 } from './browserV2.mjs';

const invalid = () => { throw new Error('Staging fixture account operation failed'); };
async function requireAdmin(page, target, adminUserId) {
  if (await validateAuthorizationActorPageV2(page, target, 'admin', adminUserId) !== 'matched') invalid();
}
async function administrativeCall(page, origin, adminUserId, method, args) {
  try {
    return await page.evaluate(async ({ origin, adminUserId, method, args }) => {
      if (location.origin !== origin || !globalThis.Meteor.status().connected || globalThis.Meteor.userId() !== adminUserId) throw new Error('Fixture actor changed');
      let timer;
      try { return await Promise.race([globalThis.Meteor.callAsync(method, ...args),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Fixture call timed out')), 15000); })]); }
      finally { clearTimeout(timer); }
    }, { origin, adminUserId, method, args });
  } catch { invalid(); }
}

// Use a separate authenticated creator context: native createUser changes only
// that connection's login. No email option is sent, so the installed native
// createUserVerifyingEmail owner makes no verification/enrollment mail request.
// This is insert-only; the admin upsert/password-reset method is never used.
export async function createFixtureAccountV2({ page, target, adminUserId, namespace, alias, credential }) {
  fixtureNamespaceV2(namespace); const origin = auditTargetOrigin(target);
  const input = proofRecord(credential, ['username', 'password']);
  if (!['learnerA', 'learnerB', 'teacherA', 'teacherB'].includes(alias)
    || input.username !== `${namespace}-${alias.toLowerCase()}@localhost.invalid`) invalid();
  proofString(input.password, /^[A-Za-z0-9_-]{43}$/, 43);
  await requireAdmin(page, origin, adminUserId);
  let userId;
  try {
    userId = await page.evaluate(async ({ origin, adminUserId, username, password }) => {
      if (location.origin !== origin || !globalThis.Meteor.status().connected || globalThis.Meteor.userId() !== adminUserId) throw new Error('Fixture creator changed');
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
      let timer;
      try {
        const result = await Promise.race([globalThis.Meteor.callAsync('createUser', { username,
          password: { digest, algorithm: 'sha-256' }, profile: { experiment: false, createdBy: adminUserId } }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Fixture creation timed out')), 15000); })]);
        return result?.id;
      } finally { clearTimeout(timer); }
    }, { origin, adminUserId, username: input.username, password: input.password });
  } catch { invalid(); }
  const actor = parseFixtureActorV2({ alias, userId, username: input.username }, namespace);
  if (actor.userId === adminUserId) invalid(); return actor;
}

export async function grantFixtureTeacherV2({ page, target, adminUserId, namespace, actor, requireOwnedActor }) {
  const owned = parseFixtureActorV2(actor, namespace), origin = auditTargetOrigin(target);
  if (!['teacherA', 'teacherB'].includes(owned.alias) || typeof requireOwnedActor !== 'function') invalid();
  await requireAdmin(page, origin, adminUserId);
  if (await requireOwnedActor(owned) !== true) invalid();
  const result = await administrativeCall(page, origin, adminUserId, 'userAdminRoleChange', [owned.userId, 'add', 'teacher']);
  if (result?.RESULT !== 'SUCCESS' || result.targetUserId !== owned.userId
    || result.targetRoles?.teacher !== true || result.targetRoles?.admin !== false) invalid();
}

export async function removeFixtureAccountV2({ page, target, adminUserId, namespace, actor, requireOwnedActor }) {
  const owned = parseFixtureActorV2(actor, namespace), origin = auditTargetOrigin(target);
  if (owned.userId === adminUserId || typeof requireOwnedActor !== 'function') invalid();
  await requireAdmin(page, origin, adminUserId);
  if (await requireOwnedActor(owned) !== true) invalid();
  const result = await administrativeCall(page, origin, adminUserId, 'userAdminDeleteUser', [owned.userId]);
  if (result?.RESULT !== 'SUCCESS' || result.targetUserId !== owned.userId) invalid();
}
