import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import './adminControls.html';
import './adminControls.css';
import './shared/adminUi/adminUi';
import { meteorCallAsync } from '..';
import { getActiveUiLocale } from '../lib/interfaceLocaleState';
import { translatePlatformString } from '../lib/interfaceI18n';
import {
    CLIENT_VERBOSITY_SETTING,
    SERVER_VERBOSITY_SETTING,
} from '../../common/loggingSettings';
import {
    createAsyncCommandController,
    type AsyncCommandController,
    type AsyncCommandState,
} from '../lib/adminUi/asyncCommandState';
import {
    rejectLoad,
    resolveLoad,
    startLoad,
    type LoadableState,
} from '../lib/adminUi/loadableState';
import { createTemplateLifetime, type TemplateLifetime } from '../lib/adminUi/templateLifetime';
import {
    normalizeServerStatus,
    normalizeVerbosityLevel,
    radioChecked,
    type AdminMessage,
    type AdminServerStatus,
    type AdminVerbosityLevel,
} from './adminControlsState';

declare const DynamicSettings: {
    findOne(query: { _id: string }): { value: unknown } | undefined;
};

type MessageScope = 'load' | 'cache' | 'server-verbosity' | 'client-verbosity';

type AdminControlsInstance = Blaze.TemplateInstance & {
    serverStatusPresentation: ReactiveVar<LoadableState<AdminServerStatus>>;
    serverVerbosity: ReactiveVar<AdminVerbosityLevel | null>;
    clientVerbosity: ReactiveVar<AdminVerbosityLevel | null>;
    loggingSettingsReady: ReactiveVar<boolean>;
    loggingSettingsError: ReactiveVar<string>;
    serverVerbositySaving: ReactiveVar<boolean>;
    clientVerbositySaving: ReactiveVar<boolean>;
    adminMessages: ReactiveVar<Partial<Record<MessageScope, AdminMessage>>>;
    cacheCommandState: ReactiveVar<AsyncCommandState<void>>;
    cacheCommand: AsyncCommandController<void>;
    serverStatusLifetime: TemplateLifetime;
    nextServerStatusRequestId: number;
};

function adminText(key: Parameters<typeof translatePlatformString>[1], values?: Parameters<typeof translatePlatformString>[2]): string {
    return translatePlatformString(getActiveUiLocale(), key, values);
}

function formatError(err: unknown, fallback = adminText('admin.unknownError')): string {
    if (err instanceof Error && typeof err.message === 'string' && err.message.trim().length > 0) {
        return err.message;
    }
    return err ? String(err) : fallback;
}

function readyLoadValue<T>(state: LoadableState<T>): T | null {
    return state.status === 'ready'
        || state.status === 'empty'
        || state.status === 'refreshing'
        || state.status === 'refresh-error'
        ? state.value
        : null;
}

function loadErrorMessage<T>(state: LoadableState<T>): string {
    return state.status === 'error' || state.status === 'refresh-error' ? state.message : '';
}

function setAdminMessage(
    instance: AdminControlsInstance,
    text: string | null,
    level: AdminMessage['level'] = 'info',
    scope: MessageScope = 'load',
): void {
    const messages = { ...instance.adminMessages.get() };
    if (text) messages[scope] = { text, level };
    else delete messages[scope];
    instance.adminMessages.set(messages);
}

function loadServerStatus(instance: AdminControlsInstance): void {
    const requestId = ++instance.nextServerStatusRequestId;
    const generation = instance.serverStatusLifetime.begin();
    instance.serverStatusPresentation.set(startLoad(instance.serverStatusPresentation.get(), requestId));

    meteorCallAsync('getServerStatus')
        .then((result) => {
            if (!instance.serverStatusLifetime.isCurrent(generation)) return;
            instance.serverStatusPresentation.set(resolveLoad(
                instance.serverStatusPresentation.get(),
                requestId,
                normalizeServerStatus(result),
                () => false,
            ));
        })
        .catch((err) => {
            if (!instance.serverStatusLifetime.isCurrent(generation)) return;
            instance.serverStatusPresentation.set(rejectLoad(
                instance.serverStatusPresentation.get(),
                requestId,
                { message: adminText('admin.loadControlsFailed', { error: formatError(err) }), retryable: true },
            ));
        });
}

