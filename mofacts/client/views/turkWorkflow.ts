import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';
import { ReactiveVar } from 'meteor/reactive-var';
import './turkWorkflow.html';
import { Mongo } from 'meteor/mongo';
import { meteorCallAsync } from '..';
import { displayify } from '../../common/globalHelpers';
import { getErrorMessage } from '../lib/errorUtils';
import { getActiveUiLocale } from '../lib/interfaceLocaleState';
import { translatePlatformString, type TranslationValues } from '../lib/interfaceI18n';
import { formatActiveInterfaceDateTime } from '../lib/interfaceFormatting';
import {
  cleanupBootstrapModalState,
  getBootstrapModal,
  hideBootstrapModal,
  showBootstrapModal,
} from '../lib/bootstrapModal';

import { legacyInt, legacyTrim } from '../../common/underscoreCompat';

declare const $: any;
declare const _: any;
declare const Tdfs: any;

const turkExperimentLog = new Mongo.Collection(null); // local-only - no database;
const TURK_LOG_SELECTED_EXPERIMENT_KEY = 'turkLogSelectedExperiment';
const PROFILE_INLINE_STATUS_KEY = 'profileInlineStatus';
const PROFILE_INLINE_STATUS_CLASS_KEY = 'profileInlineStatusClass';
const TURK_WORKFLOW_MESSAGE_KEY = 'turkWorkflowMessage';

type PlatformStringKey = Parameters<typeof translatePlatformString>[1];

function turkText(key: PlatformStringKey, values?: TranslationValues): string {
  return translatePlatformString(getActiveUiLocale(), key, values);
}

function messageIcon(level: string) {
  if (level === 'success') return 'fa-check-circle';
  if (level === 'warning') return 'fa-exclamation-triangle';
  if (level === 'error') return 'fa-exclamation-circle';
  return 'fa-info-circle';
}

function setTurkWorkflowMessage(level: string, text: string) {
  Session.set(TURK_WORKFLOW_MESSAGE_KEY, {
    level,
    text,
    icon: messageIcon(level)
  });
}

function buildAwsProfileSummary() {
  const haveId = !!getProfileField('have_aws_id');
  const haveSecret = !!getProfileField('have_aws_secret');
  const useSandbox = !!getProfileField('use_sandbox');
  const endpointMode = useSandbox ? turkText('turk.sandbox') : turkText('turk.production');
  return turkText('turk.endpointSummary', {
    mode: endpointMode,
    haveId: haveId ? turkText('turk.yes') : turkText('turk.no'),
    haveSecret: haveSecret ? turkText('turk.yes') : turkText('turk.no'),
  });
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
  Session.set('profileWorkModalMessage', turkText('turk.saveAndContact'));
  setInlineProfileStatus('', 'info');
  const data = collectAwsProfileFormData();

  if (showModal) {
    showBootstrapModal('profileWorkModal', { backdrop: 'static', keyboard: false });
  }

  const result: any = await meteorCallAsync('saveUserAWSData', data);
  const error = result?.error;
  const saveResult = result?.saveResult;
  const acctBal = result?.acctBal;
  const mode = data.use_sandbox ? turkText('turk.sandbox') : turkText('turk.production');
  const timestamp = formatActiveInterfaceDateTime(new Date());

  if (error || !saveResult) {
    const errMessage = error ? getErrorMessage(error) : turkText('turk.noSaveResult');
    const failureText = [
      turkText('turk.testFailedAt', { timestamp }),
      turkText('turk.selectedMode', { mode }),
      turkText('turk.reason', { reason: errMessage }),
    ].join('\n');
    setInlineProfileStatus(failureText, 'error');
    Session.set('profileWorkModalMessage', turkText('turk.profileNotSaved', { reason: errMessage }));
    Session.set('saveComplete', true);
    return;
  }

  $('.clearOnSave').val('');

  const successText = [
    turkText('turk.testSucceededAt', { timestamp }),
    turkText('turk.selectedMode', { mode }),
    turkText('turk.balanceCheckSucceeded'),
    turkText('turk.reportedAvailableBalance', { balance: typeof acctBal === 'undefined' ? turkText('turk.unavailable') : acctBal }),
    turkText('turk.credentialsStoredEncrypted'),
  ].join('\n');
  setInlineProfileStatus(successText, 'success');
  Session.set('profileWorkModalMessage', turkText('turk.profileSavedDetails', { details: JSON.stringify(saveResult, null, 2) }));
  Session.set('saveComplete', true);
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function formatExperimentLabel(fileName: string, tdfId: string): string {
  const shortId = tdfId.slice(0, 8);
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
    newRec.emailDeliveryLastAttemptDisplay = formatActiveInterfaceDateTime(newRec.emailDeliveryLastAttempt);
  } else {
    newRec.emailDeliveryLastAttemptDisplay = turkText('turk.notAvailable');
  }

  if (newRec.maxTimestamp) {
    newRec.lastAction = formatActiveInterfaceDateTime(newRec.maxTimestamp);
  }
  const parsedUnit = Number(newRec.lastUnitSeen);
  newRec.currentUnitDisplay = Number.isFinite(parsedUnit) && parsedUnit >= 0
    ? parsedUnit + 1
    : newRec.lastUnitSeen;
  turkExperimentLog.insert(newRec);
}

