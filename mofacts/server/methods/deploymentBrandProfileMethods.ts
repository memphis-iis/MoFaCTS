import { Meteor } from 'meteor/meteor';
import {
  publishDeploymentBrandProfile,
  readDeploymentBrandProfileDraft,
  saveDeploymentBrandProfileDraft,
} from '../lib/deploymentBrandProfileRegistry';
import { BRAND_PROFILE_METHOD_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog';
import type { MeteorMethodBinding } from '../securitySurfaces/registerMeteorMethods';

type MethodContext = { userId?: string | null };

type BrandProfileMethodDeps = {
  requireAdminUser: (userId: string | null | undefined, message?: string, code?: string) => Promise<void>;
};

export function createDeploymentBrandProfileRegistration(deps: BrandProfileMethodDeps) {
  const policy = Object.freeze({
    kind: 'role',
    role: 'admin',
    async authorize(userId: string | null | undefined) {
      await deps.requireAdminUser(userId, 'Only admins can manage the Brand Profile', 'unauthorized');
      if (!userId) throw new Meteor.Error('not-logged-in', 'Must be logged in');
      return userId;
    },
  } as const);

  const methods = {
    getDeploymentBrandProfileDraft: async function(this: MethodContext) {
      await policy.authorize(this.userId);
      return await readDeploymentBrandProfileDraft();
    },

    saveDeploymentBrandProfileDraft: async function(this: MethodContext, value: unknown) {
      const userId = await policy.authorize(this.userId);
      return await saveDeploymentBrandProfileDraft(value, userId);
    },

    publishDeploymentBrandProfile: async function(this: MethodContext) {
      const userId = await policy.authorize(this.userId);
      return await publishDeploymentBrandProfile(userId);
    },

    importDeploymentBrandProfileDraft: async function(this: MethodContext, payload: unknown) {
      const userId = await policy.authorize(this.userId);
      let parsed = payload;
      if (typeof payload === 'string') {
        try {
          parsed = JSON.parse(payload);
        } catch (_error) {
          throw new Meteor.Error('invalid-json', 'Brand Profile file is not valid JSON');
        }
      }
      return await saveDeploymentBrandProfileDraft(parsed, userId);
    },

    exportDeploymentBrandProfile: async function(this: MethodContext) {
      await policy.authorize(this.userId);
      const draft = await readDeploymentBrandProfileDraft() as Record<string, unknown>;
      return JSON.stringify({ ...draft, updatedAt: '', updatedBy: '' }, null, 2);
    },
  };
  function bind(name: keyof typeof methods, dataEgress: MeteorMethodBinding['dataEgress']): MeteorMethodBinding {
    return Object.freeze({ handler: methods[name], policy, verification: BRAND_PROFILE_METHOD_VERIFICATIONS[name], dataEgress });
  }
  return { methods, methodBindings: Object.freeze([
    bind('getDeploymentBrandProfileDraft', 'brand-profile-draft'),
    bind('saveDeploymentBrandProfileDraft', 'brand-profile-draft'),
    bind('publishDeploymentBrandProfile', 'published-brand-profile'),
    bind('importDeploymentBrandProfileDraft', 'brand-profile-draft'),
    bind('exportDeploymentBrandProfile', 'redacted-brand-profile-export'),
  ]) };
}
