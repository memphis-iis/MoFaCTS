import { Roles } from 'meteor/alanning:roles';
import { Meteor } from 'meteor/meteor';
import { configuredRoleNames } from '../lib/configuredRoles';

type OwnerLinkRequest = {
  userId?: unknown;
  email?: unknown;
  issuedAt?: unknown;
  expiresAt?: unknown;
};

type OwnerLinkSettings = {
  owner?: unknown;
  initRoles?: { admins?: unknown[] };
  google?: { ownerLink?: OwnerLinkRequest };
};

export type ExternalAccountIdentity = {
  serviceName: string;
  serviceData: Record<string, unknown>;
};

const oneHour = 60 * 60 * 1000;
const gmail = /^[a-z0-9.]+@gmail\.com$/;

function canonicalAddress(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

// Called by Accounts only after the provider's server-side OAuth exchange.
export async function linkConfiguredGoogleOwner({ serviceName, serviceData }: ExternalAccountIdentity) {
  if (serviceName !== 'google' || serviceData.verified_email !== true) return;
  const googleId = serviceData.id;
  if (typeof googleId !== 'string' || !/^[!-~]{1,255}$/.test(googleId)) return;

  const settings = Meteor.settings as OwnerLinkSettings;
  const request = settings.google?.ownerLink;
  if (!request || typeof request.userId !== 'string' || !request.userId ||
      typeof request.issuedAt !== 'string' || typeof request.expiresAt !== 'string') return;

  const email = canonicalAddress(serviceData.email);
  if (!gmail.test(email) || email !== canonicalAddress(request.email) || email !== canonicalAddress(settings.owner) ||
      !configuredRoleNames(settings.initRoles, 'admin').some(admin => canonicalAddress(admin) === email)) return;

  const issued = Date.parse(request.issuedAt);
  const expires = Date.parse(request.expiresAt);
  const now = Date.now();
  if (!(issued <= now && now < expires && expires - issued <= oneHour)) return;
  if (!await Roles.userIsInRoleAsync(request.userId, 'admin') || Date.now() >= expires) return;

  // The native OAuth service owns the unique index on this provider ID. Match the
  // authorized user and any concurrent write of the same ID in one operation.
  const { matchedCount } = await Meteor.users.rawCollection().updateOne({
    _id: request.userId,
    username: email,
    'emails.0.address': email,
    'profile.experiment': { $nin: [true, 'true'] },
    'services.password': { $type: 'object' },
    $or: [
      { 'services.google': { $exists: false } },
      { 'services.google.id': googleId },
    ],
  }, { $set: { 'services.google.id': googleId } });
  return matchedCount === 1 ? { _id: request.userId } : undefined;
}