function dismissTurkModalThenAlert(message: string, level = 'info') {
  const el = document.getElementById('turkModal');
  if (el) {
    const instance = getBootstrapModal(el);
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
  cleanupBootstrapModalState();
  setTurkWorkflowMessage(level, message);
}

async function turkLogRefresh(exp: any) {
  $('#turkExpTitle').text(turkText('turk.viewingDataFor', { label: exp.displayLabel }));
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
    const disp = turkText('turk.failedRetrieveLogs', { error: getErrorMessage(error) });
    setTurkWorkflowMessage('error', disp);
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
  turkText: function(key: PlatformStringKey, options?: { hash?: TranslationValues }) {
    return turkText(key, options?.hash);
  },

  awsIdPlaceholder: function() {
    return getProfileField('have_aws_id') ? turkText('turk.awsIdPlaceholderOverwrite') : turkText('turk.awsIdPlaceholderEnter');
  },

  awsSecretPlaceholder: function() {
    return getProfileField('have_aws_secret') ? turkText('turk.awsSecretPlaceholderOverwrite') : turkText('turk.awsSecretPlaceholderEnter');
  },

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
    return Session.get(PROFILE_INLINE_STATUS_CLASS_KEY) || 'info';
  },
  profileInlineStatusIcon: function() {
    return messageIcon(String(Session.get(PROFILE_INLINE_STATUS_CLASS_KEY) || 'info'));
  },
  turkWorkflowMessage: function() {
    return Session.get(TURK_WORKFLOW_MESSAGE_KEY);
  },
  turkIds: () => Session.get('turkIds')
});


// //////////////////////////////////////////////////////////////////////////
// Template Events

Template.turkWorkflow.onCreated(function(this: any) {
  (this as any).turkLogExperiments = new ReactiveVar([]);
  Session.setDefault(TURK_LOG_SELECTED_EXPERIMENT_KEY, '');
  Session.setDefault(PROFILE_INLINE_STATUS_KEY, '');
  Session.setDefault(PROFILE_INLINE_STATUS_CLASS_KEY, 'info');
  Session.setDefault(TURK_WORKFLOW_MESSAGE_KEY, null);
});

