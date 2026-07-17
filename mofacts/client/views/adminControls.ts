import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import './adminControls.html';
import './adminControls.css';
import './shared/adminUi/adminUi';
import { clientConsole } from '../lib/userSessionHelpers';
import { meteorCallAsync } from '..';
import { getActiveUiLocale } from '../lib/interfaceLocaleState';
import { translatePlatformString } from '../lib/interfaceI18n';
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
    findOne(query: { key: string }): { value: unknown } | undefined;
};

type AdminControlsInstance = Blaze.TemplateInstance & {
    autoruns: Array<{ stop(): void }>;
    serverStatusPresentation: ReactiveVar<LoadableState<AdminServerStatus>>;
    serverVerbosityPresentation: ReactiveVar<LoadableState<AdminVerbosityLevel>>;
    clientVerbosityPresentation: ReactiveVar<LoadableState<AdminVerbosityLevel>>;
    adminMessages: ReactiveVar<Partial<Record<'load' | 'cache' | 'server-verbosity' | 'client-verbosity', AdminMessage>>>;
    serverVerbosityCommandState: ReactiveVar<AsyncCommandState<void>>;
    clientVerbosityCommandState: ReactiveVar<AsyncCommandState<void>>;
    cacheCommandState: ReactiveVar<AsyncCommandState<void>>;
    serverVerbosityCommand: AsyncCommandController<void>;
    clientVerbosityCommand: AsyncCommandController<void>;
    cacheCommand: AsyncCommandController<void>;
    serverStatusLifetime: TemplateLifetime;
    serverVerbosityLifetime: TemplateLifetime;
    clientVerbosityLifetime: TemplateLifetime;
    nextServerStatusRequestId: number;
    nextServerVerbosityRequestId: number;
    nextClientVerbosityRequestId: number;
};

function adminText(key: Parameters<typeof translatePlatformString>[1], values?: Parameters<typeof translatePlatformString>[2]): string {
    return translatePlatformString(getActiveUiLocale(), key, values);
}

