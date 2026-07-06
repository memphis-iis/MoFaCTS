import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Tracker } from 'meteor/tracker';
import './sparcEdit.html';
import SparcAuthoringEditor from './sparc/SparcAuthoringEditor.svelte';
import { createBlazeMount } from '../experiment/svelte/meteorIntegration';
import { meteorCallAsync } from '../..';
import { clientConsole } from '../../lib/clientLogger';

const FlowRouter = (globalThis as any).FlowRouter;
const TdfsCollection = (globalThis as any).Tdfs;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function findTdf(selector: any) {
  return TdfsCollection?.findOne ? TdfsCollection.findOne(selector) : null;
}

function isSparcPageDisplay(display: any): boolean {
  return display
    && typeof display === 'object'
    && Array.isArray(display.nodes);
}

function hasSparcPages(tdf: any): boolean {
  const sparcPages = tdf?.rawStimuliFile?.setspec?.sparcPages;
  if (!Array.isArray(sparcPages)) {
    return false;
  }
  return sparcPages.some((page: any) => isSparcPageDisplay(page?.display));
}

Template.sparcEdit.onCreated(function(this: any) {
  this.tdfId = FlowRouter.getParam('tdfId');
  this.subscribe('tdfForEdit', this.tdfId);
  this.subscribe('files.assets.all');
  this.mounted = new ReactiveVar(false);
  this.svelteMount = null;
});

Template.sparcEdit.onRendered(function(this: any) {
  const instance = this;

  function mountEditor() {
    if (instance.mounted.get()) {
      return;
    }

    const tdf = findTdf({ _id: instance.tdfId });
    if (!tdf || !hasSparcPages(tdf)) {
      return;
    }

    const target = document.getElementById('sparc-editor-root');
    if (!target) {
      return;
    }

    instance.svelteMount = createBlazeMount(target, SparcAuthoringEditor, {
      tdfId: instance.tdfId,
      initialTdf: clone(tdf),
      queryParams: FlowRouter.current()?.queryParams || {},
      onCancel: () => FlowRouter.go('/contentUpload'),
      onSave: async (updatedRawStimuliFile: any) => {
        await meteorCallAsync('saveTdfStimuli', instance.tdfId, updatedRawStimuliFile, null);
        FlowRouter.go('/contentUpload');
      },
    });
    instance.mounted.set(true);
  }

  instance.autorun(() => {
    if (!instance.subscriptionsReady() || instance.mounted.get()) {
      return;
    }

    Tracker.afterFlush(mountEditor);
  });
});

Template.sparcEdit.onDestroyed(function(this: any) {
  if (this.svelteMount) {
    this.svelteMount.cleanup();
    this.svelteMount = null;
  }
});

Template.sparcEdit.helpers({
  loading() {
    return !(Template.instance() as any).subscriptionsReady();
  },
  noData() {
    const instance = Template.instance() as any;
    if (!instance.subscriptionsReady()) {
      return false;
    }
    const tdf = findTdf({ _id: instance.tdfId });
    if (!tdf) {
      clientConsole(1, '[SPARC Edit] TDF not found for editor route', instance.tdfId);
      return true;
    }
    return !hasSparcPages(tdf);
  },
});
