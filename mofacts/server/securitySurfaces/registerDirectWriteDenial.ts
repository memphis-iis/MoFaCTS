import { DIRECT_WRITE_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog.ts';

type Operation = 'insert' | 'update';
type Rules = Partial<Record<Operation, () => true>>;
const descriptors = {
  profile: { verification: DIRECT_WRITE_VERIFICATIONS.profile, rules: Object.freeze({ update: (): true => true }) },
  settings: { verification: DIRECT_WRITE_VERIFICATIONS.settings, rules: Object.freeze({ update: (): true => true }) },
  progress: { verification: DIRECT_WRITE_VERIFICATIONS.progress, rules: Object.freeze({ insert: (): true => true, update: (): true => true }) },
} as const;
const registered: (typeof descriptors[keyof typeof descriptors])[] = [];

export function registerDirectWriteDenial(collection: { deny(rules: Rules): unknown }, name: keyof typeof descriptors) {
  const descriptor = descriptors[name];
  collection.deny(descriptor.rules);
  registered.push(Object.freeze(descriptor));
}

export function registeredDirectWriteDenials() {
  return Object.freeze([...registered]);
}
