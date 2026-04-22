import { Meteor } from 'meteor/meteor';
import {
  requireUserMatchesOrHasRole,
  type MethodAuthorizationDeps,
} from '../lib/methodAuthorization';

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
    upsertAsync: (selector: UnknownRecord, documentOrModifier: UnknownRecord, options?: UnknownRecord) => Promise<unknown>;
  };
  usersCollection: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
    updateAsync: (selector: UnknownRecord, modifier: UnknownRecord, options?: UnknownRecord) => Promise<unknown>;
  };
  getMethodAuthorizationDeps: () => MethodAuthorizationDeps;
  isTdfOwner: (userId: string, tdf: any) => boolean;
  getUserDisplayIdentifier: (user: any) => string;
  exactCaseInsensitiveRegex: (value: string) => RegExp;
  isValidEmailAddress: (value: string) => boolean;
  normalizeCanonicalId: (value: unknown) => string | null;
  resolveConditionTdfIds: (setspec?: { condition?: string[] }) => Promise<Array<string | null>>;
};

export function createAccessMethods(deps: AccessMethodsDeps) {
  return {
    getAccessorsTDFID: async function(this: MethodContext, TDFId: string) {
      if (!this.userId) {
        throw new Meteor.Error(401, 'Must be logged in');
      }

      const tdf = await deps.Tdfs.findOneAsync({ _id: TDFId });
      if (tdf) {
        if (!deps.isTdfOwner(this.userId, tdf)) {
          throw new Meteor.Error(403, 'Access denied');
        }
        const accessors = Array.isArray(tdf.accessors) ? tdf.accessors : [];
        const accessorIds = accessors
          .map((accessor: any) => accessor?.userId)
          .filter((userId: unknown) => typeof userId === 'string' && userId.trim().length > 0);
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
            ...accessor,
            username: deps.getUserDisplayIdentifier(accessorUser) || accessor?.username || '',
          };
        });
      }
      return [];
    },

    getAccessors: async function(this: MethodContext, TDFId: string) {
      if (!this.userId) {
        throw new Meteor.Error(401, 'Must be logged in');
      }

      const tdf = await deps.Tdfs.findOneAsync({ _id: TDFId });
      if (tdf && !deps.isTdfOwner(this.userId, tdf)) {
        throw new Meteor.Error(403, 'Access denied');
      }

      return await deps.usersCollection.find({ accessedTDFs: TDFId }).fetchAsync();
    },

    getAccessableTDFSForUser: async function(this: MethodContext, userId: string) {
      await requireUserMatchesOrHasRole(deps.getMethodAuthorizationDeps(), {
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

    getAssignableTDFSForUser: async function(this: MethodContext, userId: string) {
      await requireUserMatchesOrHasRole(deps.getMethodAuthorizationDeps(), {
        actingUserId: this.userId,
        subjectUserId: userId,
        roles: ['admin', 'teacher'],
        notLoggedInMessage: 'Must be logged in',
        notLoggedInCode: 401,
        forbiddenMessage: 'Can only access your own TDFs',
        forbiddenCode: 403,
      });
      deps.serverConsole('getAssignableTDFSForUser', userId);
      const assignableTDFs = await deps.Tdfs.find({ $or: [{ ownerId: userId }, { 'accessors.userId': userId }] }).fetchAsync();
      deps.serverConsole('assignableTDFs', assignableTDFs);
      return assignableTDFs;
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

      if (!deps.isTdfOwner(this.userId, tdf)) {
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

      const userByLookupId = new Map<string, any>();
      for (const user of matchedUsers) {
        const displayIdentifier = deps.getUserDisplayIdentifier(user);
        const username = typeof user?.username === 'string' ? user.username.trim() : '';
        const canonicalEmail = typeof user?.email_canonical === 'string' ? user.email_canonical.trim().toLowerCase() : '';
        const emails = Array.isArray(user?.emails)
          ? user.emails
              .map((entry: { address?: string }) => typeof entry?.address === 'string' ? entry.address.trim().toLowerCase() : '')
              .filter(Boolean)
          : [];

        if (username) {
          userByLookupId.set(username.toLowerCase(), {
            _id: user._id,
            username: displayIdentifier || username,
            displayIdentifier: displayIdentifier || username,
          });
        }
        if (canonicalEmail) {
          userByLookupId.set(canonicalEmail, {
            _id: user._id,
            username: displayIdentifier || canonicalEmail,
            displayIdentifier: displayIdentifier || canonicalEmail,
          });
        }
        for (const email of emails) {
          userByLookupId.set(email, {
            _id: user._id,
            username: displayIdentifier || email,
            displayIdentifier: displayIdentifier || email,
          });
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

      const tdf = await deps.Tdfs.findOneAsync({ _id: TDFId });
      if (!tdf) {
        throw new Meteor.Error(404, 'TDF not found');
      }
      if (!deps.isTdfOwner(this.userId, tdf)) {
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

      deps.serverConsole('assignAccessors', TDFId, normalizedAccessors, normalizedRevoked);
      await deps.Tdfs.updateAsync({ _id: TDFId }, { $set: { accessors: normalizedAccessors } });
      const userIds = normalizedAccessors.map((x: { userId: string }) => x.userId);
      if (userIds.length > 0) {
        await deps.usersCollection.updateAsync({ _id: { $in: userIds } }, { $addToSet: { accessedTDFs: TDFId } }, { multi: true });
      }
      if (actuallyRemovedIds.length > 0) {
        await deps.usersCollection.updateAsync({ _id: { $in: actuallyRemovedIds } }, { $pull: { accessedTDFs: TDFId } }, { multi: true });
      }

      const setspec = tdf.content?.tdfs?.tutor?.setspec;
      const conditionIds = Array.isArray(setspec?.condition)
        ? (await deps.resolveConditionTdfIds(setspec)).filter(Boolean)
        : [];
      if (conditionIds.length > 0) {
        const childIds = [...new Set(conditionIds)].filter((id) => typeof id === 'string' && id !== TDFId);
        for (const childId of childIds) {
          const child = await deps.Tdfs.findOneAsync({ _id: childId }, { fields: { ownerId: 1, accessors: 1 } });
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

          await deps.Tdfs.updateAsync({ _id: childId }, { $set: { accessors: normalizedAccessors } });
          if (userIds.length > 0) {
            await deps.usersCollection.updateAsync({ _id: { $in: userIds } }, { $addToSet: { accessedTDFs: childId } }, { multi: true });
          }
          if (childRemovedIds.length > 0) {
            await deps.usersCollection.updateAsync({ _id: { $in: childRemovedIds } }, { $pull: { accessedTDFs: childId } }, { multi: true });
          }
        }
      }
    },

    transferDataOwnership: async function(this: MethodContext, tdfId: string, newOwner: { _id?: string; username?: string } | string) {
      if (!this.userId) {
        throw new Meteor.Error(401, 'Must be logged in');
      }

      deps.serverConsole('transferDataOwnership', tdfId, newOwner);
      const tdf = await deps.Tdfs.findOneAsync({ _id: tdfId });
      if (!tdf) {
        deps.serverConsole('TDF not found');
        return 'TDF not found';
      }
      deps.serverConsole('TDF found', tdf._id, tdf.ownerId);

      if (!deps.isTdfOwner(this.userId, tdf)) {
        throw new Meteor.Error(403, 'Only current owner can transfer ownership');
      }
      const newOwnerId = typeof newOwner === 'string'
        ? deps.normalizeCanonicalId(newOwner)
        : deps.normalizeCanonicalId(newOwner?._id);
      if (!newOwnerId) {
        throw new Meteor.Error(400, 'New owner id is required');
      }
      tdf.ownerId = newOwnerId;
      await deps.Tdfs.upsertAsync({ _id: tdfId }, tdf);
      deps.serverConsole(tdf);
      deps.serverConsole('transfer ' + tdfId + 'to' + newOwnerId);
      return 'success';
    },
  };
}
