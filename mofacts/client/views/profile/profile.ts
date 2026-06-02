import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';
import { Template } from 'meteor/templating';
import {
  findProfileAvatarIcon,
  normalizeProfileAvatarType,
  PROFILE_AVATAR_DEFAULT_ICON_ID,
  PROFILE_AVATAR_ICONS,
  PROFILE_AVATAR_IMAGE_MIME_TYPES,
  type ProfileAvatarType,
} from '../../../common/profileAvatar';
import { getErrorMessage } from '../../lib/errorUtils';
import { getUserDisplayName, getUserInitials } from '../../lib/userIdentity';

const MeteorAny = Meteor as typeof Meteor & { callAsync: (name: string, ...args: any[]) => Promise<any> };

type ProfileTemplateInstance = Blaze.TemplateInstance & {
  saving: ReactiveVar<boolean>;
  testing: ReactiveVar<boolean>;
  statusMessage: ReactiveVar<string>;
  statusKind: ReactiveVar<'success' | 'error' | 'info'>;
  avatarType: ReactiveVar<ProfileAvatarType>;
  avatarIconId: ReactiveVar<string>;
  avatarImageData: ReactiveVar<string>;
};

const AVATAR_IMAGE_SIZE = 256;
const AVATAR_IMAGE_QUALITY = 0.86;

function currentUser(): any {
  return Meteor.user() || {};
}

function currentProfile(): Record<string, any> {
  return currentUser()?.profile || {};
}

function currentEmail(): string {
  const user = currentUser();
  return String(
    user.email_original ||
    user.email_canonical ||
    user.emails?.[0]?.address ||
    ''
  );
}

function inputValue(id: string): string {
  const element = document.getElementById(id) as HTMLInputElement | null;
  return element?.value || '';
}

function getPreviewDisplayName(): string {
  return inputValue('profileDisplayName') || String(currentProfile().displayName || '') || getUserDisplayName(currentUser());
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read avatar image'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load avatar image'));
    image.src = src;
  });
}

async function resizeAvatarImage(file: File): Promise<string> {
  if (!(PROFILE_AVATAR_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    throw new Error('Choose a JPEG, PNG, or WebP image.');
  }
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_IMAGE_SIZE;
  canvas.height = AVATAR_IMAGE_SIZE;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not prepare avatar image.');
  }
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.max(0, (image.naturalWidth - sourceSize) / 2);
  const sourceY = Math.max(0, (image.naturalHeight - sourceSize) / 2);
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    AVATAR_IMAGE_SIZE,
    AVATAR_IMAGE_SIZE
  );
  return canvas.toDataURL('image/jpeg', AVATAR_IMAGE_QUALITY);
}

function setStatus(template: ProfileTemplateInstance, kind: 'success' | 'error' | 'info', message: string): void {
  template.statusKind.set(kind);
  template.statusMessage.set(message);
}

function syncAvatarFromCurrentUser(template: ProfileTemplateInstance): void {
  const profile = currentProfile();
  const avatarType = normalizeProfileAvatarType(profile.avatarType);
  template.avatarType.set(avatarType);
  template.avatarIconId.set(findProfileAvatarIcon(profile.avatarIconId)?.id || PROFILE_AVATAR_DEFAULT_ICON_ID);
  template.avatarImageData.set(typeof profile.avatarImageData === 'string' ? profile.avatarImageData : '');
}

async function saveProfile(template: ProfileTemplateInstance): Promise<void> {
  template.saving.set(true);
  template.statusMessage.set('');
  try {
    const apiKey = inputValue('openRouterApiKey');
    const model = inputValue('openRouterDefaultModel');
    await MeteorAny.callAsync('updateOwnProfile', {
      name: inputValue('profileName'),
      displayName: inputValue('profileDisplayName'),
      avatarType: template.avatarType.get(),
      avatarIconId: template.avatarIconId.get(),
      avatarImageData: template.avatarImageData.get() || null,
    });
    await MeteorAny.callAsync('updateOwnOpenRouterSettings', {
      apiKey,
      model,
    });
    const apiKeyInput = document.getElementById('openRouterApiKey') as HTMLInputElement | null;
    if (apiKeyInput) {
      apiKeyInput.value = '';
    }
    setStatus(template, 'success', 'Profile saved');
  } catch (error: unknown) {
    setStatus(template, 'error', getErrorMessage(error));
  } finally {
    template.saving.set(false);
  }
}

Template.profile.onCreated(function(this: ProfileTemplateInstance) {
  this.saving = new ReactiveVar(false);
  this.testing = new ReactiveVar(false);
  this.statusMessage = new ReactiveVar('');
  this.statusKind = new ReactiveVar('info');
  this.avatarType = new ReactiveVar('initials');
  this.avatarIconId = new ReactiveVar(PROFILE_AVATAR_DEFAULT_ICON_ID);
  this.avatarImageData = new ReactiveVar('');
  this.autorun(() => {
    if (Meteor.user()) {
      syncAvatarFromCurrentUser(this);
    }
  });
});