function subscribeToLoggingSettings(instance: AdminControlsInstance): void {
    instance.loggingSettingsReady.set(false);
    instance.loggingSettingsError.set('');
    instance.subscribe('settings', {
        onReady: () => instance.loggingSettingsReady.set(true),
        onStop: (err?: unknown) => {
            if (!err) return;
            instance.loggingSettingsReady.set(false);
            instance.loggingSettingsError.set(
                adminText('admin.loadControlsFailed', { error: formatError(err) }),
            );
        },
    });
}

Template.adminControls.onCreated(function (this: AdminControlsInstance) {
    this.serverStatusPresentation = new ReactiveVar<LoadableState<AdminServerStatus>>({ status: 'idle' });
    this.serverVerbosity = new ReactiveVar<AdminVerbosityLevel | null>(null);
    this.clientVerbosity = new ReactiveVar<AdminVerbosityLevel | null>(null);
    this.loggingSettingsReady = new ReactiveVar(false);
    this.loggingSettingsError = new ReactiveVar('');
    this.serverVerbositySaving = new ReactiveVar(false);
    this.clientVerbositySaving = new ReactiveVar(false);
    this.adminMessages = new ReactiveVar({});
    this.cacheCommandState = new ReactiveVar<AsyncCommandState<void>>({ status: 'idle' });
    this.cacheCommand = createAsyncCommandController((state) => this.cacheCommandState.set(state));
    this.serverStatusLifetime = createTemplateLifetime();
    this.nextServerStatusRequestId = 0;

    loadServerStatus(this);
    subscribeToLoggingSettings(this);

    this.autorun(() => {
        const serverSetting = DynamicSettings.findOne({ _id: SERVER_VERBOSITY_SETTING.id });
        const clientSetting = DynamicSettings.findOne({ _id: CLIENT_VERBOSITY_SETTING.id });
        try {
            if (serverSetting) this.serverVerbosity.set(normalizeVerbosityLevel(serverSetting.value));
            if (clientSetting) this.clientVerbosity.set(normalizeVerbosityLevel(clientSetting.value));
        } catch (err) {
            this.loggingSettingsError.set(
                adminText('admin.loadControlsFailed', { error: formatError(err) }),
            );
        }
    });
});

Template.adminControls.onDestroyed(function (this: AdminControlsInstance) {
    this.serverStatusLifetime.destroy();
    this.cacheCommand.destroy();
});

Template.adminControls.helpers({
    cacheMessage(): AdminMessage | null {
        return (Template.instance() as AdminControlsInstance).adminMessages.get().cache || null;
    },
    serverVerbosityMessage(): AdminMessage | null {
        return (Template.instance() as AdminControlsInstance).adminMessages.get()['server-verbosity'] || null;
    },
    clientVerbosityMessage(): AdminMessage | null {
        return (Template.instance() as AdminControlsInstance).adminMessages.get()['client-verbosity'] || null;
    },
    loadErrorText(): string {
        const instance = Template.instance() as AdminControlsInstance;
        return loadErrorMessage(instance.serverStatusPresentation.get())
            || instance.loggingSettingsError.get();
    },
    serverStatusReady(): boolean {
        return readyLoadValue((Template.instance() as AdminControlsInstance).serverStatusPresentation.get()) !== null;
    },
    serverStatus(): AdminServerStatus | null {
        return readyLoadValue((Template.instance() as AdminControlsInstance).serverStatusPresentation.get());
    },
    serverStorageSummary(): string {
        const status = readyLoadValue((Template.instance() as AdminControlsInstance).serverStatusPresentation.get());
        if (!status) return adminText('common.loading');
        return adminText('admin.serverStorageSummary', {
            usedPercent: status.diskSpacePercent || adminText('common.loading'),
            remaining: status.remainingSpace || adminText('common.loading'),
            total: status.diskSpace || adminText('common.loading'),
        });
    },
    serverVerbosityChecked(value: string): string {
        return radioChecked((Template.instance() as AdminControlsInstance).serverVerbosity.get(), value);
    },
    clientVerbosityChecked(value: string): string {
        return radioChecked((Template.instance() as AdminControlsInstance).clientVerbosity.get(), value);
    },
    serverVerbosityDisabled(): boolean {
        const instance = Template.instance() as AdminControlsInstance;
        return !instance.loggingSettingsReady.get()
            || instance.serverVerbosity.get() === null
            || instance.serverVerbositySaving.get();
    },
    clientVerbosityDisabled(): boolean {
        const instance = Template.instance() as AdminControlsInstance;
        return !instance.loggingSettingsReady.get()
            || instance.clientVerbosity.get() === null
            || instance.clientVerbositySaving.get();
    },
    cacheCommandBusy(): boolean {
        return (Template.instance() as AdminControlsInstance).cacheCommandState.get().status === 'pending';
    },
});

