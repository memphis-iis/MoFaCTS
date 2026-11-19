import { collectionMongoName } from '../../common/collectionOwnership';
import { studyOnlyAccount } from '../../common/participantPrivacy';
import { RECOVERABLE_WARNING_ACTION } from '../../common/recoverableWarnings';

const sources = ['users', 'AuthThrottleState', 'AuditLog', 'ErrorReports'] as const;
type Source = typeof sources[number];
type Row = Record<string, any>;
type Change = { remove: true } | { unset: string[] };
type Decision = Change | 'review' | null;

// The caller provides server-owned account linkage. Do not infer membership from a
// route, username, login mode, session snapshot, or a shared IP address.
function classify(source: Source, row: Row, verified: Set<string>): Decision {
  if (source === 'AuthThrottleState') {
    if (/^prolific-(?:start|resume|complete):(?:ip|id):/.test(row.key)) return { remove: true };
    return /^(?:login:|login-lock:)/.test(row.key) ? 'review' : null;
  }
  if (source === 'users') {
    if (!verified.has(row._id)) return null;
    const unset = ['userAgent', 'lastLogin'].filter(key => Object.hasOwn(row.status || {}, key))
      .map(key => 'status.' + key);
    for (const key of ['lastSessionId', 'lastSessionIdTimestamp']) if (Object.hasOwn(row, key)) unset.push(key);
    return unset.length ? { unset } : null;
  }
  if (source === 'ErrorReports') return verified.has(row.user) ? { remove: true } : 'review';
  const linked = verified.has(row.actorUserId) || verified.has(row.targetUserId);
  if (row.action === RECOVERABLE_WARNING_ACTION && verified.has(row.actorUserId)) return { remove: true };
  const provisioning = ['experiment.userProfileHealed', 'experiment.userAlreadyComplete',
    'experiment.rejected_non_experiment_user', 'experiment.userProvisioned'].includes(row.action);
  const login = ['auth.loginSuccess', 'auth.loginFailure'].includes(row.action);
  if (!provisioning && !login) return null;
  if (login && linked && row.actorUserId && row.targetUserId && row.actorUserId !== row.targetUserId) return 'review';
  if (!provisioning && !linked) return row.actorUserId || row.targetUserId ? null : 'review';
  const unset = ['ip', 'username', 'participantId'].filter(key => Object.hasOwn(row.details || {}, key))
    .map(key => 'details.' + key);
  return unset.length ? { unset } : null;
}

export const privacyCleanupProjection = {
  users: { _id: 1, 'profile.createdBy': 1, 'profile.experiment': 1, 'status.lastLogin': 1, 'status.userAgent': 1, lastSessionId: 1, lastSessionIdTimestamp: 1 },
  AuthThrottleState: { _id: 1, key: 1 },
  AuditLog: { _id: 1, action: 1, actorUserId: 1, targetUserId: 1, 'details.ip': 1, 'details.username': 1, 'details.participantId': 1 },
  ErrorReports: { _id: 1, user: 1 },
} as const;

type Stores = {
  page(source: Source, after: unknown, limit: number): Promise<Row[]>;
  verifiedAccounts(ids: string[]): Promise<{ users: Row[]; participations: Row[] }>;
  apply(source: Source, row: Row, change: Change): Promise<void>;
};

// Operator-owned adapter only. No startup hook, public method, or live database binding.
export async function inspectParticipantPrivacy(stores: Stores, mode: 'inventory' | 'cleanup' = 'inventory') {
  const counts = {} as Record<Source, { eligible: number; review: number }>;
  for (const source of sources) {
    const count = counts[source] = { eligible: 0, review: 0 };
    let after: unknown = null;
    while (true) {
      const rows = await stores.page(source, after, 200);
      if (!rows.length) break;
      const ids = [...new Set(rows.flatMap(row => source === 'users' ? [row._id]
        : [row.user, row.actorUserId, row.targetUserId]).filter(id => typeof id === 'string'))];
      const linked = ids.length ? await stores.verifiedAccounts(ids) : { users: [], participations: [] };
      const verified = new Set<string>([...linked.users.filter(studyOnlyAccount).map(user => user._id),
        ...linked.participations.map(p => p.userId)]);
      for (const row of rows) {
        const decision = classify(source, row, verified);
        if (decision === 'review') count.review++;
        else if (decision) {
          count.eligible++;
          if (mode === 'cleanup') await stores.apply(source, row, decision);
        }
      }
      after = rows[rows.length - 1]!._id;
    }
  }
  return counts;
}

/** Construct an operator adapter on an explicitly supplied database. No default connection. */
export function participantPrivacyCleanupStores(db: import('mongodb').Db): Stores {
  const collection = (source: Source) => db.collection<Row>(source === 'users' ? 'users' : collectionMongoName(source));
  return {
    page: (source, after, limit) => collection(source).find(after === null ? {} : { _id: { $gt: after as any } },
      { projection: privacyCleanupProjection[source] }).sort({ _id: 1 }).limit(limit).toArray(),
    async verifiedAccounts(ids) {
      const [users, participations] = await Promise.all([
        collection('users').find({ _id: { $in: ids as any } },
          { projection: { 'profile.experiment': 1, 'profile.createdBy': 1 } }).toArray(),
        db.collection('ProlificParticipations').find({ userId: { $in: ids } }, { projection: { userId: 1 } }).toArray(),
      ]);
      return { users, participations };
    },
    async apply(source, row, change) {
      const selector: Row = { _id: row._id };
      for (const path of Object.keys(privacyCleanupProjection[source])) {
        if (path === '_id') continue;
        const value = path.split('.').reduce((obj, key) => obj?.[key], row);
        selector[path] = value === undefined ? { $exists: false } : value;
      }
      if ('remove' in change) await collection(source).deleteOne(selector);
      else await collection(source).updateOne(selector, { $unset: Object.fromEntries(change.unset.map(key => [key, ''])) });
    },
  };
}
