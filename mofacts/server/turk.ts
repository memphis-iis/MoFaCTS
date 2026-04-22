/* turk.js - Provide access to AWS Mechanical Turk services using AWS data that
we track per user. See turk_methods.js for the implementation of the server
methods called by the client-side code
******************************************************************************
Some helpful documentation:

Accessing the sandbox (vs prod)
https://workersandbox.mturk.com/?sandboxinfo=true

Common parameters for Turk requests
http://docs.aws.amazon.com/AWSMechTurk/latest/AWSMturkAPI/ApiReference_CommonParametersArticle.html

Creating a request signature for Turk
http://docs.aws.amazon.com/AWSMechTurk/latest/AWSMechanicalTurkRequester/MakingRequests_RequestAuthenticationArticle.html

Creating an HMAC in Meteor
http://stackoverflow.com/questions/16860371/hmac-md5-with-meteor

Approving an assignment in Turk
http://docs.aws.amazon.com/AWSMechTurk/latest/AWSMturkAPI/ApiReference_ApproveAssignmentOperation.html

A Lesson in MTurk HIT Stats
-------------------------------
There are 3 main counts: Available, Pending, and Complete. When you create a
HIT, Available is equal to the number of assignment. When a worker accepts an
assignment, Available is decremented and Pending is incremented. When the
worker submits their code (for a survey link, say), Pending is decremented.
Then that assignment is approved or rejected, which increments Completed.
SO... When Available + Pending + Completed != Max Assignments we know that
there are assignments that need to be approved. HOWEVER!!! It appears that
this is not always reliable. We have instead adopted the far more conservative
criteria where we assume a HIT might have approvable assignments if ONE of the
following is true:
    - Available > 0
    - Pending > 0
    - Completed < Max
******************************************************************************
**/

import {serverConsole, decryptData} from './serverComposition';

import {
  MTurkClient,
  GetAccountBalanceCommand,
  ListHITsCommand,
  ListAssignmentsForHITCommand,
  ApproveAssignmentCommand,
  GetAssignmentCommand,
  NotifyWorkersCommand,
  SendBonusCommand
} from '@aws-sdk/client-mturk';


