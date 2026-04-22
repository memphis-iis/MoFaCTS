import { Accounts } from 'meteor/accounts-base';
import { Meteor } from 'meteor/meteor';
import { clientConsole } from './userSessionHelpers';

const FALLBACK_KEYS = {
  userId: 'Meteor.userId',
  loginToken: 'Meteor.loginToken',
  loginTokenExpires: 'Meteor.loginTokenExpires',
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type LoginKeys = {
  userId: string;
  loginToken: string;
  loginTokenExpires: string;
};
type AccountsCompat = {
  USER_ID_KEY?: string;
  LOGIN_TOKEN_KEY?: string;
  LOGIN_TOKEN_EXPIRES_KEY?: string;
  _userIdKey?: string;
  _loginTokenKey?: string;
  _loginTokenExpiresKey?: string;
  storageLocation?: StorageLike;
  _storage?: StorageLike;
  _storeLoginToken?: (userId: string, token: string, tokenExpires: string) => void;
  _unstoreLoginToken?: () => void;
  _storedLoginToken?: () => string | null;
  _storedLoginTokenExpires?: () => string | null;
  _storedUserId?: () => string | null;
};
type MeteorStorageCompat = {
  _sessionStorage?: StorageLike;
  _localStorage?: StorageLike;
};

function resolveLoginKeys(): LoginKeys {
  const compatAccounts = Accounts as unknown as AccountsCompat;

  // Meteor 3 renamed these from _userIdKey/_loginTokenKey/_loginTokenExpiresKey
  // to USER_ID_KEY/LOGIN_TOKEN_KEY/LOGIN_TOKEN_EXPIRES_KEY
  const keys = {
    userId: compatAccounts.USER_ID_KEY || compatAccounts._userIdKey || FALLBACK_KEYS.userId,
    loginToken: compatAccounts.LOGIN_TOKEN_KEY || compatAccounts._loginTokenKey || FALLBACK_KEYS.loginToken,
    loginTokenExpires: compatAccounts.LOGIN_TOKEN_EXPIRES_KEY || compatAccounts._loginTokenExpiresKey || FALLBACK_KEYS.loginTokenExpires,
  };

  const usingFallback = keys.userId === FALLBACK_KEYS.userId ||
    keys.loginToken === FALLBACK_KEYS.loginToken ||
    keys.loginTokenExpires === FALLBACK_KEYS.loginTokenExpires;

  if (usingFallback) {
    clientConsole(1, '[AUTH] Using fallback login token keys:', keys);
  }

  return keys;
}

function assertStorage(storage: unknown, label: string): asserts storage is StorageLike {
  const candidate = storage as Partial<StorageLike> | null | undefined;
  if (!candidate || typeof candidate.getItem !== 'function' || typeof candidate.setItem !== 'function' || typeof candidate.removeItem !== 'function') {
    throw new Error(`[AUTH] ${label} storage is unavailable`);
  }
}

function migrateToken(localStore: StorageLike, sessionStore: StorageLike, keys: LoginKeys): void {
  const sessionToken = sessionStore.getItem(keys.loginToken);
  const localToken = localStore.getItem(keys.loginToken);
  const localUserId = localStore.getItem(keys.userId);
  const localExpires = localStore.getItem(keys.loginTokenExpires);

  if (!sessionToken && localToken) {
    if (localUserId) {
      sessionStore.setItem(keys.userId, localUserId);
    }
    sessionStore.setItem(keys.loginToken, localToken);
    if (localExpires) {
      sessionStore.setItem(keys.loginTokenExpires, localExpires);
    }
    clientConsole(1, '[AUTH] Migrated login token to sessionStorage for per-tab sessions');
  }

  if (localToken || localUserId || localExpires) {
    localStore.removeItem(keys.userId);
    localStore.removeItem(keys.loginToken);
    localStore.removeItem(keys.loginTokenExpires);
    clientConsole(1, '[AUTH] Cleared localStorage login tokens to enforce per-tab sessions');
  }
}

function configurePerTabAuthStorage(): void {
  const compatMeteor = Meteor as unknown as MeteorStorageCompat;
  const compatAccounts = Accounts as unknown as AccountsCompat;
  const sessionStore = compatMeteor._sessionStorage || window.sessionStorage;
  const localStore = compatMeteor._localStorage || window.localStorage;

  assertStorage(sessionStore, 'session');
  assertStorage(localStore, 'local');

  if (compatAccounts && compatAccounts.storageLocation) {
    // Meteor 3: use the new storageLocation property
    compatAccounts.storageLocation = sessionStore;
  } else if (compatAccounts && compatAccounts._storage) {
    // Meteor 2 fallback
    compatAccounts._storage = sessionStore;
  } else if (compatAccounts && compatAccounts._storeLoginToken && compatAccounts._unstoreLoginToken && compatAccounts._storedLoginToken) {
    const keys = resolveLoginKeys();
    compatAccounts._storedLoginToken = () => sessionStore.getItem(keys.loginToken);
    compatAccounts._storedLoginTokenExpires = () => sessionStore.getItem(keys.loginTokenExpires);
    compatAccounts._storedUserId = () => sessionStore.getItem(keys.userId);
    compatAccounts._storeLoginToken = (userId, token, tokenExpires) => {
      sessionStore.setItem(keys.userId, userId);
      sessionStore.setItem(keys.loginToken, token);
      sessionStore.setItem(keys.loginTokenExpires, tokenExpires);
    };
    compatAccounts._unstoreLoginToken = () => {
      sessionStore.removeItem(keys.userId);
      sessionStore.removeItem(keys.loginToken);
      sessionStore.removeItem(keys.loginTokenExpires);
    };
  } else {
    throw new Error('[AUTH] Accounts storage override not supported');
  }

  const keys = resolveLoginKeys();
  migrateToken(localStore, sessionStore, keys);
}

configurePerTabAuthStorage();

