type AugmentedMeteorUserProfile = {
  username?: string | undefined;
  experiment?: unknown;
  [key: string]: unknown;
};

type AugmentedMeteorUserServices = {
  google?: { email?: string | undefined } | undefined;
  microsoft?: {
    mail?: string | undefined;
    userPrincipalName?: string | undefined;
    email?: string | undefined;
  } | undefined;
  memphisSaml?: {
    email?: string | undefined;
    mail?: string | undefined;
    eduPersonPrincipalName?: string | undefined;
    nameID?: string | undefined;
    displayName?: string | undefined;
  } | undefined;
  password?: Record<string, unknown> | undefined;
  [key: string]: unknown;
};

type AugmentedOnCreateUserCallback = (
  options: { profile?: {} | undefined },
  user: Meteor.User
) => Meteor.User;

declare namespace Meteor {
  interface UserProfile extends AugmentedMeteorUserProfile {}
  interface UserServices extends AugmentedMeteorUserServices {}
}

declare namespace Accounts {
  function onCreateUser(func: AugmentedOnCreateUserCallback): void;
}

declare module 'meteor/meteor' {
  namespace Meteor {
    interface UserProfile extends AugmentedMeteorUserProfile {}
    interface UserServices extends AugmentedMeteorUserServices {}
  }
}

declare module 'meteor/accounts-base' {
  namespace Accounts {
    function onCreateUser(func: AugmentedOnCreateUserCallback): void;
  }
}
