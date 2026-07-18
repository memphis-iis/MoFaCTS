import { Meteor } from 'meteor/meteor';

type UsersCollection = {
  findOneAsync: (
    selector: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => Promise<any>;
};

export const CONTENT_CREATOR_DISPLAY_NAME_REQUIRED = 'content-creator-display-name-required';

export async function requireContentCreatorDisplayName(
  usersCollection: UsersCollection,
  userId: string,
): Promise<string> {
  const user = await usersCollection.findOneAsync(
    { _id: userId },
    { fields: { 'profile.displayName': 1 } },
  );
  const displayName = typeof user?.profile?.displayName === 'string'
    ? user.profile.displayName.trim()
    : '';

  if (!displayName) {
    throw new Meteor.Error(
      CONTENT_CREATOR_DISPLAY_NAME_REQUIRED,
      'Add a public display name in Profile before creating content. It may be anonymous.',
    );
  }

  return displayName;
}
