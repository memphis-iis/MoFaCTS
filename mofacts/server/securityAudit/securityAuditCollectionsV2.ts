import { Mongo } from 'meteor/mongo';
import { collectionMongoName } from '../../common/collectionOwnership.ts';

// One server-owned registration, shared by the receiver and its Mongo tests.
// V1 records remain untouched in their separate, unregistered collection.
export const SecurityAuditReportsV2 = new Mongo.Collection<Record<string, unknown>>(
  collectionMongoName('SecurityAuditReportsV2'),
);
