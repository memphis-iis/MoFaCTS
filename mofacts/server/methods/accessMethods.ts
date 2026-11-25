import { withLessonSharingTransaction } from '../lib/lessonSharingMongo';
import { isTdfOwner } from '../lib/contentAccessPolicy';
import { Meteor } from 'meteor/meteor';
import { validateConditionFamilyTutor } from '../../common/lib/tdfIdentityContract';
import {
  requireUserMatchesOrHasRole,
  type MethodAuthorizationDeps,
} from '../lib/methodAuthorization';

export const lessonSharingPolicy = Object.freeze({ kind: 'lesson-sharing', operation: 'owner-assignment', authorize: isTdfOwner } as const);

export const accessorReadPolicy = Object.freeze({ kind: 'lesson-sharing', operation: 'owner-read', authorize: isTdfOwner } as const);

export const ownLessonListPolicy = Object.freeze({ kind: 'lesson-list', operation: 'self', authorize: requireUserMatchesOrHasRole } as const);

type UnknownRecord = Record<string, unknown>;
type MethodContext = {
  userId?: string | null;
  unblock?: () => void;
  connection?: { id?: string; clientAddress?: string | null } | null;
};

type AccessMethodsDeps = {
  serverConsole: (...args: unknown[]) => void;
  Tdfs: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
    updateAsync: (selector: UnknownRecord, modifier: UnknownRecord, options?: UnknownRecord) => Promise<unknown>;
  };
  usersCollection: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
    updateAsync: (selector: UnknownRecord, modifier: UnknownRecord, options?: UnknownRecord) => Promise<unknown>;
  };
  getMethodAuthorizationDeps: () => MethodAuthorizationDeps;
  getUserDisplayIdentifier: (user: any) => string;
  exactCaseInsensitiveRegex: (value: string) => RegExp;
  isValidEmailAddress: (value: string) => boolean;
  normalizeCanonicalId: (value: unknown) => string | null;
  transferTdfOwnership: (tdfId: string, actingUserId: string, newOwnerId: string) => Promise<number>;
};