function formatError(err: unknown, fallback = adminText('admin.unknownError')): string {
    if (err instanceof Error && typeof err.message === 'string' && err.message.trim().length > 0) {
        return err.message;
    }
    if (err) {
        return String(err);
    }
    return fallback;
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

function loadPending<T>(state: LoadableState<T>): boolean {
    return state.status === 'idle' || state.status === 'loading' || state.status === 'refreshing';
}

function setAdminMessage(
    instance: AdminControlsInstance,
    text: string | null,
    level: AdminMessage['level'] = 'info',
    scope: 'load' | 'cache' | 'server-verbosity' | 'client-verbosity' = 'load',
): void {
    const messages = { ...instance.adminMessages.get() };
    if (text) messages[scope] = { text, level };
    else delete messages[scope];
    instance.adminMessages.set(messages);
}

function currentServerVerbosity(instance: AdminControlsInstance): AdminVerbosityLevel | null {
    return readyLoadValue(instance.serverVerbosityPresentation.get());
}

function currentClientVerbosity(instance: AdminControlsInstance): AdminVerbosityLevel | null {
    return readyLoadValue(instance.clientVerbosityPresentation.get());
}

function loadServerStatus(instance: AdminControlsInstance): void {
    const requestId = ++instance.nextServerStatusRequestId;
    const generation = instance.serverStatusLifetime.begin();
    instance.serverStatusPresentation.set(startLoad(instance.serverStatusPresentation.get(), requestId));

    meteorCallAsync('getServerStatus')
        .then((result) => {
            if (!instance.serverStatusLifetime.isCurrent(generation)) return;
            const status = normalizeServerStatus(result);
            instance.serverStatusPresentation.set(resolveLoad(
                instance.serverStatusPresentation.get(),
                requestId,
                status,
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

function loadServerVerbosity(instance: AdminControlsInstance): void {
    const requestId = ++instance.nextServerVerbosityRequestId;
    const generation = instance.serverVerbosityLifetime.begin();
    instance.serverVerbosityPresentation.set(startLoad(instance.serverVerbosityPresentation.get(), requestId));

    meteorCallAsync('getVerbosity')
        .then((result) => {
            if (!instance.serverVerbosityLifetime.isCurrent(generation)) return;
            instance.serverVerbosityPresentation.set(resolveLoad(
                instance.serverVerbosityPresentation.get(),
                requestId,
                normalizeVerbosityLevel(result),
                () => false,
            ));
        })
        .catch((err) => {
            if (!instance.serverVerbosityLifetime.isCurrent(generation)) return;
            instance.serverVerbosityPresentation.set(rejectLoad(
                instance.serverVerbosityPresentation.get(),
                requestId,
                { message: adminText('admin.loadControlsFailed', { error: formatError(err) }), retryable: true },
            ));
        });
}

function loadClientVerbosityFromSettings(instance: AdminControlsInstance): void {
    const requestId = ++instance.nextClientVerbosityRequestId;
    const generation = instance.clientVerbosityLifetime.begin();
    instance.clientVerbosityPresentation.set(startLoad(instance.clientVerbosityPresentation.get(), requestId));

    instance.subscribe('settings', {
        onReady: () => {
            if (!instance.clientVerbosityLifetime.isCurrent(generation)) return;
            try {
                const settingDoc = DynamicSettings.findOne({ key: 'clientVerbosityLevel' });
                const value = settingDoc?.value ?? 0;
                instance.clientVerbosityPresentation.set(resolveLoad(
                    instance.clientVerbosityPresentation.get(),
                    requestId,
                    normalizeVerbosityLevel(value),
                    () => false,
                ));
            } catch (err) {
                instance.clientVerbosityPresentation.set(rejectLoad(
                    instance.clientVerbosityPresentation.get(),
                    requestId,
                    { message: adminText('admin.loadControlsFailed', { error: formatError(err) }), retryable: true },
                ));
            }
        },
        onStop: (err?: unknown) => {
            if (!err || !instance.clientVerbosityLifetime.isCurrent(generation)) return;
            instance.clientVerbosityPresentation.set(rejectLoad(
                instance.clientVerbosityPresentation.get(),
                requestId,
                { message: adminText('admin.loadControlsFailed', { error: formatError(err) }), retryable: true },
            ));
        },
    });

    void meteorCallAsync('ensureClientVerbositySetting')
        .catch((err) => {
            if (!instance.clientVerbosityLifetime.isCurrent(generation)) return;
            instance.clientVerbosityPresentation.set(rejectLoad(
                instance.clientVerbosityPresentation.get(),
                requestId,
                { message: adminText('admin.loadControlsFailed', { error: formatError(err) }), retryable: true },
            ));
        });
}

function syncClientVerbosityFromSettings(instance: AdminControlsInstance): void {
    const state = instance.clientVerbosityPresentation.get();
    if (state.status !== 'ready' && state.status !== 'empty' && state.status !== 'refresh-error') {
        return;
    }
    const settingDoc = DynamicSettings.findOne({ key: 'clientVerbosityLevel' });
    if (!settingDoc || settingDoc.value === undefined || settingDoc.value === null) {
        return;
    }
    try {
        const level = normalizeVerbosityLevel(settingDoc.value);
        if (readyLoadValue(state) !== level) {
            instance.clientVerbosityPresentation.set({ status: 'ready', value: level });
        }
    } catch (err) {
        setAdminMessage(instance, adminText('admin.loadControlsFailed', { error: formatError(err) }), 'error');
    }
}

Template.adminControls.onCreated(function (this: AdminControlsInstance) {
    this.autoruns = [];
    this.serverStatusPresentation = new ReactiveVar<LoadableState<AdminServerStatus>>({ status: 'idle' });
    this.serverVerbosityPresentation = new ReactiveVar<LoadableState<AdminVerbosityLevel>>({ status: 'idle' });
    this.clientVerbosityPresentation = new ReactiveVar<LoadableState<AdminVerbosityLevel>>({ status: 'idle' });
    this.adminMessages = new ReactiveVar({});
    this.serverVerbosityCommandState = new ReactiveVar<AsyncCommandState<void>>({ status: 'idle' });
    this.clientVerbosityCommandState = new ReactiveVar<AsyncCommandState<void>>({ status: 'idle' });
    this.cacheCommandState = new ReactiveVar<AsyncCommandState<void>>({ status: 'idle' });
    this.serverVerbosityCommand = createAsyncCommandController((state) => this.serverVerbosityCommandState.set(state));
    this.clientVerbosityCommand = createAsyncCommandController((state) => this.clientVerbosityCommandState.set(state));
    this.cacheCommand = createAsyncCommandController((state) => this.cacheCommandState.set(state));
    this.serverStatusLifetime = createTemplateLifetime();
    this.serverVerbosityLifetime = createTemplateLifetime();
    this.clientVerbosityLifetime = createTemplateLifetime();
    this.nextServerStatusRequestId = 0;
    this.nextServerVerbosityRequestId = 0;
    this.nextClientVerbosityRequestId = 0;

    loadServerStatus(this);
    loadServerVerbosity(this);
    loadClientVerbosityFromSettings(this);

    this.autoruns.push(this.autorun(() => {
        syncClientVerbosityFromSettings(this);
    }));
});

Template.adminControls.onDestroyed(function (this: AdminControlsInstance) {
    this.autoruns.forEach((ar: { stop(): void }) => ar.stop());
    this.serverStatusLifetime.destroy();
    this.serverVerbosityLifetime.destroy();
    this.clientVerbosityLifetime.destroy();
    this.serverVerbosityCommand.destroy();
    this.clientVerbosityCommand.destroy();
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
            || loadErrorMessage(instance.serverVerbosityPresentation.get())
            || loadErrorMessage(instance.clientVerbosityPresentation.get());
    },
    serverStatusReady(): boolean {
        return readyLoadValue((Template.instance() as AdminControlsInstance).serverStatusPresentation.get()) !== null;
    },
    serverStatus(): AdminServerStatus | null {
        return readyLoadValue((Template.instance() as AdminControlsInstance).serverStatusPresentation.get());
    },
    serverStorageSummary(): string {
        const status = readyLoadValue((Template.instance() as AdminControlsInstance).serverStatusPresentation.get());
        if (!status) {
            return adminText('common.loading');
        }
        return adminText('admin.serverStorageSummary', {
            usedPercent: status.diskSpacePercent || adminText('common.loading'),
            remaining: status.remainingSpace || adminText('common.loading'),
            total: status.diskSpace || adminText('common.loading'),
        });
    },
    serverVerbosityChecked(value: string): string {
        return radioChecked(currentServerVerbosity(Template.instance() as AdminControlsInstance), value);
    },
    clientVerbosityChecked(value: string): string {
        return radioChecked(currentClientVerbosity(Template.instance() as AdminControlsInstance), value);
    },
    serverVerbosityDisabled(): boolean {
        const instance = Template.instance() as AdminControlsInstance;
        return loadPending(instance.serverVerbosityPresentation.get())
            || instance.serverVerbosityCommandState.get().status === 'pending';
    },
    clientVerbosityDisabled(): boolean {
        const instance = Template.instance() as AdminControlsInstance;
        return loadPending(instance.clientVerbosityPresentation.get())
            || instance.clientVerbosityCommandState.get().status === 'pending';
    },
    cacheCommandBusy(): boolean {
        return (Template.instance() as AdminControlsInstance).cacheCommandState.get().status === 'pending';
    },
});

Template.adminControls.events({
    'click [data-admin-load-retry]'(event: Event, instance: AdminControlsInstance) {
        event.preventDefault();
        setAdminMessage(instance, null, 'info', 'server-verbosity');
        loadServerStatus(instance);
        loadServerVerbosity(instance);
        loadClientVerbosityFromSettings(instance);
    },
    'click .serverVerbosityRadio'(event: Event, instance: AdminControlsInstance) {
        event.preventDefault();
        if (instance.serverVerbosityCommandState.get().status === 'pending') return;
        const previous = currentServerVerbosity(instance);
        const target = event.currentTarget as Element | null;
        const next = normalizeVerbosityLevel(target?.getAttribute('data-verbosity'));
        if (previous === next) return;

        instance.serverVerbosityPresentation.set({ status: 'ready', value: next });
        setAdminMessage(instance, null, 'info', 'server-verbosity');
        void instance.serverVerbosityCommand.run(async () => {
            await meteorCallAsync('setVerbosity', next);
        }, {
            getErrorMessage: (err) => adminText('admin.loadControlsFailed', { error: formatError(err) }),
            onFailure: (err) => {
                if (previous) {
                    instance.serverVerbosityPresentation.set({ status: 'ready', value: previous });
                }
                setAdminMessage(instance, adminText('admin.loadControlsFailed', { error: formatError(err) }), 'error', 'server-verbosity');
            },
        });
    },
    'click .clientVerbosityRadio'(event: Event, instance: AdminControlsInstance) {
        event.preventDefault();
        if (instance.clientVerbosityCommandState.get().status === 'pending') return;
        const previous = currentClientVerbosity(instance);
        const target = event.currentTarget as Element | null;
        const next = normalizeVerbosityLevel(target?.getAttribute('data-verbosity'));
        if (previous === next) return;

        instance.clientVerbosityPresentation.set({ status: 'ready', value: next });
        setAdminMessage(instance, null, 'info', 'client-verbosity');
        void instance.clientVerbosityCommand.run(async () => {
            await meteorCallAsync('setClientVerbosity', next);
        }, {
            getErrorMessage: (err) => adminText('admin.updateClientVerbosityFailed', { error: formatError(err) }),
            onFailure: (err) => {
                clientConsole(1, 'Error setting client verbosity:', err);
                if (previous) {
                    instance.clientVerbosityPresentation.set({ status: 'ready', value: previous });
                }
                setAdminMessage(instance, adminText('admin.updateClientVerbosityFailed', { error: formatError(err) }), 'error', 'client-verbosity');
            },
        });
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
