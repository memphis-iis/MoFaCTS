import { Template } from 'meteor/templating';
import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { Tracker } from 'meteor/tracker';
import { clientConsole } from '../../lib/userSessionHelpers';
import { finishLaunchLoading, markLaunchLoadingTiming, setLaunchLoadingMessage } from '../../lib/launchLoading';
import { createBlazeMount } from './svelte/meteorIntegration';
import { CardStore } from './modules/cardStore';
import './card.html';

let ContentSurfaceModule: unknown = null;

async function loadContentSurface() {
  if (!ContentSurfaceModule) {
    const mod = await import('./svelte/components/ContentSurface.svelte');
    ContentSurfaceModule = mod.default;
  }
  return ContentSurfaceModule;
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
  template.isDestroyed = false;
  setLaunchLoadingMessage('Loading content...');
  markLaunchLoadingTiming('cardRoute:entered');

  Tracker.afterFlush(() => {
    if (template.isDestroyed || template.svelteMount) {
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

    // The legacy card route mounts the app-owned content runtime surface.
    markLaunchLoadingTiming('cardRoute:loadContentSurface:start');
    loadContentSurface().then((ContentSurface) => {
      markLaunchLoadingTiming('cardRoute:loadContentSurface:complete');
      if (template.isDestroyed || template.svelteMount || !target.isConnected) return;
      try {
        template.svelteMount = createBlazeMount(target, ContentSurface, {}, getReactiveProps);
      } catch (error) {
        markLaunchLoadingTiming('cardRoute:mount:failed');
        finishLaunchLoading('card-mount-failed');
        clientConsole(1, '[Card Router] Error mounting Svelte component:', error);
      }
    }).catch((error) => {
      markLaunchLoadingTiming('cardRoute:loadContentSurface:failed');
      finishLaunchLoading('card-chunk-load-failed');
      clientConsole(1, '[Card Router] Error loading ContentSurface chunk:', error);
    });
  });
});

Template.card.onDestroyed(function (this: CardTemplateInstance) {
  this.isDestroyed = true;
  if (this.svelteMount) {
    this.svelteMount.cleanup();
    this.svelteMount = null;
  }
  Session.set('useNewCard', undefined);
});

export {
  getCardState,
  setCardState,
};