const turk = (function() {
  // var TURK_URL = "https://mechanicalturk.amazonaws.com";
  // var SANDBOX_URL = "https://mechanicalturk.sandbox.amazonaws.com";
  // var TURK_URL = "https://mturk-requester.us-east-1.amazonaws.com";
  // var SANDBOX_URL = "https://mturk-requester-sandbox.us-east-1.amazonaws.com";

  const SANDBOX_ENDPOINT = 'https://mturk-requester-sandbox.us-east-1.amazonaws.com';

  function getAwsProfile(userProfile: any) {
    if (userProfile && typeof userProfile === 'object' && userProfile.aws) {
      return userProfile.aws;
    }
    return userProfile;
  }

  function validateField(fld: any, err: any) {
    if (!fld) {
      serverConsole('Validation err:');
      serverConsole(err);
      throw err;
    }
  }

  function validateUser(userProfile: any) {
    const awsProfile = getAwsProfile(userProfile);
    validateField(awsProfile, 'AWS profile not found');
    validateField(awsProfile.have_aws_id, 'AWS request user has no ID');
    validateField(awsProfile.aws_id, 'AWS request user ID is invalid');
    validateField(awsProfile.have_aws_secret, 'AWS request user has no secret key');
    validateField(awsProfile.aws_secret_key, 'AWS request user secret key is invalid');
    return awsProfile;
  }

  function getClient(userProfile: any) {
    const awsProfile = validateUser(userProfile);
    const config: any = {
      credentials: {
        accessKeyId: decryptData(awsProfile.aws_id),
        secretAccessKey: decryptData(awsProfile.aws_secret_key),
      },
      region: 'us-east-1',
    };

    if (awsProfile.use_sandbox) {
      config.endpoint = SANDBOX_ENDPOINT;
    }

    return new MTurkClient(config);
  }

  return {
    getAccountBalance: async function(userProfile: any) {
      const req = {};
      validateUser(userProfile);

      const client = getClient(userProfile);

      const res = await client.send(new GetAccountBalanceCommand(req));

      return res;
    },

    // Required parameters: none
    // Optional parameters: SortProperty, SortDirection
    getAvailableHITs: async function(userProfile: any) {
      const req = {
        'MaxResults': 99,
      };

      const client = getClient(userProfile);

      const hitlist: any[] = [];
      let rejected = 0;

      const data = await client.send(new ListHITsCommand(req));
      (data.HITs ?? []).forEach(function(hit) {
        const max = hit.MaxAssignments ?? 0;
        const pend = hit.NumberOfAssignmentsPending ?? 0;
        const avail = hit.NumberOfAssignmentsAvailable ?? 0;
        const complete = hit.NumberOfAssignmentsCompleted ?? 0;

        if (max < 0 || pend < 0 || avail < 0 || complete < 0) {
          serverConsole('Something wrong with this HIT\'s stats - including for safety. hit was', hit);
          hitlist.push(hit.HITId);
        } else if (pend > 0 || avail > 0 || complete < max) {
          hitlist.push(hit.HITId);
        } else {
          rejected +=1;
        }
      });
      serverConsole('Searched HITs returning', hitlist.length, 'as possible, rejected', rejected);
      return hitlist;
    },

    // Required parameters: HITId
    // Optional parameters: AssignmentStatus
    getAssignmentsForHIT: async function(userProfile: any, hitId: any) {
      const req = {'HITId': hitId};

      const client = getClient(userProfile);

      const res = await client.send(new ListAssignmentsForHITCommand(req));
      const assignlist: any[] = [];
      (res.Assignments ?? []).forEach(function(assignment) {
        assignlist.push(assignment);
      });
      return assignlist;
    },

    // Required parameters: AssignmentId
    // Optional parameters: RequesterFeedback
    approveAssignment: async function(userProfile: any, requestParams: any) {
      const req = {
        'AssignmentId': requestParams.AssignmentId || '',
        'RequesterFeedback': requestParams.RequesterFeedback || '',
      };

      const client = getClient(userProfile);

      try {
        await client.send(new ApproveAssignmentCommand(req));
        return {'Successful': 'true'}; // MTurk has stopped sending response details back for this operation, so we'll just put something here
      } catch (err) {
        throw {
          'errmsg': 'Assignment Approval failed',
          'response': err,
        };
      }
    },

    // Required parameters: AssignmentId
    // Pretty raw - currently only used for tracking/debugging on profile
    // page of our admins.
    getAssignment: async function(userProfile: any, requestParams: any) {
      const req = {...requestParams};

      const client = getClient(userProfile);

      return await client.send(new GetAssignmentCommand(req));
    },

    // Required parameters: Subject, MessageText, WorkerId
    notifyWorker: async function(userProfile: any, requestParams: any) {
      const req = {
        'Subject': requestParams.Subject,
        'MessageText': requestParams.MessageText,
        'WorkerIds': [requestParams.WorkerId],
      };
      serverConsole('Sending request to Mechanical Turk', req);
      const client = getClient(userProfile);

      try {
        await client.send(new NotifyWorkersCommand(req));
        return {'Successful': 'true'}; // see approveAssignment
      } catch (err) {
        throw {
          'errmsg': 'Worker Notification failed',
          'response': err,
        };
      }
    },

    // Required parameters: WorkerId, AssignmentId, Reason
    grantBonus: async function(userProfile: any, amount: any, requestParams: any) {
      const req = {
        'BonusAmount': amount,
        'WorkerId': requestParams.WorkerId || '',
        'AssignmentId': requestParams.AssignmentId || '',
        'Reason': requestParams.Reason || '',
      };

      const client = getClient(userProfile);

      try {
        await client.send(new SendBonusCommand(req));
        return {'Successful': 'true'};
      } catch (err) {
        throw {
          'errmsg': 'Bonus Granting failed',
          'response': err,
        };
      }
    },


  };
})();

export {turk};
