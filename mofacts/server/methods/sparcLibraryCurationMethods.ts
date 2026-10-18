import { Meteor } from 'meteor/meteor';
import { requireUserWithRoles, type MethodAuthorizationDeps } from '../lib/methodAuthorization';

export function createSparcLibraryCurationMethods(deps: {
  getMethodAuthorizationDeps(): MethodAuthorizationDeps;
  remove(id: string): Promise<void>;
  removed(ids: string[]): Promise<string[]>;
}) {
  const auth = (userId?: string | null) => requireUserWithRoles(deps.getMethodAuthorizationDeps(), { userId, roles: ['admin'] });
  const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9]{1,64}$/.test(id);
  return {
    async deleteSparcInstructionalComponent(this: { userId?: string | null }, id: string) {
      await auth(this.userId);
      if (!validId(id)) throw new Meteor.Error(400, 'Invalid instructional component identity');
      await deps.remove(id);
    },
    async getSparcAdministrativeRemovals(this: { userId?: string | null }, ids: string[]) {
      await auth(this.userId);
      if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => !validId(id))) throw new Meteor.Error(400, 'Invalid instructional reference page');
      return deps.removed([...new Set(ids)]);
    },
  };
}
