import { Mongo } from 'meteor/mongo';
import { collectionMongoName } from '../../common/collectionOwnership.ts';

// Imported only by server test modules. Both suites exercise the canonical
// namespace through one Meteor registration and clean up only their owned IDs.
export const auditReportsV2Fixture = new Mongo.Collection<Record<string, unknown>>(
  collectionMongoName('SecurityAuditReportsV2')
);
