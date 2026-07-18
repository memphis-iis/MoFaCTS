import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';
import { Template } from 'meteor/templating';
import { Tracker } from 'meteor/tracker';
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
import {
  userHasServerOpenRouterKey,
} from '../../lib/openRouterClientProfile';
import { TARGET_LOCALE_DEFINITIONS, TARGET_UI_LOCALES } from '../../../common/lib/interfaceLocales';
import { getActiveUiLocale, setActiveUiLocale } from '../../lib/interfaceLocaleState';
import { translatePlatformString } from '../../lib/interfaceI18n';
import { loadOpenRouterModelCatalog } from '../../lib/openRouterModelCatalogClient';
import {
  getAllowedOpenRouterReasoningLevels,
  getDefaultOpenRouterReasoningLevel,
  normalizeOpenRouterReasoningLevel,
  validateOpenRouterReasoningLevelForModel,
  type OpenRouterModelCatalogEntry,
  type OpenRouterReasoningLevel,
} from '../../../common/lib/openRouterModelCatalog';
import {
  createInlineConfirmationController,
  type InlineConfirmationController,
  type InlineConfirmationView,
} from '../../lib/adminUi/inlineConfirmationController';
import '../shared/adminUi/adminUi';

const MeteorAny = Meteor as typeof Meteor & { callAsync: (name: string, ...args: any[]) => Promise<any> };
const { FlowRouter } = require('meteor/ostrio:flow-router-extra');

type ProfileConfirmationContext =
  | Readonly<{ kind: 'delete-openrouter-key' }>
  | Readonly<{ kind: 'leave-profile'; destination: string }>;

type ProfileTemplateInstance = Blaze.TemplateInstance & {
  saving: ReactiveVar<boolean>;
  testing: ReactiveVar<boolean>;
  dirty: ReactiveVar<boolean>;
  statuses: ReactiveVar<Partial<Record<ProfileStatusScope, ProfileStatus>>>;
  avatarType: ReactiveVar<ProfileAvatarType>;
  avatarIconId: ReactiveVar<string>;
  avatarImageData: ReactiveVar<string>;
  openRouterHasServerKey: ReactiveVar<boolean>;
  openRouterModelCatalog: ReactiveVar<OpenRouterModelCatalogEntry[]>;
  openRouterModelCatalogState: ReactiveVar<'loading' | 'ready' | 'error'>;
  openRouterModelCatalogError: ReactiveVar<string>;
  openRouterSelectedModel: ReactiveVar<string>;
  openRouterSelectedReasoningLevel: ReactiveVar<OpenRouterReasoningLevel>;
  lastSyncedOpenRouterSettings: string;
  confirmationState: ReactiveVar<InlineConfirmationView>;
  confirmationController: InlineConfirmationController<ProfileConfirmationContext>;
  profileRoutePath: string;
  savedUiLocale: string;
  beforeUnloadHandler: (event: BeforeUnloadEvent) => void;
};

type ProfileStatusScope = 'save' | 'avatar' | 'locale' | 'openrouter';
type ProfileStatus = Readonly<{ kind: 'success' | 'error' | 'info'; message: string }>;

const AVATAR_IMAGE_SIZE = 256;
const AVATAR_IMAGE_QUALITY = 0.86;
let activeProfileTemplate: ProfileTemplateInstance | null = null;
let profileNavigationBypass = false;
let profileNavigationGuardRegistered = false;

function markProfileDirty(template: ProfileTemplateInstance): void {
  template.dirty.set(true);
  clearStatus(template, 'save');
}

function navigateFromProfile(destination: string): void {
  profileNavigationBypass = true;
  FlowRouter.go(destination);
}

