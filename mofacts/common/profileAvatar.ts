export type ProfileAvatarType = 'initials' | 'icon' | 'image';

export type ProfileAvatarIcon = {
  id: string;
  label: string;
  className: string;
};

export const PROFILE_AVATAR_ICONS: ProfileAvatarIcon[] = [
  { id: 'person', label: 'Person', className: 'fa-user' },
  { id: 'graduate', label: 'Graduate', className: 'fa-graduation-cap' },
  { id: 'book', label: 'Book', className: 'fa-book' },
  { id: 'idea', label: 'Idea', className: 'fa-lightbulb-o' },
  { id: 'star', label: 'Star', className: 'fa-star' },
  { id: 'rocket', label: 'Rocket', className: 'fa-rocket' },
  { id: 'flask', label: 'Flask', className: 'fa-flask' },
  { id: 'compass', label: 'Compass', className: 'fa-compass' },
];

export const PROFILE_AVATAR_DEFAULT_ICON_ID = 'person';
export const PROFILE_AVATAR_IMAGE_MAX_BYTES = 160 * 1024;
export const PROFILE_AVATAR_IMAGE_MAX_DATA_URL_LENGTH = 240 * 1024;
export const PROFILE_AVATAR_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export function findProfileAvatarIcon(iconId: unknown): ProfileAvatarIcon | null {
  if (typeof iconId !== 'string') {
    return null;
  }
  return PROFILE_AVATAR_ICONS.find((icon) => icon.id === iconId) || null;
}

export function normalizeProfileAvatarType(value: unknown): ProfileAvatarType {
  if (value === 'icon' || value === 'image') {
    return value;
  }
  return 'initials';
}

export function isSupportedProfileAvatarImageMime(mimeType: unknown): mimeType is typeof PROFILE_AVATAR_IMAGE_MIME_TYPES[number] {
  return typeof mimeType === 'string' &&
    (PROFILE_AVATAR_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}
