import {Roles} from 'meteor/alanning:roles';
import {getTdfById, getTdfByFileName, serverConsole} from './serverComposition';
import {turk} from './turk';
import {displayify} from '../common/globalHelpers';

import { legacyDisplay, legacyFloat, legacyInt, legacyProp, legacyTrim } from '../common/underscoreCompat';
const MeteorAny = Meteor as any;
const RolesAny = Roles as any;
const turkAny = turk as any;

export {sendScheduledTurkMessages};
/* turk_methods.js - Implement the server-side methods called by our clients
**/


async function writeUserLogEntries(experimentId: string, objectsToLog: any[] | any, userId: string) {
  if (!userId) {
    throw new Meteor.Error('No valid user ID found for User Log Entry');
  }
  if(!Array.isArray(objectsToLog))
    objectsToLog = [objectsToLog];
  const action: { $push: Record<string, any> } = { $push: {} };
  action['$push'][experimentId] = {$each: objectsToLog};

  await UserTimesLog.updateAsync( {userId: userId}, action, {upsert: true} );
  await logUserMetrics(userId, experimentId, objectsToLog);
};

// Utility - update server-side metrics when we see an answer
async function logUserMetrics(userId: string, experimentKey: string, valsToCheck: any[]) {
  // Gather the answers we should use to check
  const answers = valsToCheck.filter((rec: any) => (rec.action == 'answer' || rec.action == '[timeout]'));

  // Leave if nothing to do
  if (answers.length < 1) {
    return;
  }

  const makeKey = function(idx: number, fieldName: string) {
    return experimentKey + '.' + idx + '.' + fieldName;
  };

  for (let i = 0; i < answers.length; ++i) {
    const answer = answers[i];
    const ttype = legacyTrim(answer.ttype);
    const idx = legacyInt(answer.shufIndex);

    let action: Array<{ $push: Record<string, any>; $inc: Record<string, number> }>;
    if (ttype == 's') {
      // Study
      const reviewTime = legacyInt(answer.inferredReviewLatency);
      action = [{'$push': {}, '$inc': {}}];
      const op = action[0]!;
      op['$push'][makeKey(idx, 'studyTimes')] = reviewTime;
      op['$inc'][makeKey(idx, 'studyCount')] = 1;
    } else {
      const isCorrect = answer.isCorrect;
      const answerTime = legacyInt(answer.endLatency);
      action = [{'$push': {}, '$inc': {}}];
      const op = action[0]!;
      op['$push'][makeKey(idx, 'answerTimes')] = answerTime;
      op['$push'][makeKey(idx, 'answerCorrect')] = isCorrect;
      op['$inc'][makeKey(idx, 'questionCount')] = 1;
      op['$inc'][makeKey(idx, 'correctAnswerCount')] = (isCorrect ? 1 : 0);
    }

    for (let j = 0; j < action.length; ++j) {
      await UserMetrics.updateAsync({_id: userId}, action[j]);
    }
  }
}
// Given a user ID (_id) and an experiment, return the corresponding tdfId (_id)
async function userLogGetTdfId(userid: string, experiment: string) {
  const userLog = await UserTimesLog.findOneAsync({userId: userid});
  let entries = [];
  if (userLog && userLog[experiment] && userLog[experiment].length) {
    entries = userLog[experiment];
  }

  let id = null;
  for (let i = 0; i < entries.length; ++i) {
    const rec = entries[i];
    const action = legacyTrim(rec.action).toLowerCase();

    // Only need to see the tdf select event once to get the key
    if (action === 'expcondition' || action === 'condition-notify') {
      id = legacyDisplay(rec.currentTdfName);
      if (id) {
        break;
      }
    }
  }

  if (id) {
    const tdf = await getTdfByFileName(id);
    if (tdf) {
      return tdf.content._id;
    }
  }

  return null; // Whoops
}

// Return the _id of the user record for the "owner" (or teacher) of the given
// experiment name (TDF). This is mainly for knowing how to handle MTurk calls
async function getTdfOwner(experimentId: string) {
  // Now we can get the owner (either set on upload of TDF *OR* set on server
  // startup for TDF's that live in git)
  const tdf = await getTdfById(experimentId);
  if (!!tdf && typeof tdf.ownerId !== 'undefined') {
    return tdf.ownerId;
  } else {
    serverConsole('getTdfOwner for ', experimentId, 'failed - TDF doesn\'t contain owner');
    serverConsole(tdf._id, tdf);
    return null;
  }
}


