import { normalizeSavedUnitNumber, savedLessonCompleted } from '../../common/experimentCompletion';
import { pickTimingRuntimeSettings } from '../../common/deliveryTimingSettings';
import { createHash, randomBytes } from 'crypto';
import { Meteor } from 'meteor/meteor';
import { prolificId, prolificCompletionUrl } from '../../common/prolific';
import { restoreAdaptiveUnitSequence } from '../../common/adaptiveUnitSequence';
import { ProlificParticipations, ProlificStudies, ProlificReminders } from './prolificCollections';

export type ProlificParticipantDeps = {
  Tdfs: any; states: any; users: any;
  resolveExperimentTargetFamily: (target: string) => Promise<{ root: any } | null>;
  createUser: (username: string, password: string, profile: any, options: any) => Promise<string>;
  issueToken: (userId: string) => Promise<string>;
  withLock: <T>(key: string, work: () => Promise<T>) => Promise<T>;
  encrypt: (value: string) => string;
  decrypt: (value: string) => string;
  baseUrl: () => string;
};
export const resumeDigest = (token: string) => createHash('sha256').update(token).digest('hex');

export function createProlificParticipationService(deps: ProlificParticipantDeps, stores = {
  participations: ProlificParticipations, studies: ProlificStudies, reminders: ProlificReminders,
}) {
  async function configuration(studyId: string) {
    const binding = await stores.studies.findOneAsync({ studyId });
    if (!binding) throw new Error('prolific.invalidConfiguration');
    const root = (await deps.resolveExperimentTargetFamily(studyId))?.root;
    if (root?._id !== binding.rootTdfId) throw new Error('prolific.invalidConfiguration');
    const spec = root?.content?.tdfs?.tutor?.setspec;
    if (!spec || root.ownerId !== binding.ownerId || spec.experimentTarget?.toLowerCase() !== studyId
      || spec.experimentPasswordRequired === true || spec.experimentPasswordRequired === 'true') {
      throw new Error('prolific.invalidConfiguration');
    }
    return { binding, root, completionUrl: prolificCompletionUrl(spec.prolificCompletionUrl) };
  }

  async function progress(p: any) {
    const { root, binding, completionUrl } = await configuration(p.studyId);
    if (p.rootTdfId !== root._id || p.ownerId !== binding.ownerId) throw new Error('prolific.identityConflict');
    const doc = await deps.states.findOneAsync({ userId: p.userId, TDFId: root._id });
    if (!doc) return { p, state: {} as Record<string, unknown>, units: [], tdfId: root._id, completionUrl, binding };
    const state = doc.experimentState || {};
    const conditionId = state.conditionTdfId || root._id;
    if (conditionId !== root._id && !root.content?.tdfs?.tutor?.setspec?.conditionTdfIds?.includes(conditionId)) {
      throw new Error('prolific.identityConflict');
    }
    const tdf = conditionId === root._id ? root : await deps.Tdfs.findOneAsync({ _id: conditionId });
    if (!tdf) throw new Error('prolific.invalidConfiguration');
    const content = structuredClone(tdf.content);
    restoreAdaptiveUnitSequence(content, state, conditionId);
    const units = content?.tdfs?.tutor?.unit;
    if (!Array.isArray(units)) throw new Error('prolific.invalidConfiguration');
    return { p, state, units, tdfId: conditionId, completionUrl, binding };
  }

  async function start(input: any) {
    const participantId = prolificId(input?.participantId);
    const studyId = prolificId(input?.studyId);
    const submissionId = prolificId(input?.submissionId);
    if (prolificId(input?.experimentTarget) !== studyId) throw new Error('prolific.identityConflict');
    const { binding } = await configuration(studyId);
    const key = `${studyId}:${participantId}`;
    return deps.withLock(key, async () => {
      let p = await stores.participations.findOneAsync({ participantId, studyId });
      if (!p) {
        const id = randomBytes(16).toString('hex');
        try {
          await stores.participations.insertAsync({
            _id: id, participantId, studyId, submissionId,
            userId: `pending:${id}`, rootTdfId: binding.rootTdfId, ownerId: binding.ownerId,
            startedAt: new Date(), sessions: [],
          });
        } catch (error: any) {
          if (error?.code !== 11000 && !String(error?.message).includes('E11000')) throw error;
        }
        p = await stores.participations.findOneAsync({ participantId, studyId });
      }
      if (!p || p.submissionId !== submissionId || p.rootTdfId !== binding.rootTdfId || p.ownerId !== binding.ownerId) {
        throw new Error('prolific.identityConflict');
      }
      if (p.userId.startsWith('pending:')) {
        const username = `PR-${p._id.slice(0, 24).toUpperCase()}`;
        let user = await deps.users.findOneAsync({ username });
        if (!user) {
          try {
            await deps.createUser(username, randomBytes(32).toString('hex'), {
              experiment: true, experimentTarget: studyId, createdBy: 'startProlificParticipation',
            }, { includeEmail: false });
          } catch (error) {
            if (!(await deps.users.findOneAsync({ username }))) throw error;
          }
          user = await deps.users.findOneAsync({ username });
        }
        if (!user || user.profile?.createdBy !== 'startProlificParticipation' || user.profile?.experimentTarget !== studyId) {
          throw new Error('prolific.identityConflict');
        }
        await stores.participations.updateAsync({ _id: p._id, userId: p.userId }, { $set: { userId: user._id } });
        p = await stores.participations.findOneAsync({ _id: p._id });
      }
      return { loginToken: await deps.issueToken(p.userId), experimentTarget: studyId, completed: Boolean(p.completedAt) };
    });
  }

  async function resume(token: unknown) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('prolific.invalidIdentity');
    const reminder = await stores.reminders.findOneAsync({ resumeHash: resumeDigest(token), status: { $ne: 'cancelled' } });
    if (!reminder) throw new Error('prolific.invalidIdentity');
    const p = await stores.participations.findOneAsync({ _id: reminder.participationId });
    if (!p || p.completedAt) throw new Error('prolific.finished');
    await configuration(p.studyId);
    // Entry before the due time is allowed to show the existing countdown, never to bypass it.
    return { loginToken: await deps.issueToken(p.userId), experimentTarget: p.studyId, experimentXCond: String((await progress(p)).state.experimentXCond ?? '') };
  }

  async function checkpoint(userId: string, retryInitialReturn = false) {
    const p = await stores.participations.findOneAsync({ userId });
    if (!p) return { prolific: false };
    const { state, units, tdfId, completionUrl, binding } = await progress(p);
    const completed = savedLessonCompleted(state, units.length);
    const unit = normalizeSavedUnitNumber(state.currentUnitNumber);
    const last = normalizeSavedUnitNumber(state.lastUnitCompleted);
    let boundary: string | null = completed ? 'end' : null;
    let dueAt: Date | null = null;
    if (!completed && unit !== null && unit > 0 && last !== null && last === unit - 1) {
      const user = await deps.users.findOneAsync({ _id: userId }, { fields: { lockouts: 1 } });
      const lockout = user?.lockouts?.[tdfId];
      if (lockout?.currentLockoutUnit === unit && Number(lockout.lockoutMinutes) > 0) {
        const end = Number(lockout.lockoutTimeStamp) + Number(lockout.lockoutMinutes) * 60000;
        if (!Number.isFinite(end)) throw new Error('prolific.invalidConfiguration');
        boundary = `${tdfId}:${unit}:${lockout.lockoutTimeStamp}`;
        dueAt = new Date(end);
      }
    }
    if (!boundary) return {
      prolific: true, completed: false,
      // Reopening the initial study link can return its already-saved first
      // session even while a later bonus-paid visit is in progress.
      ...(retryInitialReturn && p.firstSessionCompletedAt ? { completionUrl } : {}),
    };
    await stores.participations.updateAsync({ _id: p._id, 'sessions.boundary': { $ne: boundary } }, {
      $push: { sessions: { boundary, completedAt: new Date(), lastUnitCompleted: last } },
      $set: { ...(p.firstSessionCompletedAt ? {} : { firstSessionCompletedAt: new Date() }), ...(completed ? { completedAt: new Date() } : {}) },
    });
    if (completed) {
      await stores.reminders.updateAsync({ participationId: p._id, status: { $in: ['pending', 'failed'] } }, { $set: { status: 'cancelled' } }, { multi: true });
    } else if (dueAt) {
      const secret = randomBytes(32).toString('hex');
      const resumeUrl = new URL('/prolific/resume', deps.baseUrl());
      resumeUrl.hash = secret;
      try {
        await stores.reminders.insertAsync({
          participationId: p._id, studyId: p.studyId, ownerId: p.ownerId, boundary, tdfId, unit,
          dueAt, createdAt: new Date(), status: 'pending', resumeHash: resumeDigest(secret),
          bodyEncrypted: deps.encrypt(`${binding.reminderText}\n\n${resumeUrl.href}`),
        });
      } catch (error: any) {
        if (error?.code !== 11000 && !String(error?.message).includes('E11000')) throw error;
      }
    }
    // A failed client navigation can request the initial return explicitly; later visits don't loop.
    return { prolific: true, completed, completionUrl: !p.firstSessionCompletedAt || retryInitialReturn ? completionUrl : null };
  }

  async function validateLockout(userId: string, tdfId: string, unit: number) {
    const p = await stores.participations.findOneAsync({ userId });
    if (!p) return null;
    const current = await progress(p);
    if (current.tdfId !== tdfId || Number(current.state.currentUnitNumber ?? 0) !== unit) throw new Meteor.Error(403, 'prolific.identityConflict');
    const currentUnit = current.units[unit];
    if (!Number.isInteger(unit) || !currentUnit) throw new Error('prolific.invalidConfiguration');
    const tutor = (await deps.Tdfs.findOneAsync({ _id: tdfId }))?.content?.tdfs?.tutor;
    const timing = { ...pickTimingRuntimeSettings(tutor?.deliverySettings, current.state.experimentXCond), ...pickTimingRuntimeSettings(currentUnit?.deliverySettings, current.state.experimentXCond) };
    const minutes = Number(timing.lockoutminutes ?? 0);
    if (!Number.isFinite(minutes) || minutes < 0) throw new Error('prolific.invalidConfiguration');
    return minutes;
  }
  return { start, resume, checkpoint, validateLockout, progress };
}