Template.profile.helpers({
  email(): string {
    return currentEmail();
  },

  name(): string {
    return String(currentProfile().name || '');
  },

  displayName(): string {
    return String(currentProfile().displayName || '');
  },

  avatarOptions(): typeof PROFILE_AVATAR_ICONS {
    return PROFILE_AVATAR_ICONS;
  },

  avatarTypeIs(type: ProfileAvatarType): boolean {
    return (Template.instance() as ProfileTemplateInstance).avatarType.get() === type;
  },

  avatarIconSelected(iconId: string): boolean {
    return (Template.instance() as ProfileTemplateInstance).avatarIconId.get() === iconId;
  },

  avatarIconClass(iconId: string): string {
    return findProfileAvatarIcon(iconId)?.className || 'fa-user';
  },

  previewInitials(): string {
    return getUserInitials({ profile: { displayName: getPreviewDisplayName() } } as any);
  },

  previewIsImage(): boolean {
    const template = Template.instance() as ProfileTemplateInstance;
    return template.avatarType.get() === 'image' && template.avatarImageData.get().length > 0;
  },

  previewImageData(): string {
    return (Template.instance() as ProfileTemplateInstance).avatarImageData.get();
  },

  previewIsIcon(): boolean {
    return (Template.instance() as ProfileTemplateInstance).avatarType.get() === 'icon';
  },

  previewIconClass(): string {
    return findProfileAvatarIcon((Template.instance() as ProfileTemplateInstance).avatarIconId.get())?.className || 'fa-user';
  },

  hasOpenRouterKey(): boolean {
    return currentProfile().openRouterHasKey === true;
  },

  openRouterDefaultModel(): string {
    return String(currentProfile().openRouterDefaultModel || '');
  },

  openRouterStatusMessage(): string {
    const template = Template.instance() as ProfileTemplateInstance;
    return template.statusMessage.get() || String(currentProfile().openRouterLastTestStatus || '');
  },

  openRouterStatusClass(): string {
    const template = Template.instance() as ProfileTemplateInstance;
    const kind = template.statusKind.get();
    if (kind === 'success') return 'profile-alert-success';
    if (kind === 'error') return 'profile-alert-error';
    return 'profile-alert-info';
  },

  saving(): boolean {
    return (Template.instance() as ProfileTemplateInstance).saving.get();
  },

  savingAttrs(): Record<string, boolean> {
    return (Template.instance() as ProfileTemplateInstance).saving.get() ? { disabled: true } : {};
  },

  testing(): boolean {
    return (Template.instance() as ProfileTemplateInstance).testing.get();
  },

  testingAttrs(): Record<string, boolean> {
    return (Template.instance() as ProfileTemplateInstance).testing.get() ? { disabled: true } : {};
  },
});

Template.profile.events({
  'input #profileDisplayName'(_event: Event, template: ProfileTemplateInstance) {
    template.avatarType.set(template.avatarType.get());
  },

  'click [data-avatar-type]'(event: Event, template: ProfileTemplateInstance) {
    event.preventDefault();
    const type = (event.currentTarget as HTMLElement).getAttribute('data-avatar-type');
    const nextType = normalizeProfileAvatarType(type);
    if (nextType === 'image' && !template.avatarImageData.get()) {
      document.getElementById('profileAvatarUpload')?.click();
      return;
    }
    template.avatarType.set(nextType);
  },

  'click [data-avatar-icon]'(event: Event, template: ProfileTemplateInstance) {
    event.preventDefault();
    const iconId = (event.currentTarget as HTMLElement).getAttribute('data-avatar-icon') || '';
    const icon = findProfileAvatarIcon(iconId);
    if (!icon) {
      setStatus(template, 'error', 'Choose a supported avatar icon');
      return;
    }
    template.avatarIconId.set(icon.id);
    template.avatarType.set('icon');
  },

  'click #profileAvatarUploadButton'(event: Event) {
    event.preventDefault();
    document.getElementById('profileAvatarUpload')?.click();
  },

  async 'change #profileAvatarUpload'(event: Event, template: ProfileTemplateInstance) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    try {
      const resizedImage = await resizeAvatarImage(file);
      template.avatarImageData.set(resizedImage);
      template.avatarType.set('image');
      setStatus(template, 'info', 'Avatar picture ready to save');
    } catch (error: unknown) {
      setStatus(template, 'error', getErrorMessage(error));
    } finally {
      input.value = '';
    }
  },

  'click #profileAvatarRemoveImage'(event: Event, template: ProfileTemplateInstance) {
    event.preventDefault();
    template.avatarImageData.set('');
    template.avatarType.set('initials');
    setStatus(template, 'info', 'Avatar picture removed. Save profile to apply.');
  },

  'click #profileSave': async function(_event: Event, template: ProfileTemplateInstance) {
    await saveProfile(template);
  },

  'click #openRouterTest': async function(_event: Event, template: ProfileTemplateInstance) {
    template.testing.set(true);
    template.statusMessage.set('');
    try {
      const result = await MeteorAny.callAsync('testOwnOpenRouterSettings', {
        apiKey: inputValue('openRouterApiKey'),
        model: inputValue('openRouterDefaultModel'),
      });
      setStatus(template, result?.success ? 'success' : 'error', result?.message || 'Unknown error');
    } catch (error: unknown) {
      setStatus(template, 'error', getErrorMessage(error));
    } finally {
      template.testing.set(false);
    }
  },

  'click #openRouterDeleteKey': async function(_event: Event, template: ProfileTemplateInstance) {
    template.saving.set(true);
    try {
      await MeteorAny.callAsync('deleteOwnOpenRouterKey');
      const apiKeyInput = document.getElementById('openRouterApiKey') as HTMLInputElement | null;
      if (apiKeyInput) {
        apiKeyInput.value = '';
      }
      setStatus(template, 'success', 'OpenRouter key deleted');
    } catch (error: unknown) {
      setStatus(template, 'error', getErrorMessage(error));
    } finally {
      template.saving.set(false);
    }
  },
});
