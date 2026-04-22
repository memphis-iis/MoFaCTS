// PHASE 1.5: Removed unused getCurrentTheme import - now uses reactive subscription
import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';
import './adminControls.html';
import { clientConsole } from '../lib/userSessionHelpers';
import { meteorCallAsync } from '..';

declare const $: (selector: string) => { prop(name: string, value: unknown): void };
declare const DynamicSettings: {
    findOne(query: { key: string }): { value: unknown } | undefined;
};

const ADMIN_MESSAGE_KEY = 'adminControlsMessage';

function formatError(err: unknown, fallback = 'Unknown error.'): string {
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

    let className = 'alert-info';
    if (level === 'error') {
        className = 'alert-danger';
    } else if (level === 'success') {
        className = 'alert-success';
    }

    Session.set(ADMIN_MESSAGE_KEY, { text, className });
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
            setAdminMessage(`Server storage status is unavailable: ${serverStatus.error}`, 'error');
        }
    } catch (err) {
        setAdminMessage(`Failed to load admin controls: ${formatError(err)}`, 'error');
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
        return Session.get('serverStatus') || {
            diskSpacePercent: 'Loading...',
            remainingSpace: 'Loading...',
            diskSpace: 'Loading...',
            diskSpaceUsed: 'Loading...',
            error: null
        };
    },
    'adminMessage': function() {
        return Session.get(ADMIN_MESSAGE_KEY);
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
            setAdminMessage(`Failed to update client verbosity: ${formatError(err)}`, 'error');
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
        } catch (err) {
            setAdminMessage(`Failed to clear stim display type map: ${formatError(err)}`, 'error');
        }
    }
});
  







