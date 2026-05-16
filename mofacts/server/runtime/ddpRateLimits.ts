import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';

type RateLimitResult = {
  timeToReset: number;
  numInvocationsLeft: number;
};

type DdpRateLimiterLike = typeof DDPRateLimiter & {
  setErrorMessage: (handler: (rateLimitResult: RateLimitResult) => string) => void;
};

type DdpRateLimitDeps = {
  serverConsole: (...args: unknown[]) => void;
};

const DDPRateLimiterWithErrorMessage = DDPRateLimiter as DdpRateLimiterLike;

let rateLimitsRegistered = false;

export function registerDdpRateLimits(deps: DdpRateLimitDeps) {
  if (rateLimitsRegistered) {
    return;
  }
  rateLimitsRegistered = true;

  DDPRateLimiter.addRule({
    type: 'method',
    name: 'requestPasswordReset',
    connectionId() { return true; }
  }, 3, 3600000);

  DDPRateLimiter.addRule({
    type: 'method',
    name: 'resetPasswordWithToken',
    connectionId() { return true; }
  }, 5, 3600000);

  DDPRateLimiter.addRule({
    type: 'method',
    name: 'resendVerificationEmail',
    connectionId() { return true; }
  }, 3, 3600000);

  DDPRateLimiter.addRule({
    type: 'method',
    name: 'login',
    connectionId() { return true; }
  }, 10, 300000);

  DDPRateLimiter.addRule({
    type: 'method',
    name: 'signUpUser',
    connectionId() { return true; }
  }, 5, 3600000);

  DDPRateLimiter.addRule({
    type: 'method',
    name: 'provisionExperimentUser',
    connectionId() { return true; }
  }, 20, 3600000);

  DDPRateLimiter.addRule({
    type: 'method',
    name: 'processPackageUpload',
    userId(userId: string | null | undefined) { return !!userId; }
  }, 20, 3600000);

  DDPRateLimiter.addRule({
    type: 'method',
    name(name: string) {
      return ['deleteAllFiles', 'deletePackageFile', 'removeAssetById', 'removeMultipleAssets', 'deleteManualContentDraft'].includes(name);
    },
    userId(userId: string | null | undefined) { return !!userId; }
  }, 10, 3600000);

  DDPRateLimiter.addRule({
    type: 'method',
    name(name: string) {
      return [
        'transferDataOwnership',
        'assignAccessors',
        'resolveUsersForTdf',
        'adminCreateOrUpdateUser',
        'insertNewUsers',
        'userAdminNewsEmailRecipients'
      ].includes(name);
    },
    userId(userId: string | null | undefined) { return !!userId; }
  }, 30, 3600000);

  DDPRateLimiter.addRule({
    type: 'method',
    name(name: string) {
      return ['saveTdfContent', 'saveTdfStimuli'].includes(name);
    },
    userId(userId: string | null | undefined) { return !!userId; }
  }, 30, 3600000);

  DDPRateLimiterWithErrorMessage.setErrorMessage(function(rateLimitResult: RateLimitResult) {
    const { timeToReset, numInvocationsLeft } = rateLimitResult;
    const seconds = Math.ceil(timeToReset / 1000);
    deps.serverConsole('Rate limit exceeded - wait', seconds, 'seconds. Remaining:', numInvocationsLeft);
    return `Too many requests. Please try again in ${seconds} seconds.`;
  });
}
