import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';
import { ReactiveVar } from 'meteor/reactive-var';
import './turkWorkflow.html';
import { Mongo } from 'meteor/mongo';
import { meteorCallAsync } from '..';
import { displayify } from '../../common/globalHelpers';
import { getErrorMessage } from '../lib/errorUtils';

import { legacyInt, legacyTrim } from '../../common/underscoreCompat';

declare const $: any;
declare const _: any;
declare const Tdfs: any;

const turkExperimentLog = new Mongo.Collection(null); // local-only - no database;
const TURK_LOG_SELECTED_EXPERIMENT_KEY = 'turkLogSelectedExperiment';
const PROFILE_INLINE_STATUS_KEY = 'profileInlineStatus';
const PROFILE_INLINE_STATUS_CLASS_KEY = 'profileInlineStatusClass';

function buildAwsProfileSummary() {
  const haveId = !!getProfileField('have_aws_id');
  const haveSecret = !!getProfileField('have_aws_secret');
  const useSandbox = !!getProfileField('use_sandbox');
  const endpointMode = useSandbox ? 'Sandbox' : 'Production';
  return `Endpoint mode: ${endpointMode}. AWS ID stored: ${haveId ? 'Yes' : 'No'}. AWS Secret stored: ${haveSecret ? 'Yes' : 'No'}.`;
}

function collectAwsProfileFormData() {
  return {
    aws_id: $('#profileAWSID').val(),
    aws_secret_key: $('#profileAWSSecret').val(),
    use_sandbox: $('#profileUseSandbox').prop('checked'),
  };
}

function setInlineProfileStatus(message: string, statusClass: string) {
  Session.set(PROFILE_INLINE_STATUS_KEY, message);
  Session.set(PROFILE_INLINE_STATUS_CLASS_KEY, statusClass);
}