// Send any scheduled messages in ScheduledTurkMessages
async function sendScheduledTurkMessages() {
  const now = Date.now();
  let sendCount = 0;
  const MAX_DELIVERY_ATTEMPTS = 3;
  const RETRY_BACKOFF_MS = [60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000];

  const getRetryDelayMs = (attemptNumber: number) => {
    const idx = Math.max(0, Math.min(RETRY_BACKOFF_MS.length - 1, attemptNumber - 1));
    return RETRY_BACKOFF_MS[idx]!;
  };

  const classifyAsPermanentFailure = (err: any) => {
    const msg = String(err?.message || err || '').toLowerCase();
    if (!msg) {
      return false;
    }
    if (msg.includes('not set up for aws/mturk')) {
      return true;
    }
    if (msg.includes('could not find current user profile')) {
      return true;
    }
    if (msg.includes('workerid') && (msg.includes('invalid') || msg.includes('not found'))) {
      return true;
    }
    return false;
  };

  serverConsole('Looking for ScheduledTurkMessages on or after', new Date(now));

  while (true) {
    // Find next email to send
    const nextJob = await ScheduledTurkMessages.findOneAsync({
      'sent': '',
      'scheduled': {'$lte': now},
    });
    if (!nextJob) {
      break;
    }

    // Send turk message
    serverConsole('Running scheduled job', nextJob._id);
    let senderr = null;
    let retval = null;
    const attemptNumber = Number(nextJob.deliveryAttemptCount || 0) + 1;
    const attemptStartedAt = Date.now();
    const makePlainObject = (value: any) => {
      if (value === null || value === undefined) {
        return value;
      }
      if (value instanceof Error) {
        return {
          message: value.message || String(value),
          stack: value.stack || null
        };
      }
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (err) {
        return { message: String(value) };
      }
    };
    const safeUpdateJob = async (modifier: Record<string, unknown>) => {
      try {
        await ScheduledTurkMessages.updateAsync({'_id': nextJob._id}, modifier);
        return true;
      } catch (e) {
        serverConsole('FAILED TO UPDATE JOB STATE:', nextJob._id, e);
        return false;
      }
    };

    await safeUpdateJob({
      '$set': {
        'deliveryStatus': 'attempting',
        'deliveryAttemptCount': attemptNumber,
        'lastAttemptAt': attemptStartedAt
      }
    });

    try {
      const ownerProfile = await MeteorAny.users.findOneAsync({_id: nextJob.ownerProfileId});
      if (!ownerProfile) {
        throw new Error('Could not find current user profile');
      }
      if (!ownerProfile.aws || !ownerProfile.aws.have_aws_id || !ownerProfile.aws.have_aws_secret) {
        throw new Error('Current user not set up for AWS/MTurk');
      }
      const ret = await turkAny.notifyWorker(ownerProfile.aws, nextJob.requestParams);
      serverConsole('Completed scheduled job', nextJob._id);
      retval = _.extend({'passedParams': nextJob.requestParams}, ret);
    } catch (e) {
      serverConsole('Error - COULD NOT SEND TURK MESSAGE: ', e);
      senderr = e;
    } finally {
      const safeResult = makePlainObject(retval);
      const safeError = makePlainObject(senderr);
      const sendLogEntry = {
        'action': 'turk-email-send',
        'success': senderr === null,
        'result': safeResult,
        'errmsg': safeError,
        'turkId': nextJob.requestParams.WorkerId,
        'tdfOwnerId': nextJob.ownerId,
        'schedDate': (new Date(nextJob.scheduled)).toString(),
        'attempt': attemptNumber,
        'attemptStartedAt': new Date(attemptStartedAt).toString(),
      };

      serverConsole('About to log entry for Turk', JSON.stringify(sendLogEntry, null, 2));
      try {
        await writeUserLogEntries(nextJob.experiment, sendLogEntry, nextJob.workerUserId);
      } catch (logErr) {
        serverConsole('FAILED TO WRITE TURK SEND LOG ENTRY:', nextJob._id, logErr);
      }
    }

    // Update scheduling/delivery metadata based on outcome
    let markedRecord = null;
    if (!senderr) {
      const sentAt = Date.now();
      markedRecord = await safeUpdateJob({
        '$set': {
          'sent': sentAt,
          'sentAt': sentAt,
          'deliveryStatus': 'success',
          'lastError': null
        }
      });
      if (markedRecord) {
        sendCount++;
        serverConsole('Finished requested email:', nextJob._id);
      }
    } else {
      const safeError = makePlainObject(senderr);
      const permanentFailure = classifyAsPermanentFailure(senderr);
      const exhaustedRetries = attemptNumber >= MAX_DELIVERY_ATTEMPTS;
      const terminalFailure = permanentFailure || exhaustedRetries;

      if (terminalFailure) {
        const failedAt = Date.now();
        markedRecord = await safeUpdateJob({
          '$set': {
            'sent': failedAt,
            'sentAt': failedAt,
            'deliveryStatus': 'failed',
            'lastError': safeError,
            'lastAttemptAt': attemptStartedAt
          }
        });
        if (markedRecord) {
          serverConsole('Marked failed job terminal:', nextJob._id, {
            permanentFailure,
            exhaustedRetries,
            attempts: attemptNumber
          });
        }
      } else {
        const retryDelayMs = getRetryDelayMs(attemptNumber);
        const retryAt = Date.now() + retryDelayMs;
        markedRecord = await safeUpdateJob({
          '$set': {
            'scheduled': retryAt,
            'deliveryStatus': 'retrying',
            'lastError': safeError,
            'lastAttemptAt': attemptStartedAt
          }
        });
        if (markedRecord) {
          serverConsole('Rescheduled failed job for retry:', nextJob._id, {
            attemptNumber,
            retryDelayMs,
            retryAt: new Date(retryAt).toString()
          });
        }
      }
    }

    if (!markedRecord) {
      break; // Nothing to do - we failed!
    }
  }

  serverConsole('Total sent messages:', sendCount);
  return {'sendCount': sendCount};
};


