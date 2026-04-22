import { CardStore } from '../experiment/modules/cardStore';
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
    const debugParms = CardStore.getDebugParms() as { probParmsDisplay?: boolean } | null;
    if(debugParms)
        $('#debugProbParmsDisplay').prop('checked', debugParms.probParmsDisplay);
}
Template.profileDebugToggles.helpers({
    debugParms: () => {
        return CardStore.getDebugParms();
    }
});

Template.profileDebugToggles.events({
    'click #debugProbParmsDisplay': function() {
        const debugParms = (CardStore.getDebugParms() || {}) as { probParmsDisplay?: boolean };
        debugParms.probParmsDisplay = !debugParms.probParmsDisplay;
        $('#debugProbParmsDisplay').prop('checked', debugParms.probParmsDisplay);
        CardStore.setDebugParms(debugParms);
        
    },
});

