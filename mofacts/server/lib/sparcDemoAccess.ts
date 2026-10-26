import { Meteor } from 'meteor/meteor';
import { isPublicDemoTutor, PUBLIC_DEMO_LIFETIME_MS } from '../../common/publicDemoContract';

type DemoUser = { createdAt?: unknown; profile?: { createdBy?: unknown; experimentTarget?: unknown; demoExpiresAt?: unknown } };
export function createSparcDemoAccess(deps: {
  readUser(userId: string): Promise<DemoUser | null | undefined>;
  readDemoTutor(target: string): Promise<unknown>;
  rateLimit(userId: string, address: string): Promise<void>;
  now?: () => number;
}) {
  async function expiry(userId: string): Promise<Date | null> {
    const user = await deps.readUser(userId);
    if (user?.profile?.createdBy === 'publicDemo') return user.profile.demoExpiresAt instanceof Date ? user.profile.demoExpiresAt : new Date(String(user.profile.demoExpiresAt));
    if (user?.profile?.createdBy !== 'provisionExperimentUser') return null;
    const target = user.profile.experimentTarget;
    if (typeof target !== 'string' || !target || !isPublicDemoTutor(await deps.readDemoTutor(target))) return null;
    const createdAt = user.createdAt instanceof Date ? user.createdAt : new Date(String(user.createdAt));
    return new Date(createdAt.getTime() + PUBLIC_DEMO_LIFETIME_MS);
  }
  function validate(date: Date): void {
    if (!Number.isFinite(date.getTime()) || date.getTime() <= (deps.now?.() ?? Date.now())) throw new Meteor.Error('public-demo-expired', 'This demonstration has expired. Start a new demonstration from its entry page.');
  }
  return {
    async assertExpiry(userId: string): Promise<void> { const date = await expiry(userId); if (date) validate(date); },
    async assertAiQuota(userId: string, address: string): Promise<void> {
      const date = await expiry(userId); if (!date) return;
      validate(date); await deps.rateLimit(userId, address);
    },
  };
}
