import { Template } from 'meteor/templating';
import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { Tracker } from 'meteor/tracker';
import { clientConsole } from '../../lib/userSessionHelpers';
import { finishLaunchLoading, markLaunchLoadingTiming, setLaunchLoadingMessage } from '../../lib/launchLoading';
import { createBlazeMount } from './svelte/meteorIntegration';
import { restartMainCardTimeoutIfNecessary } from './modules/cardTimeouts';
import { CardStore } from './modules/cardStore';
import './card.html';

let CardScreenModule: unknown = null;

async function loadCardScreen() {
  if (!CardScreenModule) {
    const mod = await import('./svelte/components/CardScreen.svelte');
    CardScreenModule = mod.default;
  }
  return CardScreenModule;
}

function getCardState(key: string) {
  return CardStore.getCardValue(key);
}

function setCardState(key: string, value: unknown) {
  CardStore.setCardValue(key, value);
}

type CardTemplateInstance = {
  svelteMount?: { cleanup(): void } | null;
  isDestroyed?: boolean;
  $(selector: string): HTMLElement[];
};

Template.card.onRendered(function (this: CardTemplateInstance) {
  const template = this;
  setLaunchLoadingMessage('Preparing first trial...');
  markLaunchLoadingTiming('cardRoute:entered');

  Tracker.afterFlush(() => {
    if (template.svelteMount) {
      return;
    }

    const target = template.$('#svelte-card-root')[0];
    if (!target) {
      clientConsole(1, '[Card Router] Could not find #svelte-card-root element');
      return;
    }

    const getReactiveProps = () => {
      return {
        tdfId: Session.get('currentRootTdfId') || Session.get('currentTdfId'),
        unitId: Session.get('currentUnitNumber'),
        sessionId: Meteor.userId(),
        engineIndices: Session.get('engineIndices'),
        experimentTarget: Session.get('experimentTarget'),
        experimentXCond: Session.get('experimentXCond'),
      };
    };

    markLaunchLoadingTiming('cardRoute:loadCardScreen:start');
    loadCardScreen().then((CardScreen) => {
      markLaunchLoadingTiming('cardRoute:loadCardScreen:complete');
      if (template.isDestroyed || template.svelteMount) return;
      try {
        template.svelteMount = createBlazeMount(target, CardScreen, {}, getReactiveProps);
      } catch (error) {
        markLaunchLoadingTiming('cardRoute:mount:failed');
        finishLaunchLoading('card-mount-failed');
        clientConsole(1, '[Card Router] Error mounting Svelte component:', error);
      }
    }).catch((error) => {
      markLaunchLoadingTiming('cardRoute:loadCardScreen:failed');
      finishLaunchLoading('card-chunk-load-failed');
      clientConsole(1, '[Card Router] Error loading CardScreen chunk:', error);
    });
  });
});

Template.card.onDestroyed(function (this: CardTemplateInstance) {
  if (this.svelteMount) {
    this.svelteMount.cleanup();
    this.svelteMount = null;
  }
  Session.set('useNewCard', undefined);
});

export {
  restartMainCardTimeoutIfNecessary,
  getCardState,
  setCardState,
};