async function saveAndValidateAwsProfile(showModal: boolean) {
  Session.set('saveComplete', false);
  Session.set('profileWorkModalMessage', 'Please wait while we save your information and contact Mechanical Turk.');
  setInlineProfileStatus('', 'alert-info');
  const data = collectAwsProfileFormData();

  if (showModal) {
    $('#profileWorkModal').modal('show');
  }

  const result: any = await meteorCallAsync('saveUserAWSData', data);
  const error = result?.error;
  const saveResult = result?.saveResult;
  const acctBal = result?.acctBal;
  const mode = data.use_sandbox ? 'Sandbox' : 'Production';
  const timestamp = new Date().toLocaleString();

  if (error || !saveResult) {
    const errMessage = error ? getErrorMessage(error) : 'No save result returned.';
    const failureText = [
      `Test failed at ${timestamp}.`,
      `Selected mode: ${mode}.`,
      `Reason: ${errMessage}`,
    ].join('\n');
    setInlineProfileStatus(failureText, 'alert-danger');
    Session.set('profileWorkModalMessage', 'Your changes were not saved! The server said: ' + errMessage);
    Session.set('saveComplete', true);
    return;
  }

  $('.clearOnSave').val('');

  const successText = [
    `Test succeeded at ${timestamp}.`,
    `Selected mode: ${mode}.`,
    `AWS account balance check succeeded.`,
    `Reported AvailableBalance: ${typeof acctBal === 'undefined' ? 'Unavailable' : acctBal}`,
    'Credentials are stored encrypted and are never shown back in full.',
  ].join('\n');
  setInlineProfileStatus(successText, 'alert-success');
  Session.set('profileWorkModalMessage', 'Your profile changes have been saved. Save details follow: ' + JSON.stringify(saveResult, null, 2));
  Session.set('saveComplete', true);
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function getExperimentVersionTag(setspec: any): string | null {
  const versionLabel = normalizeOptionalString(setspec?.versionLabel ?? setspec?.versionlabel);
  if (versionLabel) {
    return versionLabel.toLowerCase().startsWith('v') ? versionLabel : `v${versionLabel}`;
  }

  const versionMajor = normalizeOptionalString(setspec?.versionMajor ?? setspec?.versionmajor ?? setspec?.version);
  if (versionMajor) {
    return versionMajor.toLowerCase().startsWith('v') ? versionMajor : `v${versionMajor}`;
  }

  return null;
}

function formatExperimentLabel(fileName: string, versionTag: string | null, tdfId: string): string {
  const shortId = tdfId.slice(0, 8);
  if (versionTag) {
    return `${fileName} (${versionTag}, ${shortId})`;
  }
  return `${fileName} (${shortId})`;
}

function clearTurkExpLog() {
  turkExperimentLog.remove({'temp': 1});
}

function turkLogInsert(newRec: any) {
  newRec.needPay = (newRec.turkpay === '?');
  newRec.needBonus = (newRec.turkbonus === '?');
  newRec.haveEmailSched = (newRec.turkEmailSchedule !== '?');
  newRec.haveEmailSend = (newRec.turkEmailSend !== '?');
  newRec.haveDeliveryDetails = !!newRec.emailDeliveryDetails;
  newRec.turk_username = newRec.username;
  const deliveryStatus = String(newRec.emailDeliveryStatus || 'unknown').toLowerCase();
  const deliveryBadgeClassMap: Record<string, string> = {
    success: 'badge bg-success',
    retrying: 'badge bg-warning text-dark',
    failed: 'badge bg-danger',
    attempting: 'badge bg-info text-dark',
    scheduled: 'badge bg-secondary',
    processed: 'badge bg-primary',
    unknown: 'badge bg-secondary',
  };
  newRec.emailDeliveryBadgeClass = deliveryBadgeClassMap[deliveryStatus] || deliveryBadgeClassMap.unknown;
  if (newRec.emailDeliveryLastAttempt) {
    newRec.emailDeliveryLastAttemptDisplay = new Date(newRec.emailDeliveryLastAttempt).toLocaleString();
  } else {
    newRec.emailDeliveryLastAttemptDisplay = 'N/A';
  }

  if (newRec.maxTimestamp) {
    newRec.lastAction = new Date(newRec.maxTimestamp).toLocaleString();
  }
  const parsedUnit = Number(newRec.lastUnitSeen);
  newRec.currentUnitDisplay = Number.isFinite(parsedUnit) && parsedUnit >= 0
    ? parsedUnit + 1
    : newRec.lastUnitSeen;
  turkExperimentLog.insert(newRec);
}

function dismissTurkModalThenAlert(message: string) {
  const el = document.getElementById('turkModal');
  if (el) {
    const instance = (window as any).bootstrap?.Modal?.getInstance(el);
    if (instance) {
      instance.hide();
      instance.dispose();
    }
    el.classList.remove('show');
    el.removeAttribute('aria-modal');
    el.removeAttribute('role');
    el.setAttribute('aria-hidden', 'true');
    el.style.display = 'none';
  }
  // Remove any leftover backdrop
  document.querySelectorAll('.modal-backdrop').forEach((b) => b.remove());
  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');
  alert(message);
}

async function turkLogRefresh(exp: any) {
  $('#turkExpTitle').text('Viewing data for ' + exp.displayLabel);
  clearTurkExpLog();

  try {
    const result = await (Meteor as any).callAsync('turkUserLogStatus', exp.selectorKey);

    _.each(result, function(val: any, idx: any) {
      turkLogInsert(_.extend({
        temp: 1,
        idx: idx,
        questionsSeen: 0,
        experiment: exp.selectorKey,
        experimentFileName: exp.fileName,
      }, val));
    });
  } catch (error: unknown) {
    const disp = 'Failed to retrieve log entries. Error:' + getErrorMessage(error);
    
    alert(disp);
  }
}

function turkLogButtonToRec(element: any) {
  const target = $(element);
  const idx = legacyInt(target.data('idx'), -1);
  

  if (idx < 0) {
    return null;
  }

  return turkExperimentLog.findOne(
      {'idx': idx},
      {sort: [['maxTimestamp', 'desc'], ['idx', 'asc']]},
  ) as any;
}

Template.turkWorkflow.helpers({
  turkExperimentLogToShow: function() {
    return !!Session.get(TURK_LOG_SELECTED_EXPERIMENT_KEY);
  },

  turkExperimentLogEmpty: function() {
    return turkExperimentLog.find().count() === 0;
  },

  turkExperimentLog: function() {
    const minTrials = legacyInt(Session.get('turkLogFilterTrials') || -1);
    return turkExperimentLog.find(
        {'questionsSeen': {'$gte': legacyInt(minTrials)}},
        {sort: [['maxTimestamp', 'desc'], ['idx', 'asc']]},
    ).fetch();
  },
  logExperiments: function() {
    return ((Template.instance() as any).turkLogExperiments?.get() || []);
  },
  isSelectedLogExperiment: function(selectorKey: string) {
    return Session.get(TURK_LOG_SELECTED_EXPERIMENT_KEY) === selectorKey;
  },
  experiments: function() {
    const experiments = Tdfs.find({"ownerId": Meteor.userId(), "content.tdfs.tutor.setspec.experimentTarget": {$ne: null}}).fetch()
    return experiments
  },
  use_sandbox: function() {
    return getProfileField('use_sandbox') ? 'checked' : false;
  },
  saveComplete: function() {
    return Session.get('saveComplete');
  },
  profileWorkModalMessage: function() {
    return Session.get('profileWorkModalMessage');
  },
  have_aws_id: function() {
    return getProfileField('have_aws_id');
  },

  have_aws_secret: function() {
    return getProfileField('have_aws_secret');
  },
  savedAwsProfileSummary: function() {
    return buildAwsProfileSummary();
  },
  profileInlineStatus: function() {
    return Session.get(PROFILE_INLINE_STATUS_KEY);
  },
  profileInlineStatusClass: function() {
    return Session.get(PROFILE_INLINE_STATUS_CLASS_KEY) || 'alert-info';
  },
  turkIds: () => Session.get('turkIds')
});


// //////////////////////////////////////////////////////////////////////////
// Template Events

Template.turkWorkflow.onCreated(function(this: any) {
  (this as any).turkLogExperiments = new ReactiveVar([]);
  Session.setDefault(TURK_LOG_SELECTED_EXPERIMENT_KEY, '');
  Session.setDefault(PROFILE_INLINE_STATUS_KEY, '');
  Session.setDefault(PROFILE_INLINE_STATUS_CLASS_KEY, 'alert-info');
});

Template.turkWorkflow.rendered = async function(this: any) {
  const instance = this;
  // Init the modal dialogs
  $('#turkModal').modal({
    'backdrop': 'static',
    'keyboard': false,
    'show': false,
  });
  $('#profileWorkModal').modal({
    'backdrop': 'static',
    'keyboard': false,
    'show': false,
  });

  $('#detailsModal').modal({
    'show': false,
  });

  const allTdfs = (await meteorCallAsync('getTurkWorkflowExperiments')) as any[];
  const logExperiments: {
    _id: string;
    selectorKey: string;
    fileName: string;
    lessonName: string;
    versionTag: string | null;
    displayLabel: string;
  }[] = [];

  allTdfs.forEach(function(tdf: any) {
    const tdfObject = tdf?.content;
    if (!tdfObject) {
      return;
    }

    // Make sure we have a valid TDF (with a setspec)
    const setspec = tdfObject?.tdfs?.tutor?.setspec;

    if (!setspec) {
      return;
    }

    // No lesson name? that's wrong
    const name = setspec.lessonname;
    if (!name) {
      return;
    }
    const fileName = tdfObject.fileName;
    if (!fileName) {
      return;
    }

    const expTarget = setspec.experimentTarget ? setspec.experimentTarget.trim() : '';
    const selectorKey = normalizeOptionalString(tdf._id) || fileName;
    const versionTag = getExperimentVersionTag(setspec);

    if (expTarget.length > 0) {
      logExperiments.push({
        _id: tdf._id,
        selectorKey,
        fileName,
        lessonName: name,
        versionTag,
        displayLabel: formatExperimentLabel(fileName, versionTag, String(tdf._id || 'unknown')),
      });
    }
  });
  instance.turkLogExperiments.set(logExperiments);
  const selected = Session.get(TURK_LOG_SELECTED_EXPERIMENT_KEY);
  if (!selected || !logExperiments.some((exp) => exp.selectorKey === selected)) {
    Session.set(TURK_LOG_SELECTED_EXPERIMENT_KEY, '');
  }
};


Template.turkWorkflow.events({
  // Admin/Teachers - show details from single Turk assignment
  'click #turk-show-assign': async function(event: any) {
    event.preventDefault();
    const assignid = $('#turk-assignid').val();
    $('#turk-assign-results').text('Working on ' + assignid);
    $('#turkModalMessage').text('Looking up assignment\u2026');
    $('#turkModal').modal('show');
    try {
      const result = await (Meteor as any).callAsync('turkGetAssignment', assignid);
      $('#turkModal').modal('hide');
      const disp = 'Server returned:' + JSON.stringify(result, null, 2);
      $('#turk-assign-results').text(disp);
    } catch (error: unknown) {
      $('#turkModal').modal('hide');
      const disp = 'Failed to handle turk approval. Error:' + getErrorMessage(error);
      $('#turk-assign-results').text(disp);
    }
  },

  'click #profileWorkModalDissmiss': function(event: any) {
    event.preventDefault();
    $('#profileWorkModal').modal('hide');
  },

  'click #saveProfile': async function(event: any) {
    event.preventDefault();
    await saveAndValidateAwsProfile(true);
  },

  'click #testConfirmProfile': async function(event: any) {
    event.preventDefault();
    await saveAndValidateAwsProfile(false);
  },
  'change #experiment-select': async function(event: any) {
    event.preventDefault()
    const selectedExperimentId: any = $("#experiment-select").val();
    const users = await meteorCallAsync('getUsersByExperimentId', selectedExperimentId);
    $('#user-select').prop('disabled', false);
    Session.set('turkIds', users)
  },

  'click #turk-assignment-removal': function(event: any) {
    event.preventDefault();
    const turkId = $("#user-select").val();
    const selectedExperimentId: any = $("#experiment-select").val();
    (Meteor as any).callAsync('removeTurkById', turkId, selectedExperimentId);
  },

  // Admin/Teachers - send Turk message
  'click #turk-send-msg': async function(event: any) {
    event.preventDefault();
    const workerid = $('#turk-workerid').val();
    const msgtext = $('#turk-msg').val();
    
    $('#turkModalMessage').text('Sending message via Mechanical Turk\u2026');
    $('#turkModal').modal('show');
    try {
      const result = await (Meteor as any).callAsync('turkSendMessage', workerid, msgtext);
      $('#turkModal').modal('hide');
      const disp = 'Server returned:' + JSON.stringify(result, null, 2);
      
      alert(disp);
    } catch (error: unknown) {
      $('#turkModal').modal('hide');
      const disp = 'Failed to handle turk approval. Error:' + getErrorMessage(error);
      
      alert(disp);
    }
  },

  // Admin/Teachers - show user log for a particular experiment
  'change #tdf-select': function(event: any) {
    event.preventDefault();

    const selectedKey = String($("#tdf-select").val() || '');
    Session.set(TURK_LOG_SELECTED_EXPERIMENT_KEY, selectedKey);
    if (!selectedKey) {
      clearTurkExpLog();
      return;
    }

    const experiments = ((Template.instance() as any)?.turkLogExperiments?.get?.() || []) as any[];
    const selectedExperiment = experiments.find((exp: any) => exp.selectorKey === selectedKey);
    if (!selectedExperiment) {
      clearTurkExpLog();
      return;
    }

    turkLogRefresh(selectedExperiment);
  },

  // Admin/Teachers - filter Turk log results by trials seen
  'keyup #turklog-filt': function() {
    Session.set('turkLogFilterTrials', legacyInt($('#turklog-filt').val()));
    
  },

  // Admin/Teachers - approve/pay a user in the Turk log view
  'click .btn-pay-action': async function(event: any) {
    event.preventDefault();

    const rec: any = turkLogButtonToRec(event.currentTarget);
    if (!rec) {
      alert('Cannot find record for that table entry?!');
      return;
    }
    const experimentFileName = rec.experimentFileName || rec.experiment;
    const exp: any = await meteorCallAsync('getTdfByFileName', experimentFileName)
    if (!exp || !exp._id) {
      alert('Could not determine the experiment name for this entry?!');
      return;
    }
    const expId = exp._id

    const msg = 'Thank you for participating';

    $('#turkModalMessage').text('Approving assignment via Mechanical Turk\u2026');
    $('#turkModal').modal('show');
    try {
      const result = await (Meteor as any).callAsync('turkPay', rec.userId, expId, msg);

      rec.turkpayDetails = {
        msg: 'Refresh the view to see details on server',
        details: '',
      };

      if (result) {
        rec.turkpay = 'FAIL';
        rec.turkpayDetails.details = result;
      } else {
        rec.turkpay = 'Complete';
        rec.turkpayDetails.details = 'None available';
      }

      const payMsg = result
        ? 'There was a problem with the approval/payment: ' + result
        : 'Your approval succeeded';

      turkExperimentLog.remove({'idx': rec.idx});
      turkLogInsert(rec);

      dismissTurkModalThenAlert(payMsg);
    } catch (error: unknown) {
      rec.turkpayDetails = {
        msg: 'Refresh the view to see details on server',
        details: error,
      };
      rec.turkpay = 'FAIL';

      const errMsg = 'There was a server failure of some kind: ' + getErrorMessage(error);

      turkExperimentLog.remove({'idx': rec.idx});
      turkLogInsert(rec);

      dismissTurkModalThenAlert(errMsg);
    }
  },

  // Admin/Teachers - pay bonus to a user in the Turk log view
  'click .btn-bonus-action': async function(event: any) {
    event.preventDefault();

    const rec: any = turkLogButtonToRec(event.currentTarget);
    if (!rec) {
      alert('Cannot find record for that table entry?!');
      return;
    }

    const experimentFileName = rec.experimentFileName || rec.experiment;
    const exp: any = await meteorCallAsync('getTdfByFileName', experimentFileName)
    if (!exp || !exp._id) {
      alert('Could not determine the experiment name for this entry?!');
      return;
    }
    const expId = exp._id
    const expFile =  legacyTrim(experimentFileName).replace(/\./g, '_');

    $('#turkModalMessage').text('Sending bonus via Mechanical Turk\u2026');
    $('#turkModal').modal('show');

    try {
      const result = await (Meteor as any).callAsync('turkBonus', rec.userId, expFile, expId);

      rec.turkbonusDetails = {
        msg: 'Refresh the view to see details on server',
        details: '',
      };

      if (result) {
        rec.turkbonus = 'FAIL';
        rec.turkbonusDetails.details = result;
      } else {
        rec.turkbonus = 'Complete';
        rec.turkbonusDetails.details = 'None available';
      }

      const bonusMsg = result
        ? 'There was a problem with the bonus: ' + result
        : 'Your bonus payment succeeded';

      turkExperimentLog.remove({'idx': rec.idx});
      turkLogInsert(rec);

      dismissTurkModalThenAlert(bonusMsg);
    } catch (error: unknown) {
      rec.turkbonusDetails = {
        msg: 'Refresh the view to see details on server',
        details: error,
      };
      rec.turkbonus = 'FAIL';

      const errMsg = 'There was a server failure of some kind: ' + getErrorMessage(error);

      turkExperimentLog.remove({'idx': rec.idx});
      turkLogInsert(rec);

      dismissTurkModalThenAlert(errMsg);
    }
  },

  // Admin/Teachers - show previous approve/pay for a user in the Turk log view
  'click .btn-pay-detail': function(event: any) {
    event.preventDefault();

    $('#detailsModal').modal('hide');

    let disp;
    try {
      disp = displayify((turkLogButtonToRec(event.currentTarget) as any).turkpayDetails);
    } catch (e: unknown) {
      disp = 'Error finding details to display: ' + getErrorMessage(e);
    }

    $('#detailsModalListing').text(disp);
    $('#detailsModal').modal('show');
  },

  // Admin/Teachers - show previous bonus for a user in the Turk log view
  'click .btn-bonus-detail': function(event: any) {
    event.preventDefault();

    $('#detailsModal').modal('hide');

    let disp;
    try {
      disp = displayify((turkLogButtonToRec(event.currentTarget) as any).turkbonusDetails);
    } catch (e: unknown) {
      disp = 'Error finding details to display: ' + getErrorMessage(e);
    }

    $('#detailsModalListing').text(disp);
    $('#detailsModal').modal('show');
  },

  // Admin/Teachers - show previous email sched detail
  'click .btn-sched-detail': function(event: any) {
    event.preventDefault();

    $('#detailsModal').modal('hide');

    let disp;
    try {
      disp = displayify((turkLogButtonToRec(event.currentTarget) as any).turkEmailScheduleDetails);
    } catch (e: unknown) {
      disp = 'Error finding details to display: ' + getErrorMessage(e);
    }

    $('#detailsModalListing').text(disp);
    $('#detailsModal').modal('show');
  },

  // Admin/Teachers - show previous email send detail
  'click .btn-send-detail': function(event: any) {
    event.preventDefault();

    $('#detailsModal').modal('hide');

    let disp;
    try {
      disp = displayify((turkLogButtonToRec(event.currentTarget) as any).turkEmailSendDetails);
    } catch (e: unknown) {
      disp = 'Error finding details to display: ' + getErrorMessage(e);
    }

    $('#detailsModalListing').text(disp);
    $('#detailsModal').modal('show');
  },

  // Admin/Teachers - show delivery status details from scheduled message state
  'click .btn-delivery-detail': function(event: any) {
    event.preventDefault();

    $('#detailsModal').modal('hide');

    let disp;
    try {
      disp = displayify((turkLogButtonToRec(event.currentTarget) as any).emailDeliveryDetails);
    } catch (e: unknown) {
      disp = 'Error finding details to display: ' + getErrorMessage(e);
    }

    $('#detailsModalListing').text(disp);
    $('#detailsModal').modal('show');
  },
});

function getProfileField(field: any) {
  const user = Meteor.user() as any;
  const prof = user?.aws || user?.profile?.aws;
  if (!prof || typeof prof[field] === 'undefined') {
    return null;
  }
  return prof[field];
}






