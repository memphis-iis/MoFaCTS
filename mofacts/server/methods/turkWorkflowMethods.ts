import { Meteor } from 'meteor/meteor';
import { displayify } from '../../common/globalHelpers';
import { turk } from '../turk';
import {
  hasUserRole,
  requireUserWithRoles,
  type MethodAuthorizationDeps,
} from '../lib/methodAuthorization';

type UnknownRecord = Record<string, unknown>;
type MethodContext = {
  userId?: string | null;
  unblock?: () => void;
  connection?: { id?: string; clientAddress?: string | null } | null;
};

type TurkWorkflowMethodsDeps = {
  Tdfs: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
  };
  ScheduledTurkMessages: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
  };
  usersCollection: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
    updateAsync: (selector: UnknownRecord, modifier: UnknownRecord, options?: UnknownRecord) => Promise<number | { numberAffected?: number }>;
  };
  getCurrentUser: () => Promise<any>;
  getMethodAuthorizationDeps: () => MethodAuthorizationDeps;
  encryptData: (value: string) => string;
  serverConsole: (...args: unknown[]) => void;
};

export function createTurkWorkflowMethods(deps: TurkWorkflowMethodsDeps) {
  async function requireTurkWorkflowUser(thisArg: MethodContext) {
    return await requireUserWithRoles(deps.getMethodAuthorizationDeps(), {
      userId: thisArg.userId,
      roles: ['admin', 'teacher'],
      notLoggedInMessage: 'Must be logged in',
      notLoggedInCode: 401,
      forbiddenMessage: 'Teacher or admin access required for MTurk workflow',
      forbiddenCode: 403,
    });
  }

  async function assertCanManageExperiment(thisArg: MethodContext, experimentId: string) {
    const actingUserId = await requireTurkWorkflowUser(thisArg);
    const normalizedExperimentId = typeof experimentId === 'string' ? experimentId.trim() : '';
    if (!normalizedExperimentId) {
      throw new Meteor.Error(400, 'Experiment id is required');
    }

    const experiment = await deps.Tdfs.findOneAsync(
      {
        $or: [
          { _id: normalizedExperimentId },
          { 'content.fileName': normalizedExperimentId },
        ],
      },
      {
        fields: {
          _id: 1,
          ownerId: 1,
          'content.fileName': 1,
        },
      }
    );
    if (!experiment) {
      throw new Meteor.Error(404, 'Experiment not found');
    }

    const isAdmin = await hasUserRole(deps.getMethodAuthorizationDeps(), actingUserId, ['admin']);
    if (!isAdmin && experiment.ownerId !== actingUserId) {
      throw new Meteor.Error(403, 'Can only manage your own MTurk experiments');
    }
    return { actingUserId, experiment, isAdmin };
  }

  function defaultUserProfile() {
    return {
      have_aws_id: false,
      have_aws_secret: false,
      aws_id: '',
      aws_secret_key: '',
      use_sandbox: Meteor.settings.mturkSandbox ?? true,
    };
  }

  async function userProfileSave(user: { _id: string; aws?: UnknownRecord }, awsProfile: UnknownRecord) {
    deps.serverConsole('userProfileSave', user._id, awsProfile);
    user.aws = awsProfile;
    const numUpdated = await deps.usersCollection.updateAsync(
      { _id: user._id },
      { $set: { aws: user.aws } },
      { multi: false }
    );
    const numberAffected = typeof numUpdated === 'number'
      ? numUpdated
      : numUpdated?.numberAffected ?? 0;
    deps.serverConsole('numUpdated', numUpdated, 'numberAffected', numberAffected);
    if (numberAffected === 1) {
      deps.serverConsole('Save succeeded');
      return 'Save succeeed';
    }

    if (numberAffected < 1) {
      throw new Meteor.Error('user-profile-save', 'No records updated by save');
    }
    throw new Meteor.Error('user-profile-save', 'More than one record updated?! ' + String(numberAffected));
  }

  return {
    getTurkWorkflowExperiments: async function(this: MethodContext) {
      const actingUserId = await requireTurkWorkflowUser(this);

      const isAdmin = await hasUserRole(deps.getMethodAuthorizationDeps(), actingUserId, ['admin']);
      const selector: Record<string, unknown> = {
        'content.tdfs.tutor.setspec.experimentTarget': {
          $exists: true,
          $ne: null,
        },
      };

      if (!isAdmin) {
        selector.ownerId = actingUserId;
      }

      return await deps.Tdfs.find(
        selector,
        {
          fields: {
            _id: 1,
            ownerId: 1,
            'content.fileName': 1,
            'content.tdfs.tutor.setspec': 1,
          },
        }
      ).fetchAsync();
    },

    getUsersByExperimentId: async function(this: MethodContext, experimentId: string){
      const { experiment } = await assertCanManageExperiment(this, experimentId);
      const experimentKeys = [
        experiment._id,
        experiment.content?.fileName,
      ].filter((key) => typeof key === 'string' && key.trim().length > 0);

      const messages =  await deps.ScheduledTurkMessages.find({experiment: { $in: experimentKeys }}).fetchAsync();
      const userIds = messages.map((x: { workerUserId?: string }) => x.workerUserId).filter((id: unknown): id is string => typeof id === 'string');
      const uniqueUserIds = Array.from(new Set(userIds));
      const users = await deps.usersCollection.find(
        {_id: {$in: uniqueUserIds}},
        {fields: {_id: 1, username: 1}}
      ).fetchAsync();
      const userNameById = new Map(
        users.map((user: { _id: string; username?: string }) => [user._id, user.username || user._id])
      );

      return userIds.map((userId: string) => ({
        userId,
        userName: userNameById.get(userId) || userId,
      }));
    },

    saveUserAWSData: async function(this: MethodContext, profileData: UnknownRecord) {
      await requireTurkWorkflowUser(this);
      const safeProfileLog = {
        ...profileData,
        aws_id: profileData?.aws_id ? '[REDACTED]' : '',
        aws_secret_key: profileData?.aws_secret_key ? '[REDACTED]' : '',
      };
      deps.serverConsole('saveUserAWSData', displayify(safeProfileLog));

      let saveResult; let result; let errmsg; let acctBal;
      try {
        const currentUser = await deps.getCurrentUser();
        if (!currentUser || !currentUser._id) {
          throw new Meteor.Error(401, 'Must be logged in');
        }
        const existingAws = {
          ...defaultUserProfile(),
          ...(currentUser.aws || {}),
        };
        const data = {
          ...defaultUserProfile(),
          ...existingAws,
        };

        const rawAwsId = typeof profileData?.aws_id === 'string' ? profileData.aws_id.trim() : '';
        const rawAwsSecret = typeof profileData?.aws_secret_key === 'string' ? profileData.aws_secret_key.trim() : '';
        const requestedSandbox = typeof profileData?.use_sandbox === 'boolean'
          ? profileData.use_sandbox
          : data.use_sandbox;

        data.use_sandbox = !!requestedSandbox;

        if (rawAwsId.length > 0) {
          data.aws_id = deps.encryptData(rawAwsId);
          data.have_aws_id = true;
        } else {
          data.have_aws_id = !!(data.aws_id && typeof data.aws_id === 'string');
        }

        if (rawAwsSecret.length > 0) {
          data.aws_secret_key = deps.encryptData(rawAwsSecret);
          data.have_aws_secret = true;
        } else {
          data.have_aws_secret = !!(data.aws_secret_key && typeof data.aws_secret_key === 'string');
        }

        saveResult = await userProfileSave(currentUser, data);

        const res = await turk.getAccountBalance(data);

        if (!res) {
          throw new Error('There was an error reading your account balance');
        }

        result = true;
        acctBal = res.AvailableBalance;
        errmsg = '';
      } catch (e: unknown) {
        result = false;
        deps.serverConsole('here', e);
        errmsg = e;
      }
      return {
        result,
        saveResult,
        acctBal,
        error: errmsg,
      };
    },
  };
}