export function createAccessMethods(deps: AccessMethodsDeps) {
  return {
    getAccessorsTDFID: async function(this: MethodContext, TDFId: string) {
      if (!this.userId) {
        throw new Meteor.Error(401, 'Must be logged in');
      }

      const tdf = await deps.Tdfs.findOneAsync({ _id: TDFId }, { fields: { ownerId: 1, 'accessors.userId': 1, 'accessors.username': 1 } });
      if (tdf) {
        if (!accessorReadPolicy.authorize(this.userId, tdf)) {
          throw new Meteor.Error(403, 'Access denied');
        }
        const accessors = (Array.isArray(tdf.accessors) ? tdf.accessors : []).filter(
          (entry: any) => typeof entry?.userId === 'string' && entry.userId.trim().length > 0
        );
        const accessorIds = accessors.map((entry: any) => entry.userId);
        const accessorUsers = accessorIds.length > 0
          ? await deps.usersCollection.find(
              { _id: { $in: accessorIds } },
              { fields: { _id: 1, username: 1, email_canonical: 1, emails: 1, profile: 1 } }
            ).fetchAsync()
          : [];
        const accessorMap = new Map(accessorUsers.map((user: any) => [user._id, user]));
        return accessors.map((accessor: any) => {
          const accessorUser = accessorMap.get(accessor?.userId);
          return {
            userId: accessor.userId,
            username: deps.getUserDisplayIdentifier(accessorUser) || (typeof accessor.username === 'string' ? accessor.username : ''),
          };
        });
      }
      return [];
    },

    getAccessors: async function(this: MethodContext, TDFId: string) {
      if (!this.userId) {
        throw new Meteor.Error(401, 'Must be logged in');
      }
      if (typeof TDFId !== 'string' || !TDFId.trim()) {
        throw new Meteor.Error(400, 'TDF id is required');
      }

      const tdf = await deps.Tdfs.findOneAsync({ _id: TDFId }, { fields: { ownerId: 1 } });
      if (!tdf) {
        throw new Meteor.Error(404, 'TDF not found');
      }
      if (!accessorReadPolicy.authorize(this.userId, tdf)) {
        throw new Meteor.Error(403, 'Access denied');
      }

      return await deps.usersCollection.find(
        { accessedTDFs: TDFId },
        { fields: { _id: 1, username: 1 } },
      ).fetchAsync();
    },

    getAccessableTDFSForUser: async function(this: MethodContext, userId: string) {
      await ownLessonListPolicy.authorize(deps.getMethodAuthorizationDeps(), {
        actingUserId: this.userId,
        subjectUserId: userId,
        notLoggedInMessage: 'Must be logged in',
        notLoggedInCode: 401,
        forbiddenMessage: 'Can only access your own TDFs',
        forbiddenCode: 403,
      });

      deps.serverConsole('getAccessableTDFSForUser', userId);
      return await deps.Tdfs.find({
        ownerId: userId,
      }, {
        fields: {
          _id: 1,
          'content.fileName': 1,
          'content.tdfs.tutor.setspec.lessonname': 1,
          'content.tdfs.tutor.setspec.condition': 1,
        },
      }).fetchAsync();
    },

    resolveUsersForTdf: async function(this: MethodContext, tdfId: string, identifiers: unknown[]) {
      if (!this.userId) {
        throw new Meteor.Error(401, 'Must be logged in');
      }
      if (!tdfId || typeof tdfId !== 'string') {
        throw new Meteor.Error(400, 'Invalid TDF');
      }
      if (!Array.isArray(identifiers)) {
        throw new Meteor.Error(400, 'Invalid user identifier list');
      }

      const tdf = await deps.Tdfs.findOneAsync(
        { _id: tdfId },
        { fields: { ownerId: 1, content: 1 } }
      );
      if (!tdf) {
        throw new Meteor.Error(404, 'TDF not found');
      }

      if (!accessorReadPolicy.authorize(this.userId, tdf)) {
        throw new Meteor.Error(403, 'Only current owner can manage access');
      }

      const normalized = [...new Set(
        identifiers
          .filter((id) => typeof id === 'string')
          .map((id) => id.trim())
          .filter(Boolean)
      )];

      if (normalized.length === 0) {
        return { users: [], missing: [] };
      }
      if (normalized.length > 50) {
        throw new Meteor.Error(400, 'Too many users requested');
      }

      const lookupClauses = normalized.flatMap((id) => {
        const normalizedIdentifier = id.toLowerCase();
        const exactRegex = deps.exactCaseInsensitiveRegex(id);
        if (deps.isValidEmailAddress(id)) {
          return [
            { email_canonical: normalizedIdentifier },
            { username: exactRegex },
            { 'emails.address': exactRegex },
          ];
        }

        return [
          { username: exactRegex },
          { 'emails.address': exactRegex },
        ];
      });

      const matchedUsers = await deps.usersCollection.find(
        { $or: lookupClauses },
        { fields: { _id: 1, username: 1, email_canonical: 1, emails: 1, profile: 1 } }
      ).fetchAsync();

      const requestedIds = new Set(normalized.map(id => id.toLowerCase()));
      const userByLookupId = new Map<string, { _id: string; username: string; displayIdentifier: string }>();
      for (const user of matchedUsers) {
        const displayIdentifier = deps.getUserDisplayIdentifier(user);
        const aliases = [user.username, user.email_canonical, ...(Array.isArray(user.emails) ? user.emails : []).map((entry: { address?: string }) => entry?.address)];
        for (const alias of aliases) {
          if (typeof alias !== 'string') continue;
          const key = alias.trim().toLowerCase();
          if (!requestedIds.has(key)) continue;
          const previous = userByLookupId.get(key);
          if (previous && previous._id !== user._id) {
            throw new Meteor.Error('ambiguous-recipient', 'Enter a username or email that identifies exactly one account.');
          }
          const label = displayIdentifier || alias.trim();
          userByLookupId.set(key, { _id: user._id, username: label, displayIdentifier: label });
        }
      }

      const users = [];
      const missing = [];
      for (const id of normalized) {
        const match = userByLookupId.get(id.toLowerCase());
        if (!match) {
          missing.push(id);
          continue;
        }
        users.push(match);
      }

      return { users, missing };
    },

    assignAccessors: async function(
      this: MethodContext,
      TDFId: string,
      accessors: Array<{ userId?: string; username?: string }>,
      revokedAccessors: unknown[]
    ) {
      if (!this.userId) {
        throw new Meteor.Error(401, 'Must be logged in');
      }
      if (!Array.isArray(accessors) || !Array.isArray(revokedAccessors)) {
        throw new Meteor.Error(400, 'Invalid accessor payload');
      }

      const caller = this.userId;
      await withLessonSharingTransaction(async storage => {
        const tdf = await storage.findLesson(TDFId);
        if (!tdf) {
          throw new Meteor.Error(404, 'TDF not found');
        }
        if (!lessonSharingPolicy.authorize(caller, { ownerId: tdf.ownerId })) {
          throw new Meteor.Error(403, 'Only TDF owner can assign accessors');
        }

        const normalizedRevoked = [...new Set(
          revokedAccessors
            .filter((id) => typeof id === 'string' && id.trim().length > 0)
        )];

        const currentAccessors = Array.isArray(tdf.accessors) ? tdf.accessors : [];
        const currentById = new Map();
        for (const accessor of currentAccessors) {
          const accessorId = accessor?.userId;
          if (typeof accessorId === 'string' && accessorId.trim().length > 0) {
            currentById.set(accessorId, {
              userId: accessorId,
              username: accessor?.username || '',
            });
          }
        }

        const requestedById = new Map();
        for (const accessor of accessors) {
          const accessorId = accessor?.userId;
          if (typeof accessorId !== 'string' || accessorId.trim().length === 0) {
            throw new Meteor.Error(400, 'Invalid accessor entry');
          }
          if (accessorId === tdf.ownerId) {
            continue;
          }
          requestedById.set(accessorId, {
            userId: accessorId,
            username: accessor?.username || '',
          });
        }

        const finalById = new Map(currentById);
        for (const revokedId of normalizedRevoked) {
          finalById.delete(revokedId);
        }
        for (const [accessorId, accessorInfo] of requestedById.entries()) {
          if (!finalById.has(accessorId)) {
            finalById.set(accessorId, accessorInfo);
          }
        }

        const normalizedAccessors = Array.from(finalById.values());
        const finalAccessorIds = new Set(normalizedAccessors.map((x: { userId: string }) => x.userId));
        const actuallyRemovedIds = [];
        for (const existingId of currentById.keys()) {
          if (!finalAccessorIds.has(existingId)) {
            actuallyRemovedIds.push(existingId);
          }
        }

        const familyValidation = validateConditionFamilyTutor(tdf.content?.tdfs?.tutor, { requireCanonicalIds: true });
        if (familyValidation.errors.length > 0) {
          throw new Meteor.Error('tdf-identity-repair-required', 'This lesson family requires an identity repair.');
        }
        await storage.setAccessors(TDFId, normalizedAccessors);
        const userIds = normalizedAccessors.map((x: { userId: string }) => x.userId);
        const newIds = userIds.filter(id => !currentById.has(id));
        const retainedIds = userIds.filter(id => currentById.has(id));
        if (newIds.length > 0) {
          const result = await storage.grant(TDFId, newIds);
          if (result.matchedCount !== newIds.length) {
            throw new Meteor.Error('sharing-recipient-missing', 'A selected account no longer exists. Select the recipients again.');
          }
        }
        if (retainedIds.length > 0) {
          await storage.grant(TDFId, retainedIds);
        }
        if (actuallyRemovedIds.length > 0) {
          await storage.revoke(TDFId, actuallyRemovedIds);
        }

        const conditionIds = familyValidation.conditionTdfIds;
        if (conditionIds.length > 0) {
          const childIds = [...new Set(conditionIds)].filter((id) => typeof id === 'string' && id !== TDFId);
          for (const childId of childIds) {
            const child = await storage.findChild(childId);
            if (!child || child.ownerId !== tdf.ownerId) {
              continue;
            }

            const childAccessors = Array.isArray(child.accessors) ? child.accessors : [];
            const childExistingIds = new Set<string>(
              childAccessors
                .map((a: { userId?: string }) => a.userId)
                .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
            );
            const childRemovedIds = [];
            for (const existingId of childExistingIds) {
              if (!finalAccessorIds.has(existingId)) {
                childRemovedIds.push(existingId);
              }
            }

            await storage.setAccessors(childId, normalizedAccessors);
            if (userIds.length > 0) {
              await storage.grant(childId, userIds);
            }
            if (childRemovedIds.length > 0) {
              await storage.revoke(childId, childRemovedIds);
            }
          }
        }
      });
    },

    transferDataOwnership: async function(this: MethodContext, tdfId: string, newOwner: { _id?: string; username?: string } | string) {
      if (!this.userId) {
        throw new Meteor.Error(401, 'Must be logged in');
      }

      if (typeof tdfId !== 'string' || !tdfId.trim()) throw new Meteor.Error(400, 'TDF id is required');
      const newOwnerId = typeof newOwner === 'string'
        ? deps.normalizeCanonicalId(newOwner)
        : deps.normalizeCanonicalId(newOwner?._id);
      if (!newOwnerId) {
        throw new Meteor.Error(400, 'New owner id is required');
      }
      await deps.transferTdfOwnership(tdfId, this.userId, newOwnerId);
      return 'success';
    },
  };
}