function requestUnsavedChangesDecision(
  template: ProfileTemplateInstance,
  destination: string,
): void {
  const trigger = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : document.getElementById('profileSave');
  if (!trigger) {
    throw new Error('Profile navigation confirmation requires an available focus target');
  }
  template.confirmationController.open({
    confirmationId: 'profile-unsaved-changes',
    title: profileText('profile.unsavedChangesTitle'),
    message: profileText('profile.unsavedChangesMessage'),
    confirmLabel: profileText('profile.discardChanges'),
    cancelLabel: profileText('profile.saveChanges'),
    severity: 'warning',
    context: { kind: 'leave-profile', destination },
  }, trigger);
  Tracker.afterFlush(() => template.confirmationController.focusInitial());
}

function registerProfileNavigationGuard(): void {
  if (profileNavigationGuardRegistered) return;
  profileNavigationGuardRegistered = true;
  FlowRouter.triggers.enter([function(context: any, redirect: (path: string) => void) {
    const template = activeProfileTemplate;
    if (!template || context?.route?.name === 'client.profile') return;
    if (profileNavigationBypass) {
      profileNavigationBypass = false;
      return;
    }
    if (!template.dirty.get()) return;

    const destination = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    redirect(template.profileRoutePath);
    Tracker.afterFlush(() => {
      if (activeProfileTemplate === template) {
        requestUnsavedChangesDecision(template, destination);
      }
    });
  }]);
}

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

function profileText(key: Parameters<typeof translatePlatformString>[1], values?: Parameters<typeof translatePlatformString>[2]): string {
  return translatePlatformString(getActiveUiLocale(), key, values);
}

function findCatalogModel(
  template: ProfileTemplateInstance,
  modelId = template.openRouterSelectedModel.get(),
): OpenRouterModelCatalogEntry | undefined {
  return template.openRouterModelCatalog.get().find((model) => model.id === modelId);
}

function syncReasoningSelectionForModel(template: ProfileTemplateInstance): void {
  if (!template.openRouterSelectedModel.get()) {
    template.openRouterSelectedReasoningLevel.set('none');
    return;
  }
  const model = findCatalogModel(template);
  if (!model) {
    return;
  }
  const currentLevel = template.openRouterSelectedReasoningLevel.get();
  const allowedLevels = getAllowedOpenRouterReasoningLevels(model);
  if (!allowedLevels.includes(currentLevel)) {
    template.openRouterSelectedReasoningLevel.set(getDefaultOpenRouterReasoningLevel(model));
  }
}

function syncOpenRouterSettingsFromCurrentUser(template: ProfileTemplateInstance): void {
  const profile = currentProfile();
  const model = String(profile.openRouterDefaultModel || '').trim();
  const reasoningLevel = normalizeOpenRouterReasoningLevel(
    profile.openRouterReasoningLevel,
    'Stored OpenRouter reasoning level',
  );
  const signature = `${model}\u0000${reasoningLevel}`;
  if (template.lastSyncedOpenRouterSettings === signature) {
    return;
  }
  template.lastSyncedOpenRouterSettings = signature;
  template.openRouterSelectedModel.set(model);
  template.openRouterSelectedReasoningLevel.set(reasoningLevel);
  if (template.openRouterModelCatalogState.get() === 'ready') {
    syncReasoningSelectionForModel(template);
  }
}

async function loadProfileOpenRouterModelCatalog(template: ProfileTemplateInstance): Promise<void> {
  template.openRouterModelCatalogState.set('loading');
  template.openRouterModelCatalogError.set('');
  try {
    template.openRouterModelCatalog.set(await loadOpenRouterModelCatalog());
    template.openRouterModelCatalogState.set('ready');
    syncReasoningSelectionForModel(template);
  } catch (error: unknown) {
    template.openRouterModelCatalogState.set('error');
    template.openRouterModelCatalogError.set(getErrorMessage(error));
  }
}

function reasoningLevelLabel(level: OpenRouterReasoningLevel): string {
  return profileText(`profile.reasoningLevel.${level}` as Parameters<typeof translatePlatformString>[1]);
}