Template.turkWorkflow.rendered = async function(this: any) {
  const instance = this;
  // Init the modal dialogs
  getBootstrapModal('turkModal', { backdrop: 'static', keyboard: false });
  getBootstrapModal('profileWorkModal', { backdrop: 'static', keyboard: false });
  getBootstrapModal('detailsModal');

  const allTdfs = (await meteorCallAsync('getTurkWorkflowExperiments')) as any[];
  const logExperiments: {
    _id: string;
    selectorKey: string;
    fileName: string;
    lessonName: string;
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

    if (expTarget.length > 0) {
      logExperiments.push({
        _id: tdf._id,
        selectorKey,
        fileName,
        lessonName: name,
        displayLabel: formatExperimentLabel(fileName, String(tdf._id || 'unknown')),
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
    $('#turk-assign-results').text(turkText('turk.workingOnAssignment', { assignmentId: assignid }));
    $('#turkModalMessage').text(turkText('turk.lookingUpAssignment'));
    showBootstrapModal('turkModal', { backdrop: 'static', keyboard: false });
    try {
      const result = await (Meteor as any).callAsync('turkGetAssignment', assignid);
      hideBootstrapModal('turkModal');
      const disp = turkText('turk.serverReturned', { result: JSON.stringify(result, null, 2) });
      $('#turk-assign-results').text(disp);
    } catch (error: unknown) {
      hideBootstrapModal('turkModal');
      const disp = turkText('turk.failedHandleTurkApproval', { error: getErrorMessage(error) });
      $('#turk-assign-results').text(disp);
    }
  },

  'click #profileWorkModalDissmiss': function(event: any) {
    event.preventDefault();
    hideBootstrapModal('profileWorkModal');
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
    
    $('#turkModalMessage').text(turkText('turk.sendingMessage'));
    showBootstrapModal('turkModal', { backdrop: 'static', keyboard: false });
    try {
      const result = await (Meteor as any).callAsync('turkSendMessage', workerid, msgtext);
      hideBootstrapModal('turkModal');
      const disp = turkText('turk.serverReturned', { result: JSON.stringify(result, null, 2) });
      setTurkWorkflowMessage('success', disp);
    } catch (error: unknown) {
      hideBootstrapModal('turkModal');
      const disp = turkText('turk.failedHandleTurkApproval', { error: getErrorMessage(error) });
      setTurkWorkflowMessage('error', disp);
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
      setTurkWorkflowMessage('error', turkText('turk.cannotFindRecord'));
      return;
    }
    const experimentFileName = rec.experimentFileName || rec.experiment;
    const exp: any = await meteorCallAsync('getTdfByFileName', experimentFileName)
    if (!exp || !exp._id) {
      setTurkWorkflowMessage('error', turkText('turk.cannotDetermineExperiment'));
      return;
    }
    const expId = exp._id

    const msg = turkText('turk.approvalWorkerMessage');

    $('#turkModalMessage').text(turkText('turk.approvingAssignment'));
    showBootstrapModal('turkModal', { backdrop: 'static', keyboard: false });
    try {
      const result = await (Meteor as any).callAsync('turkPay', rec.userId, expId, msg);

      rec.turkpayDetails = {
        msg: turkText('turk.refreshViewDetailsServer'),
        details: '',
      };

      if (result) {
        rec.turkpay = turkText('turk.failed');
        rec.turkpayDetails.details = result;
      } else {
        rec.turkpay = turkText('turk.complete');
        rec.turkpayDetails.details = turkText('turk.noneAvailable');
      }

      const payMsg = result
        ? turkText('turk.problemApprovalPayment', { result })
        : turkText('turk.approvalSucceeded');

      turkExperimentLog.remove({'idx': rec.idx});
      turkLogInsert(rec);

      dismissTurkModalThenAlert(payMsg, result ? 'error' : 'success');
    } catch (error: unknown) {
      rec.turkpayDetails = {
        msg: turkText('turk.refreshViewDetailsServer'),
        details: error,
      };
      rec.turkpay = turkText('turk.failed');

      const errMsg = turkText('turk.serverFailure', { error: getErrorMessage(error) });

      turkExperimentLog.remove({'idx': rec.idx});
      turkLogInsert(rec);

      dismissTurkModalThenAlert(errMsg, 'error');
    }
  },

  // Admin/Teachers - pay bonus to a user in the Turk log view
  'click .btn-bonus-action': async function(event: any) {
    event.preventDefault();

    const rec: any = turkLogButtonToRec(event.currentTarget);
    if (!rec) {
      setTurkWorkflowMessage('error', turkText('turk.cannotFindRecord'));
      return;
    }

    const experimentFileName = rec.experimentFileName || rec.experiment;
    const exp: any = await meteorCallAsync('getTdfByFileName', experimentFileName)
    if (!exp || !exp._id) {
      setTurkWorkflowMessage('error', turkText('turk.cannotDetermineExperiment'));
      return;
    }
    const expId = exp._id
    const expFile =  legacyTrim(experimentFileName).replace(/\./g, '_');

    $('#turkModalMessage').text(turkText('turk.sendingBonus'));
    showBootstrapModal('turkModal', { backdrop: 'static', keyboard: false });

    try {
      const result = await (Meteor as any).callAsync('turkBonus', rec.userId, expFile, expId);

      rec.turkbonusDetails = {
        msg: turkText('turk.refreshViewDetailsServer'),
        details: '',
      };

      if (result) {
        rec.turkbonus = turkText('turk.failed');
        rec.turkbonusDetails.details = result;
      } else {
        rec.turkbonus = turkText('turk.complete');
        rec.turkbonusDetails.details = turkText('turk.noneAvailable');
      }

      const bonusMsg = result
        ? turkText('turk.problemBonus', { result })
        : turkText('turk.bonusSucceeded');

      turkExperimentLog.remove({'idx': rec.idx});
      turkLogInsert(rec);

      dismissTurkModalThenAlert(bonusMsg, result ? 'error' : 'success');
    } catch (error: unknown) {
      rec.turkbonusDetails = {
        msg: turkText('turk.refreshViewDetailsServer'),
        details: error,
      };
      rec.turkbonus = turkText('turk.failed');

      const errMsg = turkText('turk.serverFailure', { error: getErrorMessage(error) });

      turkExperimentLog.remove({'idx': rec.idx});
      turkLogInsert(rec);

      dismissTurkModalThenAlert(errMsg, 'error');
    }
  },

  // Admin/Teachers - show previous approve/pay for a user in the Turk log view
  'click .btn-pay-detail': function(event: any) {
    event.preventDefault();

    hideBootstrapModal('detailsModal');

    let disp;
    try {
      disp = displayify((turkLogButtonToRec(event.currentTarget) as any).turkpayDetails);
    } catch (e: unknown) {
      disp = turkText('turk.errorFindingDetails', { error: getErrorMessage(e) });
    }

    $('#detailsModalListing').text(disp);
    showBootstrapModal('detailsModal');
  },

  // Admin/Teachers - show previous bonus for a user in the Turk log view
  'click .btn-bonus-detail': function(event: any) {
    event.preventDefault();

    hideBootstrapModal('detailsModal');

    let disp;
    try {
      disp = displayify((turkLogButtonToRec(event.currentTarget) as any).turkbonusDetails);
    } catch (e: unknown) {
      disp = turkText('turk.errorFindingDetails', { error: getErrorMessage(e) });
    }

    $('#detailsModalListing').text(disp);
    showBootstrapModal('detailsModal');
  },

  // Admin/Teachers - show previous email sched detail
  'click .btn-sched-detail': function(event: any) {
    event.preventDefault();

    hideBootstrapModal('detailsModal');

    let disp;
    try {
      disp = displayify((turkLogButtonToRec(event.currentTarget) as any).turkEmailScheduleDetails);
    } catch (e: unknown) {
      disp = turkText('turk.errorFindingDetails', { error: getErrorMessage(e) });
    }

    $('#detailsModalListing').text(disp);
    showBootstrapModal('detailsModal');
  },

  // Admin/Teachers - show previous email send detail
  'click .btn-send-detail': function(event: any) {
    event.preventDefault();

    hideBootstrapModal('detailsModal');

    let disp;
    try {
      disp = displayify((turkLogButtonToRec(event.currentTarget) as any).turkEmailSendDetails);
    } catch (e: unknown) {
      disp = turkText('turk.errorFindingDetails', { error: getErrorMessage(e) });
    }

    $('#detailsModalListing').text(disp);
    showBootstrapModal('detailsModal');
  },

  // Admin/Teachers - show delivery status details from scheduled message state
  'click .btn-delivery-detail': function(event: any) {
    event.preventDefault();

    hideBootstrapModal('detailsModal');

    let disp;
    try {
      disp = displayify((turkLogButtonToRec(event.currentTarget) as any).emailDeliveryDetails);
    } catch (e: unknown) {
      disp = turkText('turk.errorFindingDetails', { error: getErrorMessage(e) });
    }

    $('#detailsModalListing').text(disp);
    showBootstrapModal('detailsModal');
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






