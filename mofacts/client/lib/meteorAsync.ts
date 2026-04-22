import { Meteor } from 'meteor/meteor';

// In Meteor 3, Meteor.callAsync is the native async call mechanism.
// Bluebird's Promise.promisify(Meteor.call) no longer works correctly.
type MeteorCallAsync = <T = unknown>(...args: unknown[]) => Promise<T>;
const meteorCallAsync: MeteorCallAsync = (
  Meteor as unknown as { callAsync: MeteorCallAsync }
).callAsync.bind(Meteor);

export { meteorCallAsync };

