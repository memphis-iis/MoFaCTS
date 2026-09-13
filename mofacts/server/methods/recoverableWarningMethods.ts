import { check, Match } from 'meteor/check';
import {
  RECOVERABLE_WARNING_ACTION,
  RECOVERABLE_WARNING_PAGE_SIZE,
  type RecoverableWarning,
  type RecoverableWarningCursor,
  type RecoverableWarningRow,
  type RecoverableWarningPage,
} from '../../common/recoverableWarnings';
import { requireAuthenticatedUser } from '../lib/methodAuthorization';

type RecordValue = Record<string, unknown>;
type Context = { userId?: string | null };
type Dependencies = {
  auditLog: {
    insertAsync: (document: RecordValue) => Promise<unknown>;
    find: (selector: RecordValue, options: RecordValue) => { fetchAsync: () => Promise<RecoverableWarningRow[]> };
  };
  requireAdminUser: (userId: string | null | undefined) => Promise<void>;
};
const identifier = Match.Where((value: unknown) => typeof value === 'string'
  && /^[A-Za-z0-9_.:-]{1,128}$/.test(value));

export function createRecoverableWarningMethods(deps: Dependencies) {
  return {
    async reportRecoverableWarning(this: Context, warning: RecoverableWarning) {
      const userId = requireAuthenticatedUser(this.userId);
      check(warning, {
        code: Match.Where((value: unknown) => value === 'autotutor.citationMismatch'),
        tdfId: Match.OneOf(null, identifier),
        mismatchCount: Match.Where((value: unknown) => Number.isInteger(value)
          && Number(value) > 0 && Number(value) <= 10000),
      });
      await deps.auditLog.insertAsync({
        action: RECOVERABLE_WARNING_ACTION,
        actorUserId: userId,
        targetUserId: null,
        // This is a client-reported diagnostic, not a server-verified scoring result.
        origin: 'client',
        details: { code: warning.code, tdfId: warning.tdfId, mismatchCount: warning.mismatchCount },
        createdAt: new Date(),
      });
      return true;
    },

    async getRecoverableWarnings(this: Context, cursor: RecoverableWarningCursor | null = null): Promise<RecoverableWarningPage> {
      await deps.requireAdminUser(this.userId);
      check(cursor, Match.OneOf(null, { createdAt: Date, id: identifier }));
      const selector: RecordValue = { action: RECOVERABLE_WARNING_ACTION };
      if (cursor) {
        selector.$or = [
          { createdAt: { $lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
        ];
      }
      const documents = await deps.auditLog.find(selector, {
        sort: { createdAt: -1, _id: -1 },
        limit: RECOVERABLE_WARNING_PAGE_SIZE + 1,
        fields: { _id: 1, createdAt: 1, details: 1 },
      }).fetchAsync();
      const rows = documents.slice(0, RECOVERABLE_WARNING_PAGE_SIZE);
      const last = rows.at(-1);
      return {
        rows,
        nextCursor: documents.length > RECOVERABLE_WARNING_PAGE_SIZE && last
          ? { createdAt: last.createdAt, id: last._id } : null,
      };
    },
  };
}
