import { participantRootForConnection } from '../lib/participantSession';
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
export const PUBLIC_DEMO_RATE_LIMIT = Object.freeze({ requests: 10, windowMs: 3600000, scope: 'connection' } as const);

export function isRateLimitedOpenRouterMethod(name: string): boolean {
  return [
    'callAiContentOpenRouterRequest',
    'callResolvedOpenRouterJson',
    'callResolvedOpenRouterEmbeddings',
    'lookupSparcPrimitive',
    'publishSparcPrimitive',
    'reviseSparcPrimitive',
    'resolveSparcVisualSupport',
    'prepareSparcVideoCatalogTarget',
    'saveSparcVideoCatalogPassages'
  ].includes(name);
}

export function registerDdpRateLimits(deps: DdpRateLimitDeps) {
  if (rateLimitsRegistered) {
    return;
  }
  rateLimitsRegistered = true;
  // Meteor includes every matcher field in its counter key. Apply the connection
  // predicate after matching and before counting so ordinary per-user budgets
  // stay shared across tabs. Only the learner-facing rules registered here qualify.
  const studyActivityRules = new Set<string>();
  const limiter = DDPRateLimiter as typeof DDPRateLimiter & {
    findAllMatchingRulesAsync: (input: { connectionId: string; userId: string | null }) => Promise<{ id: string }[]>;
  };
  const matchRules = limiter.findAllMatchingRulesAsync.bind(limiter);
  limiter.findAllMatchingRulesAsync = async input => {
    const rules = await matchRules(input);
    if (!rules.some(rule => studyActivityRules.has(rule.id)) || !participantRootForConnection(input.connectionId, input.userId)) return rules;
    return rules.filter(rule => !studyActivityRules.has(rule.id));
  };
  const addStudyActivityRule = (...args: Parameters<typeof DDPRateLimiter.addRule>) =>
    studyActivityRules.add(DDPRateLimiter.addRule(...args));
  addStudyActivityRule({ type: 'method', name: 'ingestSimulationResearchBatch',
    connectionId() { return true; } }, 40, 1000);
  addStudyActivityRule({ type: 'method', name(name: string) {
    return ['startSimulationResearchAttempt', 'interruptSimulationResearchActivity', 'endSimulationResearchAttempt'].includes(name);
  }, connectionId() { return true; } }, 30, 60000);
  DDPRateLimiter.addRule({ type: 'method', name: 'exportSimulationResearchTrace',
    connectionId() { return true; } }, 60, 60000);

  DDPRateLimiter.addRule({ type: 'method', name: 'deleteSparcInstructionalComponent',
    userId(userId: string | null | undefined) { return !!userId; } }, 60, 60000);
  addStudyActivityRule({ type: 'method', name: 'getSparcAdministrativeRemovals',
    userId(userId: string | null | undefined) { return !!userId; } }, 180, 60000);

  addStudyActivityRule({
    type: 'method',
    name: 'reportRecoverableWarning',
    userId() { return true; }
  }, 30, 60000);

  DDPRateLimiter.addRule({
    type: 'method',
    name: 'getRecoverableWarnings',
    userId() { return true; }
  }, 30, 60000);

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
    name: 'startPublicDemo',
    connectionId() { return true; }
  }, PUBLIC_DEMO_RATE_LIMIT.requests, PUBLIC_DEMO_RATE_LIMIT.windowMs);

  DDPRateLimiter.addRule({
    type: 'method',
    name(name: string) {
      return [
        'processPackageUpload',
        'confirmPackageUpload',
        'cancelPackageUpload',
        'saveAiGeneratedPackageContent',
      ].includes(name);
    },
    userId(userId: string | null | undefined) { return !!userId; }
  }, 20, 3600000);

  DDPRateLimiter.addRule({
    type: 'method',
    name(name: string) {
      return ['deletePackageFile', 'removeAssetById', 'removeMultipleAssets', 'deleteManualContentDraft'].includes(name);
    },
    userId(userId: string | null | undefined) { return !!userId; }
  }, 10, 3600000);

  DDPRateLimiter.addRule({
    type: 'method',
    name(name: string) {
      return [
        'transferDataOwnership',
        'assignAccessors',
        'resolveUsersForTdf'
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

  addStudyActivityRule({
    type: 'method',
    name(name: string) {
      return [
        'updateOwnProfile',
        'updateOwnSparcPersona',
        'updateOwnUiLocale',
        'updateOwnOpenRouterSettings',
        'getOwnOpenRouterSettings',
        'getOpenRouterCapability',
        'getAiContentOpenRouterCapability',
        'getOpenRouterModelCatalog',
        'deleteOwnOpenRouterKey',
        'testOwnOpenRouterSettings'
      ].includes(name);
    },
    userId(userId: string | null | undefined) { return !!userId; }
  }, 30, 3600000);

  addStudyActivityRule({
    type: 'method',
    name: isRateLimitedOpenRouterMethod,
    userId(userId: string | null | undefined) { return !!userId; }
  }, 600, 3600000);

  DDPRateLimiterWithErrorMessage.setErrorMessage(function(rateLimitResult: RateLimitResult) {
    const { timeToReset, numInvocationsLeft } = rateLimitResult;
    const seconds = Math.ceil(timeToReset / 1000);
    deps.serverConsole('Rate limit exceeded - wait', seconds, 'seconds. Remaining:', numInvocationsLeft);
    return `Too many requests. Please try again in ${seconds} seconds.`;
  });
}
