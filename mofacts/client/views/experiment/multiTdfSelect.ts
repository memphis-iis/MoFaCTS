import { createExperimentState } from './svelte/services/experimentState';
import { CARD_ENTRY_INTENT, setCardEntryIntent } from '../../lib/cardEntryIntent';
import './multiTdfSelect.html';

declare const Template: any;
declare const Session: any;
declare const $: any;

type SubTdf = {
  lessonName: string;
  clusterList: unknown;
};
const { FlowRouter } = require('meteor/ostrio:flow-router-extra') as {
  FlowRouter: { go(path: string): void };
};

Template.multiTdfSelect.helpers({
  // None
});

Template.multiTdfSelect.events({
  // Start a Sub TDF
  'click .subTdfButton': async function(event: any) {
    event.preventDefault();

    const target = $(event.currentTarget);
    selectSubTdf(
        target.data('lessonName'),
        target.data('clusterList'),
        target.data('subTdfIndex'),
    );
  },
});

Template.multiTdfSelect.rendered = function() {
  // this is called whenever the template is rendered.
  const subTdfs = (Session.get('currentTdfFile')?.subTdfs || []) as SubTdf[];

  // Hide global loading spinner when multiTdfSelect page is ready
  if (Session.get('appLoading')) {
    
    Session.set('appLoading', false);
  }

  $('#expDataDownloadContainer').html('');

  // Check all the valid TDF's
  subTdfs.forEach( function(subTdfObject, index) {
    const lessonName = subTdfObject.lessonName;
    const clusterList = subTdfObject.clusterList;

    addSubTdfButton(
        $('<button type=\'button\' name=\''+lessonName+'\'>')
            .addClass('btn btn-block btn-responsive subTdfButton')
            .data('lessonName', lessonName)
            .data('clusterList', clusterList)
            .data('subTdfIndex', index)
            .html(lessonName),
    );
  });
};

function addSubTdfButton(btnObj: any): void {
  let container = '<div class=\'col-12 col-sm-12 col-md-3 col-lg-3 text-center\'><br></div>';
  container = $(container).prepend('<p style="display:inline-block">&nbsp;&nbsp;&nbsp;</p>');
  container = $(container).prepend(btnObj);
  $('#testButtonContainer').append(container);
}

// Actual logic for selecting and starting a TDF
async function selectSubTdf(lessonName: string, clusterList: unknown, subTdfIndex: number): Promise<void> {
  Session.set('subTdfIndex', subTdfIndex);
  await createExperimentState({ subTdfIndex } as any);

  setCardEntryIntent(CARD_ENTRY_INTENT.INITIAL_TDF_ENTRY, {
    source: 'multiTdfSelect.selectSubTdf',
  });
  FlowRouter.go('/card');
}