function validateChangedOpenRouterSelection(template: ProfileTemplateInstance): void {
  const modelId = template.openRouterSelectedModel.get();
  const reasoningLevel = template.openRouterSelectedReasoningLevel.get();
  if (!modelId) {
    if (reasoningLevel !== 'none') {
      throw new Error(profileText('profile.openRouterModelUnavailableForSave'));
    }
    return;
  }
  if (template.openRouterModelCatalogState.get() !== 'ready') {
    if (template.openRouterModelCatalogState.get() === 'loading') {
      throw new Error(profileText('profile.loadingOpenRouterModels'));
    }
    throw new Error(profileText('profile.openRouterModelsLoadFailed', {
      error: template.openRouterModelCatalogError.get(),
    }));
  }
  const model = findCatalogModel(template, modelId);
  if (!model) {
    throw new Error(profileText('profile.openRouterModelUnavailableForSave'));
  }
  validateOpenRouterReasoningLevelForModel(reasoningLevel, model);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(profileText('profile.couldNotReadAvatarImage')));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(profileText('profile.couldNotLoadAvatarImage')));
    image.src = src;
  });
}

async function resizeAvatarImage(file: File): Promise<string> {
  if (!(PROFILE_AVATAR_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    throw new Error(profileText('profile.chooseSupportedAvatarImage'));
  }
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_IMAGE_SIZE;
  canvas.height = AVATAR_IMAGE_SIZE;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error(profileText('profile.couldNotPrepareAvatarImage'));
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

function setStatus(
  template: ProfileTemplateInstance,
  kind: 'success' | 'error' | 'info',
  message: string,
  scope: ProfileStatusScope = 'save',
): void {
  template.statuses.set({ ...template.statuses.get(), [scope]: { kind, message } });
}

function clearStatus(template: ProfileTemplateInstance, scope: ProfileStatusScope): void {
  const statuses = { ...template.statuses.get() };
  delete statuses[scope];
  template.statuses.set(statuses);
}

function statusFor(template: ProfileTemplateInstance, scope: ProfileStatusScope): ProfileStatus | null {
  return template.statuses.get()[scope] || null;
}

function syncAvatarFromCurrentUser(template: ProfileTemplateInstance): void {
  const profile = currentProfile();
  const avatarType = normalizeProfileAvatarType(profile.avatarType);
  template.avatarType.set(avatarType);
  template.avatarIconId.set(findProfileAvatarIcon(profile.avatarIconId)?.id || PROFILE_AVATAR_DEFAULT_ICON_ID);
  template.avatarImageData.set(typeof profile.avatarImageData === 'string' ? profile.avatarImageData : '');
}

async function saveProfile(template: ProfileTemplateInstance): Promise<boolean> {
  template.saving.set(true);
  clearStatus(template, 'save');
  try {
    const apiKey = inputValue('openRouterApiKey');
    const model = template.openRouterSelectedModel.get();
    const reasoningLevel = template.openRouterSelectedReasoningLevel.get();
    const settingsSignature = `${model}\u0000${reasoningLevel}`;
    const openRouterSettingsChanged = Boolean(apiKey.trim())
      || settingsSignature !== template.lastSyncedOpenRouterSettings;
    if (openRouterSettingsChanged) {
      validateChangedOpenRouterSelection(template);
    }
    await MeteorAny.callAsync('updateOwnProfile', {
      name: inputValue('profileName'),
      displayName: inputValue('profileDisplayName'),
      uiLocale: inputValue('profileUiLocale'),
      avatarType: template.avatarType.get(),
      avatarIconId: template.avatarIconId.get(),
      avatarImageData: template.avatarImageData.get() || null,
    });
    if (openRouterSettingsChanged) {
      const result = await MeteorAny.callAsync('updateOwnOpenRouterSettings', { apiKey, model, reasoningLevel });
      template.openRouterHasServerKey.set(Boolean(result?.hasOpenRouterKey || apiKey.trim()));
      template.lastSyncedOpenRouterSettings = settingsSignature;
      const apiKeyInput = document.getElementById('openRouterApiKey') as HTMLInputElement | null;
      if (apiKeyInput) {
        apiKeyInput.value = '';
      }
    }
    template.savedUiLocale = getActiveUiLocale();
    template.dirty.set(false);
    setStatus(template, 'success', profileText('profile.profileSaved'));
    return true;
  } catch (error: unknown) {
    setStatus(template, 'error', getErrorMessage(error));
    return false;
  } finally {
    template.saving.set(false);
  }
}

Template.profile.onCreated(function(this: ProfileTemplateInstance) {
  this.saving = new ReactiveVar(false);
  this.testing = new ReactiveVar(false);
  this.dirty = new ReactiveVar(false);
  this.statuses = new ReactiveVar({});
  this.avatarType = new ReactiveVar('initials');
  this.avatarIconId = new ReactiveVar(PROFILE_AVATAR_DEFAULT_ICON_ID);
  this.avatarImageData = new ReactiveVar('');
  this.openRouterHasServerKey = new ReactiveVar(userHasServerOpenRouterKey(Meteor.user()));
  this.openRouterModelCatalog = new ReactiveVar([]);
  this.openRouterModelCatalogState = new ReactiveVar('loading');
  this.openRouterModelCatalogError = new ReactiveVar('');
  this.openRouterSelectedModel = new ReactiveVar('');
  this.openRouterSelectedReasoningLevel = new ReactiveVar('none');
  this.lastSyncedOpenRouterSettings = '';
  this.confirmationController = createInlineConfirmationController<ProfileConfirmationContext>(
    (view) => this.confirmationState.set(view),
    () => document.getElementById('profileSave'),
  );
  this.confirmationState = new ReactiveVar(this.confirmationController.getView());
  this.profileRoutePath = FlowRouter.current()?.path || '/profile';
  this.savedUiLocale = getActiveUiLocale();
  this.beforeUnloadHandler = (event: BeforeUnloadEvent) => {
    if (!this.dirty.get()) return;
    event.preventDefault();
    event.returnValue = '';
  };
  activeProfileTemplate = this;
  registerProfileNavigationGuard();
  window.addEventListener('beforeunload', this.beforeUnloadHandler);
  this.autorun(() => {
    if (Meteor.user()) {
      syncAvatarFromCurrentUser(this);
      this.openRouterHasServerKey.set(userHasServerOpenRouterKey(Meteor.user()));
      syncOpenRouterSettingsFromCurrentUser(this);
    }
  });
  void loadProfileOpenRouterModelCatalog(this);
});

Template.profile.onDestroyed(function(this: ProfileTemplateInstance) {
  if (activeProfileTemplate === this) {
    activeProfileTemplate = null;
  }
  window.removeEventListener('beforeunload', this.beforeUnloadHandler);
  this.confirmationController.destroy();
});

Template.profile.helpers({
  contentCreatorDisplayNameRequired(): boolean {
    return (globalThis as any).FlowRouter?.getQueryParam?.('contentCreator') === 'required'
      && !String(currentProfile().displayName || '').trim();
  },

  email(): string {
    return currentEmail();
  },

  name(): string {
    return String(currentProfile().name || '');
  },

  displayName(): string {
    return String(currentProfile().displayName || '');
  },

  uiLocale(): string {
    return getActiveUiLocale();
  },

  uiLocaleOptions(): Array<{ locale: string; label: string; selectedAttrs: Record<string, boolean> }> {
    const activeLocale = getActiveUiLocale();
    return TARGET_UI_LOCALES.map((locale) => {
      const definition = TARGET_LOCALE_DEFINITIONS[locale];
      return {
        locale,
        label: `${definition.englishName} (${definition.nativeName})`,
        selectedAttrs: activeLocale === locale ? { selected: true } : {},
      };
    });
  },

  avatarOptions(): typeof PROFILE_AVATAR_ICONS {
    return PROFILE_AVATAR_ICONS;
  },

  avatarTypeIs(type: ProfileAvatarType): boolean {
    return (Template.instance() as ProfileTemplateInstance).avatarType.get() === type;
  },

  avatarTypePressed(type: ProfileAvatarType): string {
    return (Template.instance() as ProfileTemplateInstance).avatarType.get() === type
      ? 'true'
      : 'false';
  },

  avatarIconSelected(iconId: string): boolean {
    return (Template.instance() as ProfileTemplateInstance).avatarIconId.get() === iconId;
  },

  avatarIconPressed(iconId: string): string {
    const template = Template.instance() as ProfileTemplateInstance;
    return template.avatarIconId.get() === iconId && template.avatarType.get() === 'icon'
      ? 'true'
      : 'false';
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
    return (Template.instance() as ProfileTemplateInstance).openRouterHasServerKey.get();
  },

  openRouterDefaultModel(): string {
    return (Template.instance() as ProfileTemplateInstance).openRouterSelectedModel.get();
  },

  openRouterModelOptions(): Array<{ value: string; label: string; selectedAttrs: Record<string, boolean> }> {
    const template = Template.instance() as ProfileTemplateInstance;
    const selectedModel = template.openRouterSelectedModel.get();
    const catalog = template.openRouterModelCatalog.get();
    const options: Array<{ value: string; label: string; selectedAttrs: Record<string, boolean> }> = [{
      value: '',
      label: profileText('profile.selectOpenRouterModel'),
      selectedAttrs: selectedModel ? {} : { selected: true },
    }];
    if (selectedModel && !catalog.some((model) => model.id === selectedModel)) {
      options.push({
        value: selectedModel,
        label: profileText('profile.savedModelUnavailable', { model: selectedModel }),
        selectedAttrs: { selected: true },
      });
    }
    for (const model of catalog) {
      options.push({
        value: model.id,
        label: model.name === model.id ? model.id : `${model.name} (${model.id})`,
        selectedAttrs: model.id === selectedModel ? { selected: true } : {},
      });
    }
    return options;
  },

  openRouterModelSelectAttrs(): Record<string, boolean> {
    return (Template.instance() as ProfileTemplateInstance).openRouterModelCatalogState.get() === 'ready'
      ? {}
      : { disabled: true };
  },

  openRouterModelCatalogMessage(): string {
    const template = Template.instance() as ProfileTemplateInstance;
    const state = template.openRouterModelCatalogState.get();
    if (state === 'loading') {
      return profileText('profile.loadingOpenRouterModels');
    }
    if (state === 'error') {
      return profileText('profile.openRouterModelsLoadFailed', {
        error: template.openRouterModelCatalogError.get(),
      });
    }
    return '';
  },

  openRouterModelDescribedBy(): string {
    return (Template.instance() as ProfileTemplateInstance).openRouterModelCatalogState.get() === 'ready'
      ? 'openRouterModelHelp'
      : 'openRouterModelHelp openRouterModelCatalogStatus';
  },

  openRouterModelCatalogMessageClass(): string {
    return (Template.instance() as ProfileTemplateInstance).openRouterModelCatalogState.get() === 'error'
      ? 'profile-alert-error'
      : 'profile-alert-info';
  },

  showOpenRouterReasoningLevel(): boolean {
    const template = Template.instance() as ProfileTemplateInstance;
    const model = findCatalogModel(template);
    if (model) {
      return model.reasoning !== null;
    }
    return Boolean(template.openRouterSelectedModel.get());
  },

  openRouterReasoningLevelOptions(): Array<{ value: string; label: string; selectedAttrs: Record<string, boolean> }> {
    const template = Template.instance() as ProfileTemplateInstance;
    const selectedLevel = template.openRouterSelectedReasoningLevel.get();
    const model = findCatalogModel(template);
    const levels = model
      ? getAllowedOpenRouterReasoningLevels(model)
      : [selectedLevel];
    return levels.map((level) => ({
      value: level,
      label: reasoningLevelLabel(level),
      selectedAttrs: level === selectedLevel ? { selected: true } : {},
    }));
  },

  openRouterReasoningSelectAttrs(): Record<string, boolean> {
    const template = Template.instance() as ProfileTemplateInstance;
    return template.openRouterModelCatalogState.get() === 'ready' && Boolean(findCatalogModel(template))
      ? {}
      : { disabled: true };
  },

  openRouterStatusMessage(): string {
    const template = Template.instance() as ProfileTemplateInstance;
    return statusFor(template, 'openrouter')?.message
      || String(currentProfile().openRouterLastTestStatus || '');
  },

  profileSaveStatusMessage(): string {
    return statusFor(Template.instance() as ProfileTemplateInstance, 'save')?.message || '';
  },

  profileAvatarStatusMessage(): string {
    return statusFor(Template.instance() as ProfileTemplateInstance, 'avatar')?.message || '';
  },

  profileLocaleStatusMessage(): string {
    return statusFor(Template.instance() as ProfileTemplateInstance, 'locale')?.message || '';
  },

  profileSaveStatusVariant(): string {
    return statusFor(Template.instance() as ProfileTemplateInstance, 'save')?.kind || 'info';
  },

  profileAvatarStatusVariant(): string {
    return statusFor(Template.instance() as ProfileTemplateInstance, 'avatar')?.kind || 'info';
  },

  openRouterStatusVariant(): string {
    const template = Template.instance() as ProfileTemplateInstance;
    const kind = statusFor(template, 'openrouter')?.kind || 'info';
    return kind;
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

  profileConfirmationView(): InlineConfirmationView {
    return (Template.instance() as ProfileTemplateInstance).confirmationState.get();
  },
});

Template.profile.events({
  'input #profileDisplayName'(_event: Event, template: ProfileTemplateInstance) {
    markProfileDirty(template);
    template.avatarType.set(template.avatarType.get());
  },

  'input #profileName'(_event: Event, template: ProfileTemplateInstance) {
    markProfileDirty(template);
  },

  'input #openRouterApiKey'(_event: Event, template: ProfileTemplateInstance) {
    markProfileDirty(template);
  },

  'change #profileUiLocale'(event: Event, template: ProfileTemplateInstance) {
    try {
      const nextLocale = (event.currentTarget as HTMLSelectElement).value;
      setActiveUiLocale(nextLocale);
      markProfileDirty(template);
      clearStatus(template, 'locale');
    } catch (error: unknown) {
      setStatus(template, 'error', getErrorMessage(error), 'locale');
    }
  },

  'change #openRouterDefaultModel'(event: Event, template: ProfileTemplateInstance) {
    template.openRouterSelectedModel.set((event.currentTarget as HTMLSelectElement).value);
    syncReasoningSelectionForModel(template);
    markProfileDirty(template);
  },

  'change #openRouterReasoningLevel'(event: Event, template: ProfileTemplateInstance) {
    template.openRouterSelectedReasoningLevel.set(normalizeOpenRouterReasoningLevel(
      (event.currentTarget as HTMLSelectElement).value,
      'OpenRouter reasoning level',
    ));
    markProfileDirty(template);
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
    markProfileDirty(template);
  },

  'click [data-avatar-icon]'(event: Event, template: ProfileTemplateInstance) {
    event.preventDefault();
    const iconId = (event.currentTarget as HTMLElement).getAttribute('data-avatar-icon') || '';
    const icon = findProfileAvatarIcon(iconId);
    if (!icon) {
      setStatus(template, 'error', profileText('profile.chooseSupportedAvatarIcon'), 'avatar');
      return;
    }
    template.avatarIconId.set(icon.id);
    template.avatarType.set('icon');
    markProfileDirty(template);
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
      markProfileDirty(template);
      setStatus(template, 'info', profileText('profile.avatarPictureReady'), 'avatar');
    } catch (error: unknown) {
      setStatus(template, 'error', getErrorMessage(error), 'avatar');
    } finally {
      input.value = '';
    }
  },

  'click #profileAvatarRemoveImage'(event: Event, template: ProfileTemplateInstance) {
    event.preventDefault();
    template.avatarImageData.set('');
    template.avatarType.set('initials');
    markProfileDirty(template);
    setStatus(template, 'info', profileText('profile.avatarPictureRemoved'), 'avatar');
  },

  'click #profileSave': async function(_event: Event, template: ProfileTemplateInstance) {
    await saveProfile(template);
  },

  'click #openRouterTest': async function(_event: Event, template: ProfileTemplateInstance) {
    template.testing.set(true);
    clearStatus(template, 'openrouter');
    try {
      const inputKey = inputValue('openRouterApiKey');
      const result = await MeteorAny.callAsync('testOwnOpenRouterSettings', {
        apiKey: inputKey,
        model: template.openRouterSelectedModel.get(),
        reasoningLevel: template.openRouterSelectedReasoningLevel.get(),
      });
      if (inputKey.trim()) {
        template.openRouterHasServerKey.set(true);
        const apiKeyInput = document.getElementById('openRouterApiKey') as HTMLInputElement | null;
        if (apiKeyInput) {
          apiKeyInput.value = '';
        }
      }
      setStatus(template, result?.success ? 'success' : 'error', result?.message || profileText('profile.unknownError'), 'openrouter');
    } catch (error: unknown) {
      setStatus(template, 'error', getErrorMessage(error), 'openrouter');
    } finally {
      template.testing.set(false);
    }
  },

  'click #openRouterDeleteKey'(event: Event, template: ProfileTemplateInstance) {
    template.confirmationController.open({
      confirmationId: 'profile-delete-openrouter-key',
      title: profileText('profile.deleteKey'),
      message: profileText('profile.deleteKeyConfirmation'),
      confirmLabel: profileText('profile.deleteKey'),
      cancelLabel: profileText('content.cancel'),
      severity: 'danger',
      context: { kind: 'delete-openrouter-key' },
    }, event.currentTarget as HTMLElement);
    Tracker.afterFlush(() => template.confirmationController.focusInitial());
  },

  'click .admin-confirmation-cancel': async function(_event: Event, template: ProfileTemplateInstance) {
    const context = template.confirmationController.getContext();
    if (context?.kind === 'leave-profile') {
      template.confirmationController.setPending(true);
      const saved = await saveProfile(template);
      if (!saved) {
        template.confirmationController.setPending(false);
        return;
      }
      template.confirmationController.complete();
      navigateFromProfile(context.destination);
      return;
    }
    template.confirmationController.cancel();
  },

  'keydown .admin-inline-confirmation'(event: KeyboardEvent, template: ProfileTemplateInstance) {
    template.confirmationController.handleKeydown(event);
  },

  'click .admin-confirmation-confirm': async function(_event: Event, template: ProfileTemplateInstance) {
    const view = template.confirmationController.getView();
    const context = template.confirmationController.getContext();
    if (view.status !== 'open' || view.pending || !context) {
      return;
    }
    if (context.kind === 'leave-profile') {
      setActiveUiLocale(template.savedUiLocale);
      template.dirty.set(false);
      template.confirmationController.complete();
      navigateFromProfile(context.destination);
      return;
    }
    if (context.kind !== 'delete-openrouter-key') return;
    template.confirmationController.setPending(true);
    template.saving.set(true);
    try {
      await MeteorAny.callAsync('deleteOwnOpenRouterKey');
      template.openRouterHasServerKey.set(false);
      const apiKeyInput = document.getElementById('openRouterApiKey') as HTMLInputElement | null;
      if (apiKeyInput) {
        apiKeyInput.value = '';
      }
      template.confirmationController.complete();
      setStatus(template, 'success', profileText('profile.openRouterKeyDeleted'), 'openrouter');
    } catch (error: unknown) {
      template.confirmationController.setPending(false);
      setStatus(template, 'error', getErrorMessage(error), 'openrouter');
    } finally {
      template.saving.set(false);
    }
  },
});