// Set up our server-side methods
Meteor.methods({
  // Simple assignment debugging for turk
  turkGetAssignment: async function(assignid) {
    serverConsole('turkGetAssignment', assignid);
    try {
      const usr = await MeteorAny.userAsync();
      if (!await RolesAny.userIsInRoleAsync(usr, ['admin', 'teacher'])) {
        throw new Error('You are not authorized to do that');
      }

      const profile = usr.aws;
      if (!profile) {
        return 'Could not find current user profile';
      }
      if (!profile.have_aws_id || !profile.have_aws_secret) {
        return 'Current user not set up for AWS/MTurk';
      }
      const res = await turkAny.getAssignment(profile, {'AssignmentId': assignid});
      return res;
    } catch (e) {
      return e;
    }
  },

  // Simple message sending
  turkSendMessage: async function(workerid, msgtext) {
    serverConsole('turkSendMessage', workerid);
    try {
      const usr = await MeteorAny.userAsync();
      if (!await RolesAny.userIsInRoleAsync(usr, ['admin', 'teacher'])) {
        throw new Error('You are not authorized to do that');
      }

      const profile = usr.aws;
      if (!profile) {
        return 'Could not find current user profile';
      }
      if (!profile.have_aws_id || !profile.have_aws_secret) {
        return 'Current user not set up for AWS/MTurk';
      }
      const res = await turkAny.notifyWorker(profile, {
        'Subject': 'Message from ' + usr.username + ' Profile Page',
        'MessageText': msgtext,
        'WorkerId': workerid,
      });
      return res;
    } catch (e) {
      serverConsole('Error for turkSendMessage', e);
      return e;
    }
  },

  // Message sending for the end of a lockout
  turkScheduleLockoutMessage: async function(experiment, lockoutend, subject, msgbody) {
    serverConsole('turkScheduleLockoutMessage', experiment, lockoutend, subject);

    let usr; let turkid; let ownerId; let workerUserId;
    let schedDate;
    let jobName;
    let resultMsg = '';
    let errmsg = null;
    let requestParams = null; // Params used to make email send request

    try {
      usr = await MeteorAny.userAsync();
      if (!usr || !usr._id) {
        throw new Meteor.Error('No current user');
      }

      workerUserId = usr._id;
      turkid = usr.username;
      if (!turkid) {
        throw new Meteor.Error('No valid username found');
      }
      turkid = legacyTrim(turkid).toUpperCase();

      const experimentTdf = await getTdfById(experiment);
      ownerId = experimentTdf?.ownerId || null;
      if (!ownerId) {
        throw new Meteor.Error('Could not determine TDF owner');
      }
      const isAdmin = await RolesAny.userIsInRoleAsync(usr, ['admin']);
      const isOwner = ownerId === usr._id;
      const experimentTarget = legacyTrim(experimentTdf?.content?.tdfs?.tutor?.setspec?.experimentTarget).toLowerCase();
      const userExperimentTarget = legacyTrim(usr?.profile?.experimentTarget).toLowerCase();
      const existingStateForExperiment = await GlobalExperimentStates.findOneAsync(
        { userId: usr._id, TDFId: experimentTdf?._id },
        { fields: { _id: 1 } }
      );
      const isExperimentParticipant =
        usr?.loginParams?.loginMode === 'experiment' &&
        !!experimentTarget &&
        (userExperimentTarget === experimentTarget || !!existingStateForExperiment);
      if (!isAdmin && !isOwner && !isExperimentParticipant) {
        throw new Meteor.Error('You are not authorized to schedule MTurk messages for that TDF');
      }

      const ownerProfile = await MeteorAny.users.findOneAsync({_id: ownerId});
      if (!ownerProfile) {
        throw new Meteor.Error('Could not find TDF owner profile for id \'' + ownerId + '\'');
      }
      serverConsole('Found owner profile', ownerProfile._id);
      if (!ownerProfile.aws || !ownerProfile.aws.have_aws_id || !ownerProfile.aws.have_aws_secret) {
        throw new Meteor.Error('Current TDF owner not set up for AWS/MTurk');
      }

      const previouslyScheduledMessage = await ScheduledTurkMessages.findOneAsync({ workerUserId: workerUserId, experiment: experiment, scheduled: { $gt: Date.now() } });
      if (!previouslyScheduledMessage) {
        subject = subject || legacyTrim('Message from ' + turkid + ' Profile Page');
        const msgtext = 'The lock out period has ended - you may continue.\n\n' + msgbody;
        jobName = 'Message for ' + experiment + ' to ' + turkid;
        schedDate = new Date(lockoutend);

        // Pre-calculate our request parameters for send to that we can
        // copy them to our schedule log entry
        requestParams = {
          'Subject': subject,
          'MessageText': msgtext,
          'WorkerId': turkid,
        };

        serverConsole('Scheduling:', jobName, 'at', schedDate);
        await ScheduledTurkMessages.insertAsync({
          'sent': '',
          'ownerId': ownerId,
          'scheduled': schedDate.getTime(),
          'ownerProfileId': ownerProfile._id,
          'requestParams': requestParams,
          'jobName': jobName,
          'experiment': experiment,
          'workerUserId': workerUserId
        });

        serverConsole('Scheduled Message scheduled for:', schedDate);
        resultMsg = 'Message scheduled';
      } else {
        resultMsg = 'Message already scheduled';
      }
    } catch (e) {
      serverConsole('Failure scheduling turk message at later date:', e);
      errmsg = {
        'msg': legacyProp(e, 'error'),
        'full': displayify(e),
      };
    } finally {
      // Always write an entry
      const schedLogEntry = {
        'action': 'turk-email-schedule',
        'success': errmsg === null,
        'result': resultMsg,
        'errmsg': errmsg,
        'turkId': turkid,
        'tdfOwnerId': ownerId,
        'schedDate': schedDate ? schedDate.toString() : '???',

        // The following three properties are for recreating the sched
        // call (although you'll need to create a Date from schedDateRaw
        // and retrieve the owner profile with tdfOwnerId)
        'schedDateRaw': schedDate ? schedDate.getTime() : 0,
        'jobname': jobName,
        'requestParams': requestParams,
      };

      serverConsole('About to log email sched entry for Turk', JSON.stringify(schedLogEntry, null, 2));
      writeUserLogEntries(experiment, [schedLogEntry], workerUserId);
    }

    if (errmsg !== null) {
      throw new Meteor.Error('Message-Failure', errmsg.msg, errmsg.full);
    }

    return resultMsg;
  },

  // Assuming the current user is an admin or teacher, and given a user ID, an
  // experiment, and a msg - we attempt to pay the user for the current MTurk
  // HIT/assignment.
  // RETURNS: null on success or an error message on failure. Any results
  // are logged to the user times log
  turkPay: async function(workerUserId, experiment, msg) {
    serverConsole('turkPay', workerUserId, experiment);

    let errmsg = null; // Return null on success

    // Data we log
    const workPerformed: any = {
      findHITs: 'not performed',
      findAssignment: 'not performed',
      approveAssignment: 'not performed',
    };

    let ownerId; let turkid; // Needed for final work

    try {
      const usr = await MeteorAny.userAsync();
      if (!await RolesAny.userIsInRoleAsync(usr, ['admin', 'teacher'])) {
        throw new Error('You are not authorized to do that');
      }
      ownerId = usr._id;

      const ownerProfile = await MeteorAny.users.findOneAsync({_id: ownerId});
      if (!ownerProfile) {
        throw new Error('Could not find your user profile');
      }
      if (!ownerProfile.aws || !ownerProfile.aws.have_aws_id || !ownerProfile.aws.have_aws_secret) {
        throw new Error('You are not set up for AWS/MTurk');
      }
      // METEOR 3 FIX: await the Promise before chaining Underscore methods
      const workerUser = await MeteorAny.users.findOneAsync({'_id': workerUserId});
      turkid = legacyTrim(legacyProp(workerUser, 'username')).toUpperCase();
      if (!turkid) {
        throw new Error('No valid username found');
      }

      if (ownerId != await getTdfOwner(experiment)) {
        throw new Error('You are not the owner of that TDF');
      }

      // Get available HITs
      let hitlist = await turkAny.getAvailableHITs(ownerProfile, {});
      if (hitlist && hitlist.length) {
        workPerformed.findHITs = 'HITs found: ' + hitlist.length;
        workPerformed.hitdetails = hitlist;
      } else {
        workPerformed.findHITs = 'No HITs found';
        hitlist = [];
        throw new Error('No HITs - can not continue');
      }

      // Look for assignments for HITs that can be reviewed
      let assignment = null;
      for (let i = 0; i < hitlist.length; ++i) {
        const hit = hitlist[i];
        let assignList = await turkAny.getAssignmentsForHIT(ownerProfile, hit);
        if (!assignList) {
          assignList = [];
        }

        for (let j = 0; j < assignList.length; ++j) {
          const currAssign = assignList[j];
          if (currAssign && currAssign.WorkerId) {
            const assignWorker = legacyTrim(currAssign.WorkerId).toUpperCase();
            if (turkid === assignWorker) {
              assignment = currAssign;
              break;
            }
          }
        }

        if (assignment) {
          break;
        }
      }

      if (assignment) {
        workPerformed.findAssignment = 'Found assignment ' + assignment.AssignmentId;
        workPerformed.assignmentDetails = assignment;
      } else {
        workPerformed.findAssignment = 'No assignment found';
        throw new Error('Can not continue - no assignment');
      }

      const approveResponse = await turkAny.approveAssignment(ownerProfile, {
                'AssignmentId': assignment.AssignmentId,
                'RequesterFeedback': msg || "Thanks for your participation"
            });
      workPerformed.approveAssignment = 'Assignment was approved!';
      workPerformed.approvalDetails = approveResponse;
    } catch (e) {
      serverConsole('Error processing Turk approval', e);
      errmsg = 'Exception caught while processing Turk approval: ' + JSON.stringify(e, null, 2);
    } finally {
      // Always write an entry
      const userLogEntry = _.extend({
        'action': 'turk-approval',
        'success': errmsg === null,
        'errmsg': errmsg,
        'turkId': turkid,
        'tdfOwnerId': ownerId,
      }, workPerformed);

      serverConsole('About to log entry for Turk', JSON.stringify(userLogEntry, null, 2));
      writeUserLogEntries(experiment, userLogEntry, workerUserId);
    }

    return errmsg;
  },

  turkBonus: async function(workerUserId, experiment) {
    serverConsole('turkBonus', workerUserId, experiment);

    let errmsg = null; // Return null on success

    // Data we log
    const workPerformed: any = {
      locatePreviousAssignment: 'not performed',
      locateBonusAmount: 'not performed',
      sendBonusRequest: 'not performed',
    };

    let turkid; let ownerId; let tdfid; let unitnum; // Needed for final work

    try {
      const usr = await MeteorAny.userAsync();
      if (!await RolesAny.userIsInRoleAsync(usr, ['admin', 'teacher'])) {
        throw new Error('You are not authorized to do that');
      }
      ownerId = usr._id;

      const ownerProfile = await MeteorAny.users.findOneAsync({_id: ownerId});
      if (!ownerProfile) {
        throw new Error('Could not find your user profile');
      }
      if (!ownerProfile.aws || !ownerProfile.aws.have_aws_id || !ownerProfile.aws.have_aws_secret) {
        throw new Error('You are not set up for AWS/MTurk');
      }

      // METEOR 3 FIX: await the Promise before chaining Underscore methods
      const workerUser = await MeteorAny.users.findOneAsync({'_id': workerUserId});
      turkid = legacyTrim(legacyProp(workerUser, 'username')).toUpperCase();
      if (!turkid) {
        throw new Error('No valid username found');
      }

      if (ownerId != await getTdfOwner(experiment)) {
        throw new Error('You are not the owner of that TDF');
      }

      // Read user log for experiment to find assignment ID
      let assignmentId = null;
      let previousBonus = false;

      tdfid = await userLogGetTdfId(workerUserId, experiment);
      if (!tdfid) {
        throw new Error('Could not find the TDF for that user/experiment combination');
      }

      const userLog = await UserTimesLog.findOneAsync({userId: workerUserId});
      let userLogEntries = [];
      if (userLog && userLog[experiment] && userLog[experiment].length) {
        userLogEntries = userLog[experiment];
      }

      let i;

      for (i = userLogEntries.length - 1; i >= 0; --i) {
        const rec = userLogEntries[i];
        const action = legacyTrim(rec.action).toLowerCase();
        if (action === 'turk-approval' && !assignmentId) {
          const assignmentDetails = legacyProp(rec, 'assignmentDetails');
          assignmentId = legacyTrim(legacyProp(assignmentDetails, 'AssignmentId'));
          if (!assignmentId) {
            serverConsole('Bad Assignment found for bonus', rec);
            throw new Error('No previous assignment ID was found for approval, so no bonus can be paid. Examine approval/pay details for more information');
          }
        } else if (action === 'turk-bonus') {
          previousBonus = true;
        }
      }

      if (assignmentId) {
        workPerformed.locatePreviousAssignment = 'Found assignment ' + assignmentId;
        workPerformed.assignmentId = assignmentId;
      } else {
        workPerformed.locatePreviousAssignment = 'No assignment found';
        throw new Error('Previous assignment required');
      }

      if (previousBonus) {
        throw new Error('There was already a bonus paid for this user/TDF combination');
      }

      // We read the TDF to get the bonus amount
      const tdfFile = await getTdfById(tdfid);
      let bonusAmt = null;
      const unitList = tdfFile.tdfs.tutor.unit || [];
      for (i = 0; i < unitList.length; ++i) {
        const turkBonusRaw = legacyProp(unitList[i], 'turkbonus');
        const turkBonusValue = Array.isArray(turkBonusRaw) ? turkBonusRaw[0] : turkBonusRaw;
        bonusAmt = legacyFloat(turkBonusValue);
        if (bonusAmt) {
          unitnum = i;
          break;
        }
      }

      if (bonusAmt) {
        workPerformed.locateBonusAmount = 'Found bonus ' + bonusAmt +
                    ' in tdf[unit]=' + tdfid + '[' + unitnum + ']';
        workPerformed.bonusAmt = bonusAmt;
      } else {
        workPerformed.locateBonusAmount = 'No bonus amount found';
        throw new Error('Bonus amount required');
      }

      // Actually send request - note that we always force USD currently
      const bonusResponse = await turkAny.grantBonus(ownerProfile, bonusAmt, {
        'WorkerId': turkid,
        'AssignmentId': assignmentId,
        'Reason': 'Additional unit completion. Thank you!',
      });
      workPerformed.sendBonusRequest = 'Bonus request sent';
      workPerformed.bonusResponse = bonusResponse;
    } catch (e) {
      serverConsole('Error processing Turk bonus', e);
      errmsg = 'Exception caught while processing Turk bonus: ' + JSON.stringify(e, null, 2);
    } finally {
      const userLogEntry = _.extend({
        'action': 'turk-bonus',
        'success': errmsg === null,
        'errmsg': errmsg,
        'turkId': turkid,
        'tdfOwnerId': ownerId,
        'selectedTdfId': tdfid,
        'selectedTdfUnitNum': unitnum,
      }, workPerformed);

      serverConsole('About to log entry for Turk ', experiment, JSON.stringify(userLogEntry, null, 2));
      writeUserLogEntries(experiment, userLogEntry, workerUserId);
    }

    return errmsg;
  },

  // Given an experiment name, return the current status of any turk activities
  turkUserLogStatus: async function(experiment) {
    serverConsole('turkUserLogStatus', experiment);

    const usr = await MeteorAny.userAsync();
    if (!usr || !usr._id) {
      throw new Meteor.Error('No current user');
    }
    if (!await RolesAny.userIsInRoleAsync(usr, ['admin', 'teacher'])) {
      throw new Meteor.Error('You are not authorized to do that');
    }

    const experimentKey = legacyTrim(String(experiment || ''));
    if (!experimentKey) {
      throw new Meteor.Error('Experiment key is required');
    }

    let expTDF = await getTdfByFileName(experimentKey);
    if (!expTDF) {
      expTDF = await getTdfById(experimentKey);
    }
    if (!expTDF || !expTDF._id) {
      throw new Meteor.Error('Could not find experiment TDF for ' + experimentKey);
    }
    const isAdmin = await RolesAny.userIsInRoleAsync(usr, ['admin']);
    if (!isAdmin && expTDF.ownerId !== usr._id) {
      throw new Meteor.Error('You are not the owner of that TDF');
    }

    const expTDFId = expTDF._id;
    const expTDFFileName = legacyTrim((expTDF as any)?.content?.fileName || '');
    const setspec = (expTDF as any)?.content?.tdfs?.tutor?.setspec || {};
    const conditionRefs = Array.isArray(setspec.condition) ? setspec.condition : [];
    const conditionTdfIds = Array.isArray(setspec.conditionTdfIds) ? setspec.conditionTdfIds : [];
    const conditionLookupKeys = [...new Set(
      [...conditionRefs, ...conditionTdfIds]
        .map((entry: any) => legacyTrim(String(entry || '')))
        .filter((entry: string) => entry.length > 0)
    )];
    const conditionDocs = conditionLookupKeys.length > 0
      ? await Tdfs.find(
        {
          $or: [
            { _id: { $in: conditionLookupKeys } },
            { 'content.fileName': { $in: conditionLookupKeys } }
          ]
        },
        { fields: { _id: 1, 'content.fileName': 1, 'content.tdfs.tutor.unit.unitname': 1 } }
      ).fetchAsync()
      : [];
    const scopedTdfIds = [...new Set(
      [expTDFId, ...conditionDocs.map((tdf: any) => tdf?._id)]
        .map((entry) => legacyTrim(String(entry || '')))
        .filter((entry) => entry.length > 0)
    )];
    const scopedFileNames = [...new Set(
      [expTDFFileName, ...conditionDocs.map((tdf: any) => legacyTrim(tdf?.content?.fileName || ''))]
        .map((entry) => legacyTrim(String(entry || '')))
        .filter((entry) => entry.length > 0)
    )];
    const records: any[] = [];

    // Omnibus scope:
    // - Selected TDF
    // - Any condition TDF referenced by selected root (by fileName and/or _id)
    const allExperimentStates = await GlobalExperimentStates.find({
      TDFId: {$in: scopedTdfIds}
    }).fetchAsync();
    const messageExperimentKeys = [...new Set([
      experimentKey,
      ...scopedTdfIds,
      ...scopedFileNames
    ])];
    const scheduledMessages = await ScheduledTurkMessages.find({
      experiment: {$in: messageExperimentKeys}
    }).fetchAsync();
    const userTimeScopeQuery = scopedTdfIds.length > 0
      ? { $or: scopedTdfIds.map((tdfId: string) => ({ [tdfId]: { $exists: true } })) }
      : null;
    const scopedUserTimesLog = userTimeScopeQuery
      ? await UserTimesLog.find(userTimeScopeQuery).fetchAsync()
      : [];

    const allUserIds: string[] = [...new Set(
      [
        ...allExperimentStates.map((es: any) => legacyTrim(String(es?.userId || ''))),
        ...scheduledMessages.map((msg: any) => legacyTrim(String(msg?.workerUserId || ''))),
        ...scopedUserTimesLog.map((log: any) => legacyTrim(String(log?.userId || '')))
      ].filter((id: string) => id.length > 0)
    )];
    if (allUserIds.length < 1) {
      return records;
    }

    const allUsers = await MeteorAny.users.find({_id: {$in: allUserIds}}).fetchAsync();
    const userTimesLog = await UserTimesLog.find({userId: {$in: allUserIds}}).fetchAsync();
    const allExperimentStatesForUsers = allExperimentStates.filter((entry: any) => allUserIds.includes(entry?.userId));
    const scheduledMessagesForUsers = scheduledMessages.filter((entry: any) => allUserIds.includes(entry?.workerUserId));

    const tdfFileNameById: Record<string, string> = {};
    const tdfIdByFileName: Record<string, string> = {};
    const posttestUnitByTdfId: Record<string, number> = {};
    const getNormalizedUnitName = (unit: any) => {
      const raw = Array.isArray(unit?.unitname) ? unit.unitname[0] : unit?.unitname;
      return legacyTrim(String(raw || '')).toLowerCase();
    };
    for (const tdf of [expTDF, ...conditionDocs]) {
      const tdfId = legacyTrim(String((tdf as any)?._id || ''));
      const fileName = legacyTrim(String((tdf as any)?.content?.fileName || ''));
      if (!tdfId) {
        continue;
      }
      tdfFileNameById[tdfId] = fileName || tdfId;
      if (fileName) {
        tdfIdByFileName[fileName] = tdfId;
      }
      const units = Array.isArray((tdf as any)?.content?.tdfs?.tutor?.unit)
        ? (tdf as any).content.tdfs.tutor.unit
        : [];
      const posttestUnitIndex = units.findIndex((unit: any) => getNormalizedUnitName(unit) === 'posttest');
      posttestUnitByTdfId[tdfId] = posttestUnitIndex;
    }

    const resolveScopedTdfId = (rawKey: unknown): string | null => {
      const key = legacyTrim(String(rawKey || ''));
      if (!key) return null;
      if (scopedTdfIds.includes(key)) return key;
      if (tdfIdByFileName[key]) return tdfIdByFileName[key];
      return null;
    };
    const historyTdfKeys = [...new Set([...scopedTdfIds, ...scopedFileNames])];
    const scopedHistories = await Histories.find(
      {
        userId: { $in: allUserIds },
        TDFId: { $in: historyTdfKeys }
      },
      {
        fields: {
          userId: 1,
          TDFId: 1,
          levelUnit: 1,
          outcome: 1,
          time: 1,
          recordedServerTime: 1
        }
      }
    ).fetchAsync();
    const historiesByUserTdf: Record<string, Record<string, any[]>> = {};
    for (const history of scopedHistories) {
      const userId = legacyTrim(String(history?.userId || ''));
      const tdfId = resolveScopedTdfId(history?.TDFId);
      if (!userId || !tdfId) {
        continue;
      }
      if (!historiesByUserTdf[userId]) {
        historiesByUserTdf[userId] = {};
      }
      if (!historiesByUserTdf[userId]![tdfId]) {
        historiesByUserTdf[userId]![tdfId] = [];
      }
      historiesByUserTdf[userId]![tdfId]!.push(history);
    }

    const experimentStatesByUserTdf: Record<string, Record<string, any[]>> = {};
    for (const state of allExperimentStatesForUsers) {
      const userId = legacyTrim(String(state?.userId || ''));
      // Canonicalize experiment-state grouping to condition TDF when present,
      // so root-keyed experiment rows merge with condition-keyed component/history rows.
      const tdfId =
        resolveScopedTdfId(state?.experimentState?.conditionTdfId)
        || resolveScopedTdfId(state?.experimentState?.currentTdfId)
        || resolveScopedTdfId(state?.TDFId);
      if (!userId || !tdfId) {
        continue;
      }
      if (!experimentStatesByUserTdf[userId]) {
        experimentStatesByUserTdf[userId] = {};
      }
      if (!experimentStatesByUserTdf[userId]![tdfId]) {
        experimentStatesByUserTdf[userId]![tdfId] = [];
      }
      experimentStatesByUserTdf[userId]![tdfId]!.push(state);
    }

    const latestScheduledByUserTdf: Record<string, Record<string, any>> = {};
    for (const message of scheduledMessagesForUsers) {
      const userId = legacyTrim(String(message?.workerUserId || ''));
      const tdfId = resolveScopedTdfId(message?.experiment);
      if (!userId || !tdfId) {
        continue;
      }
      if (!latestScheduledByUserTdf[userId]) {
        latestScheduledByUserTdf[userId] = {};
      }
      const existing = latestScheduledByUserTdf[userId]![tdfId];
      const existingStamp = Number(existing?.lastAttemptAt || existing?.sentAt || existing?.scheduled || 0);
      const messageStamp = Number(message?.lastAttemptAt || message?.sentAt || message?.scheduled || 0);
      if (!existing || messageStamp >= existingStamp) {
        latestScheduledByUserTdf[userId]![tdfId] = message;
      }
    }

    for (const userId of allUserIds) {
      const userRec = allUsers.find((user: any) => user._id === userId);
      const primaryEmail = userRec && Array.isArray(userRec.emails)
        ? legacyTrim(String(userRec.emails?.[0]?.address || ''))
        : '';
      const displayUsername = legacyTrim(String(userRec?.username || primaryEmail || userId));
      const userTimes = userTimesLog.find((userTimeLog: any) => userTimeLog.userId === userId);

      const rowTdfIds = new Set<string>();
      Object.keys(experimentStatesByUserTdf[userId] || {}).forEach((tdfId) => rowTdfIds.add(tdfId));
      Object.keys(latestScheduledByUserTdf[userId] || {}).forEach((tdfId) => rowTdfIds.add(tdfId));
      if (userTimes) {
        for (const key of [...scopedTdfIds, ...scopedFileNames]) {
          const tdfId = resolveScopedTdfId(key);
          if (!tdfId) {
            continue;
          }
          const logsForKey = (userTimes as any)[key];
          if (Array.isArray(logsForKey) && logsForKey.length > 0) {
            rowTdfIds.add(tdfId);
          }
        }
      }

      for (const rowTdfId of rowTdfIds) {
        const rowFileName = tdfFileNameById[rowTdfId] || rowTdfId;
        const allRelevantLogs: any[] = [];
        if (userTimes) {
          for (const key of [rowTdfId, rowFileName]) {
            const keyLogs = (userTimes as any)[key];
            if (Array.isArray(keyLogs)) {
              allRelevantLogs.push(...keyLogs);
            }
          }
        }

        let lastUnitSeen = -1;
        for (const state of (experimentStatesByUserTdf[userId]?.[rowTdfId] || [])) {
          const stateUnit = legacyInt(state?.experimentState?.currentUnitNumber, -1);
          if (stateUnit > lastUnitSeen) {
            lastUnitSeen = stateUnit;
          }
        }

        const data: any = {
          userId: userRec?._id || userId,
          username: displayUsername,
          conditionTdfId: rowTdfId,
          conditionFileName: rowFileName,
          turkpay: '?',
          turkpayDetails: 'No Details Found',
          turkbonus: '?',
          turkbonusDetails: 'No Details Found',
          turkEmailSchedule: '?',
          turkEmailScheduleDetails: 'No Details Found',
          turkEmailSend: '?',
          turkEmailSendDetails: 'No Details Found',
          emailDeliveryStatus: 'unknown',
          emailDeliveryAttempts: 0,
          emailDeliveryLastAttempt: '',
          emailDeliveryLastError: '',
          emailDeliveryDetails: null,
          questionsSeen: 0,
          posttestCorrect: 0,
          answersCorrect: 0,
          lastUnitSeen: lastUnitSeen,
          maxTimestamp: 0,
        };

        for (const log of allRelevantLogs) {
          if (!log) {
            continue;
          }
          if (log.action === 'turk-approval') {
            data.turkpay = log.success ? 'Complete' : 'FAIL';
            data.turkpayDetails = log;
          } else if (log.action === 'turk-bonus') {
            data.turkbonus = log.success ? 'Complete' : 'FAIL';
            data.turkbonusDetails = log;
          } else if (log.action === 'turk-email-schedule') {
            data.turkEmailSchedule = log.success ? 'Complete' : 'FAIL';
            data.turkEmailScheduleDetails = log;
          } else if (log.action === 'turk-email-send') {
            data.turkEmailSend = log.success ? 'Complete' : 'FAIL';
            data.turkEmailSendDetails = log;
          }
        }

        const sched = latestScheduledByUserTdf[userId]?.[rowTdfId];
        if (sched) {
          data.emailDeliveryStatus = String(sched.deliveryStatus || (sched.sent ? 'processed' : 'scheduled'));
          data.emailDeliveryAttempts = Number(sched.deliveryAttemptCount || 0);
          data.emailDeliveryLastAttempt = sched.lastAttemptAt ? new Date(sched.lastAttemptAt).toString() : '';
          data.emailDeliveryLastError = sched.lastError ? displayify(sched.lastError) : '';
          data.emailDeliveryDetails = {
            deliveryStatus: sched.deliveryStatus || (sched.sent ? 'processed' : 'scheduled'),
            deliveryAttemptCount: Number(sched.deliveryAttemptCount || 0),
            lastAttemptAt: sched.lastAttemptAt || null,
            sentAt: sched.sentAt || null,
            scheduled: sched.scheduled || null,
            lastError: sched.lastError || null
          };
        }
        const posttestUnitIndex = typeof posttestUnitByTdfId[rowTdfId] === 'number'
          ? posttestUnitByTdfId[rowTdfId]
          : -1;
        for (const history of (historiesByUserTdf[userId]?.[rowTdfId] || [])) {
          const historyTs = legacyInt(history?.recordedServerTime || history?.time, 0);
          if (historyTs > data.maxTimestamp) {
            data.maxTimestamp = historyTs;
          }
          if (history?.outcome === 'correct') {
            data.answersCorrect += 1;
            data.questionsSeen += 1;
          } else if (history?.outcome === 'incorrect') {
            data.questionsSeen += 1;
          }
          if (posttestUnitIndex >= 0 &&
              history?.outcome === 'correct' &&
              legacyInt(history?.levelUnit, -1) === posttestUnitIndex) {
            data.posttestCorrect += 1;
          }
        }

        records.push(data);
      }
    }
    return records;
  },
  // DEBUG - admin only
  turkTest: async function(ownerProfile, hit) {
    const usr = await MeteorAny.userAsync();
    if (!usr || !await RolesAny.userIsInRoleAsync(usr, ['admin'])) {
      throw new Meteor.Error(403, 'Admin access required');
    }
    serverConsole('Method hit');
    const assignList = await turkAny.getAssignmentsForHIT(ownerProfile, hit);
    serverConsole('Got there??');
    serverConsole(assignList);
  },
});