Template.adminControls.events({
    'click [data-admin-load-retry]'(event: Event, instance: AdminControlsInstance) {
        event.preventDefault();
        loadServerStatus(instance);
        subscribeToLoggingSettings(instance);
    },
    'change .serverVerbosityRadio'(event: Event, instance: AdminControlsInstance) {
        if (instance.serverVerbositySaving.get()) return;
        const previous = instance.serverVerbosity.get();
        const next = normalizeVerbosityLevel(
            (event.currentTarget as Element | null)?.getAttribute('data-verbosity'),
        );
        if (previous === next) return;

        instance.serverVerbosity.set(next);
        instance.serverVerbositySaving.set(true);
        setAdminMessage(instance, adminText('admin.savingLoggingSetting'), 'info', 'server-verbosity');
        void meteorCallAsync('setVerbosity', next)
            .then((confirmed) => {
                instance.serverVerbosity.set(normalizeVerbosityLevel(confirmed));
                setAdminMessage(instance, adminText('admin.serverVerbositySaved'), 'success', 'server-verbosity');
            })
            .catch((err) => {
                instance.serverVerbosity.set(previous);
                setAdminMessage(
                    instance,
                    adminText('admin.updateServerVerbosityFailed', { error: formatError(err) }),
                    'error',
                    'server-verbosity',
                );
            })
            .finally(() => instance.serverVerbositySaving.set(false));
    },
    'change .clientVerbosityRadio'(event: Event, instance: AdminControlsInstance) {
        if (instance.clientVerbositySaving.get()) return;
        const previous = instance.clientVerbosity.get();
        const next = normalizeVerbosityLevel(
            (event.currentTarget as Element | null)?.getAttribute('data-verbosity'),
        );
        if (previous === next) return;

        instance.clientVerbosity.set(next);
        instance.clientVerbositySaving.set(true);
        setAdminMessage(instance, adminText('admin.savingLoggingSetting'), 'info', 'client-verbosity');
        void meteorCallAsync('setClientVerbosity', next)
            .then((confirmed) => {
                instance.clientVerbosity.set(normalizeVerbosityLevel(confirmed));
                setAdminMessage(instance, adminText('admin.clientVerbositySaved'), 'success', 'client-verbosity');
            })
            .catch((err) => {
                instance.clientVerbosity.set(previous);
                setAdminMessage(
                    instance,
                    adminText('admin.updateClientVerbosityFailed', { error: formatError(err) }),
                    'error',
                    'client-verbosity',
                );
            })
            .finally(() => instance.clientVerbositySaving.set(false));
    },
    'click #updateStimDisplayTypeMap'(event: Event, instance: AdminControlsInstance) {
        event.preventDefault();
        setAdminMessage(instance, null, 'info', 'cache');
        void instance.cacheCommand.run(async () => {
            await meteorCallAsync('updateStimDisplayTypeMap');
        }, {
            getErrorMessage: (err) => adminText('admin.displayCacheRebuildFailed', { error: formatError(err) }),
            onSuccess: () => {
                setAdminMessage(instance, adminText('admin.displayCacheRebuilt'), 'success', 'cache');
            },
            onFailure: (err) => {
                setAdminMessage(instance, adminText('admin.displayCacheRebuildFailed', { error: formatError(err) }), 'error', 'cache');
            },
        });
    },
});
