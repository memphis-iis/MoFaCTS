import { Meteor } from 'meteor/meteor';

// In Meteor 3, Meteor.callAsync is the native async call mechanism.
// Bluebird's Promise.promisify(Meteor.call) no longer works correctly.
type MeteorCallAsync = <T = unknown>(...args: unknown[]) => Promise<T>;
const meteorCallAsync: MeteorCallAsync = async <T = unknown>(...args: unknown[]): Promise<T> => {
  const callAsync = (Meteor as unknown as { callAsync: MeteorCallAsync }).callAsync;
  return await callAsync.apply(Meteor, args) as T;
};

export { meteorCallAsync };

