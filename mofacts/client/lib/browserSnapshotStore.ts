/** Browser persistence only; callers own synchronization, projection and error UI. */
export function createBrowserSnapshotStore<T>(
  keyForUser: (userId: string) => string,
  validate: (value: unknown, userId: string) => value is T,
  storage: () => Storage | undefined = () => typeof window === 'undefined' ? undefined : window.localStorage,
) {
  function key(userId: string): string {
    if (!userId) throw new Error('Browser snapshots require an authenticated user id.');
    return keyForUser(userId);
  }
  return {
    key,
    read(userId: string): T | null {
      const raw = storage()?.getItem(key(userId));
      if (!raw) return null;
      const value: unknown = JSON.parse(raw);
      if (!validate(value, userId)) throw new Error('Browser snapshot has an invalid version, identity or shape.');
      return value;
    },
    write(userId: string, value: T): void {
      if (!validate(value, userId)) throw new Error('Cannot persist an invalid browser snapshot.');
      const target = storage();
      if (!target) throw new Error('Browser snapshot storage is unavailable.');
      target.setItem(key(userId), JSON.stringify(value));
    },
    remove(userId: string): void { storage()?.removeItem(key(userId)); },
  };
}
