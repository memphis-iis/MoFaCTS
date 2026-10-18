import { Meteor } from 'meteor/meteor';
export const readSparcAdministrativeRemovals = (ids: string[]): Promise<string[]> => Meteor.callAsync('getSparcAdministrativeRemovals', ids);
import type { SparcMoveLibraryClient } from '../../../../../../learning-components/units/sparcsession/sparcMoveLibrary';

export const sparcMoveLibraryClient: SparcMoveLibraryClient = {
  lookup: query => Meteor.callAsync('lookupSparcPrimitive', query),
  publish: (ticket, content) => Meteor.callAsync('publishSparcPrimitive', ticket, content),
  present: (query, reference, nodeId) => Meteor.callAsync('presentSparcPrimitive', query, reference, nodeId),
};
