// PHASE 1.5: Removed unused getCurrentTheme import - now uses reactive subscription
import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';
import './adminControls.html';
import { clientConsole } from '../lib/userSessionHelpers';
import { meteorCallAsync } from '..';
import { getActiveUiLocale } from '../lib/interfaceLocaleState';
import { translatePlatformString } from '../lib/interfaceI18n';

declare const $: (selector: string) => { prop(name: string, value: unknown): void };
declare const DynamicSettings: {
    findOne(query: { key: string }): { value: unknown } | undefined;
};

const ADMIN_MESSAGE_KEY = 'adminControlsMessage';

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

function setAdminMessage(text: string | null, level = 'info'): void {
    if (!text) {
        Session.set(ADMIN_MESSAGE_KEY, null);
        return;
    }

    const icon = level === 'error'
        ? 'fa-times-circle'
        : level === 'success'
            ? 'fa-check-circle'
            : 'fa-info-circle';

    Session.set(ADMIN_MESSAGE_KEY, { text, level, icon });
}

Template.adminControls.onCreated(async function (this: { autoruns: Array<{ stop(): void }>; subscribe(name: string): void }) {
    // Track autoruns for cleanup
    this.autoruns = [];
    setAdminMessage(null);

    // Subscribe to DynamicSettings collection to get client verbosity level
    this.subscribe('settings');

    // Parallelize all async calls for faster page load
    try {
        const [verbosity, serverStatus] = await Promise.all([
            meteorCallAsync('getVerbosity'),
            meteorCallAsync('getServerStatus'),
            meteorCallAsync('ensureClientVerbositySetting') // Fire and forget, result not needed
        ]) as [
            string | number,
            {
                diskSpacePercent?: string;
                remainingSpace?: string;
                diskSpace?: string;
                diskSpaceUsed?: string;
                error?: string | null;
            },
            unknown
        ];

        
        $(`#verbosityRadio${verbosity}`).prop('checked', true);

        Session.set('serverStatus', serverStatus);
        if (serverStatus?.error) {
            setAdminMessage(adminText('admin.storageStatusUnavailable', { error: serverStatus.error }), 'error');
        }
    } catch (err) {
        setAdminMessage(adminText('admin.loadControlsFailed', { error: formatError(err) }), 'error');
    }
});

Template.adminControls.onRendered(function (this: { autoruns: Array<{ stop(): void }>; autorun(cb: () => void): { stop(): void } }) {
    // Reactively check the client verbosity radio button when data is ready
    const autorun = this.autorun(() => {
        const settingDoc = DynamicSettings.findOne({key: 'clientVerbosityLevel'});
        if (settingDoc && settingDoc.value !== undefined) {
            const clientVerbosityLevel = String(settingDoc.value);
            const radioId = `clientVerbosityRadio${clientVerbosityLevel}`;
            
            const radioElement = document.getElementById(radioId) as HTMLInputElement | null;
            if (radioElement) {
                radioElement.checked = true;
            }
        }
    });
    this.autoruns.push(autorun);
});

Template.adminControls.onDestroyed(function (this: { autoruns: Array<{ stop(): void }> }) {
    // Clean up autoruns
    this.autoruns.forEach((ar: { stop(): void }) => ar.stop());
    setAdminMessage(null);
});

Template.adminControls.helpers({
    'serverStatus': function() {
        const loading = adminText('common.loading');
        return Session.get('serverStatus') || {
            diskSpacePercent: loading,
            remainingSpace: loading,
            diskSpace: loading,
            diskSpaceUsed: loading,
            error: null
        };
    },
    'adminMessage': function() {
        return Session.get(ADMIN_MESSAGE_KEY);
    },
    'serverStorageSummary': function() {
        const status = Session.get('serverStatus') || {};
        return adminText('admin.serverStorageSummary', {
            usedPercent: status.diskSpacePercent || adminText('common.loading'),
            remaining: status.remainingSpace || adminText('common.loading'),
            total: status.diskSpace || adminText('common.loading'),
        });
    }
});

Template.adminControls.events({
    'click .serverVerbosityRadio': function(event: Event) {
        
        const target = event.currentTarget as Element | null;
        const name = target?.getAttribute('id') || '';
        const start = name.length - 1;
        const verbosity = name.slice(start, name.length)
        meteorCallAsync('setVerbosity', verbosity);
    },
    'click .clientVerbosityRadio': async function(event: Event) {
        
        const target = event.currentTarget as Element | null;
        const name = target?.getAttribute('id') || '';
        const start = name.length - 1;
        const verbosity = name.slice(start, name.length);

        try {
            await meteorCallAsync('setClientVerbosity', verbosity);
            
        } catch (err) {
            clientConsole(1, 'Error setting client verbosity:', err);
            setAdminMessage(adminText('admin.updateClientVerbosityFailed', { error: formatError(err) }), 'error');
            // Revert radio button on error
            const currentDoc = DynamicSettings.findOne({key: 'clientVerbosityLevel'});
            if (currentDoc && currentDoc.value !== undefined && currentDoc.value !== null) {
                const currentValue = String(currentDoc.value);
                const radioId = `clientVerbosityRadio${currentValue}`;
                const radioElement = document.getElementById(radioId) as HTMLInputElement | null;
                if (radioElement) {
                    radioElement.checked = true;
                }
            }
        }
    },
    'click #updateStimDisplayTypeMap': async function() {
        try {
            await meteorCallAsync('updateStimDisplayTypeMap');
            setAdminMessage(adminText('admin.displayCacheRebuilt'), 'success');
        } catch (err) {
            setAdminMessage(adminText('admin.displayCacheRebuildFailed', { error: formatError(err) }), 'error');
        }
    }
});
  







