import { Template } from 'meteor/templating';
import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { clientConsole } from '../../lib/userSessionHelpers';
import { finishLaunchLoading, markLaunchLoadingTiming, setLaunchLoadingMessage } from '../../lib/launchLoading';
import { translatePlatformString } from '../../lib/interfaceI18n';
import { getActiveUiLocale } from '../../lib/interfaceLocaleState';
import { createBlazeMount } from './svelte/meteorIntegration';
import { beginLearningAttempt } from './svelte/services/attemptIdentity';
import './card.html';

let ContentSurfaceModule: unknown = null;

async function loadContentSurface() {
  if (!ContentSurfaceModule) {
    const mod = await import('./svelte/components/ContentSurface.svelte');
    ContentSurfaceModule = mod.default;
  }
  return ContentSurfaceModule;
}

type CardTemplateInstance = {
  svelteMount?: { cleanup(): void } | null;
  isDestroyed?: boolean;
  $(selector: string): HTMLElement[];
};

Template.card.onRendered(function (this: CardTemplateInstance) {
  const template = this;
  template.isDestroyed = false;
  setLaunchLoadingMessage(translatePlatformString(getActiveUiLocale(), 'common.loadingContent'));
  markLaunchLoadingTiming('cardRoute:entered');
  const attemptId = beginLearningAttempt(Session.get('currentTdfName'));

  const mountContentSurface = () => {
    const target = template.$('#svelte-card-root')[0];
    if (!target) {
      clientConsole(1, '[Card Router] Could not find #svelte-card-root element');
      return;
    }

    const getReactiveProps = () => {
      return {
        tdfId: Session.get('currentRootTdfId') || Session.get('currentTdfId'),
        unitId: Session.get('currentUnitNumber'),
        userId: Meteor.userId(),
        attemptId,
        engineIndices: Session.get('engineIndices'),
        experimentTarget: Session.get('experimentTarget'),
        experimentXCond: Session.get('experimentXCond'),
      };
    };
    clientConsole(2, '[Card Router] Mounting content surface identity', {
      userId: Meteor.userId(),
      attemptId,
      unitId: Session.get('currentUnitNumber'),
      tdfId: Session.get('currentRootTdfId') || Session.get('currentTdfId'),
    });

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
  };
  mountContentSurface();
});

Template.card.onDestroyed(function (this: CardTemplateInstance) {
  this.isDestroyed = true;
  if (this.svelteMount) {
    this.svelteMount.cleanup();
    this.svelteMount = null;
  }
  Session.set('useNewCard', undefined);
});
