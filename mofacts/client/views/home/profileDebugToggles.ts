import {
    getDebugParms,
    setDebugParms,
    type DebugParms,
} from '../experiment/svelte/services/debugRuntimeState';
import './profileDebugToggles.html';

declare const Template: {
    profileDebugToggles: {
        rendered: () => void;
        helpers(map: Record<string, () => unknown>): void;
        events(map: Record<string, () => void>): void;
    };
};
declare const $: (selector: string) => { prop(name: string, value: unknown): void };

Template.profileDebugToggles.rendered = function() {
    const debugParms = getDebugParms();
    if(debugParms)
        $('#debugProbParmsDisplay').prop('checked', debugParms.probParmsDisplay);
}
Template.profileDebugToggles.helpers({
    debugParms: () => {
        return getDebugParms();
    }
});

Template.profileDebugToggles.events({
    'click #debugProbParmsDisplay': function() {
        const debugParms = (getDebugParms() || {}) as DebugParms;
        debugParms.probParmsDisplay = !debugParms.probParmsDisplay;
        $('#debugProbParmsDisplay').prop('checked', debugParms.probParmsDisplay);
        setDebugParms(debugParms);
        
    },
});

