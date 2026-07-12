import { Template } from 'meteor/templating';
import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { clientConsole } from '../../lib/userSessionHelpers';
import { finishLaunchLoading, markLaunchLoadingTiming, setLaunchLoadingMessage } from '../../lib/launchLoading';
import { translatePlatformString } from '../../lib/interfaceI18n';
import { getActiveUiLocale } from '../../lib/interfaceLocaleState';
import { createBlazeMount } from './svelte/meteorIntegration';
import './content.html';

let ContentSurfaceModule: unknown = null;

async function loadContentSurface() {
  if (!ContentSurfaceModule) {
    const mod = await import('./svelte/components/ContentSurface.svelte');
    ContentSurfaceModule = mod.default;
  }
  return ContentSurfaceModule;
}

type ContentTemplateInstance = {
  svelteMount?: { cleanup(): void } | null;
  isDestroyed?: boolean;
  $(selector: string): HTMLElement[];
};

Template.content.onRendered(function (this: ContentTemplateInstance) {
  const template = this;
  template.isDestroyed = false;
  setLaunchLoadingMessage(translatePlatformString(getActiveUiLocale(), 'common.loadingContent'));
  markLaunchLoadingTiming('contentRoute:entered');
  const mountContentSurface = () => {
    const target = template.$('#content-root')[0];
    if (!target) {
      clientConsole(1, '[Content Route] Could not find #content-root element');
      return;
    }

    const getReactiveProps = () => {
      return {
        tdfId: Session.get('currentRootTdfId') || Session.get('currentTdfId'),
        unitId: Session.get('currentUnitNumber'),
        userId: Meteor.userId(),
        engineIndices: Session.get('engineIndices'),
        experimentTarget: Session.get('experimentTarget'),
        experimentXCond: Session.get('experimentXCond'),
      };
    };
    clientConsole(2, '[Content Route] Mounting content surface identity', {
      userId: Meteor.userId(),
      unitId: Session.get('currentUnitNumber'),
      tdfId: Session.get('currentRootTdfId') || Session.get('currentTdfId'),
    });

    // The content route mounts the app-owned content runtime surface.
    markLaunchLoadingTiming('contentRoute:loadContentSurface:start');
    loadContentSurface().then((ContentSurface) => {
      markLaunchLoadingTiming('contentRoute:loadContentSurface:complete');
      if (template.isDestroyed || template.svelteMount || !target.isConnected) return;
      try {
        template.svelteMount = createBlazeMount(target, ContentSurface, {}, getReactiveProps);
      } catch (error) {
        markLaunchLoadingTiming('contentRoute:mount:failed');
        finishLaunchLoading('content-mount-failed');
        clientConsole(1, '[Content Route] Error mounting Svelte component:', error);
      }
    }).catch((error) => {
      markLaunchLoadingTiming('contentRoute:loadContentSurface:failed');
      finishLaunchLoading('content-chunk-load-failed');
      clientConsole(1, '[Content Route] Error loading ContentSurface chunk:', error);
    });
  };
  mountContentSurface();
});

Template.content.onDestroyed(function (this: ContentTemplateInstance) {
  this.isDestroyed = true;
  if (this.svelteMount) {
    this.svelteMount.cleanup();
    this.svelteMount = null;
  }
  Session.set('useNewCard', undefined);
});
