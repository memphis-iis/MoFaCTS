import { WebAppInternals } from 'meteor/webapp';
import { HTTP_FRAMEWORK_RUNTIME_CONFIG_VERIFICATION } from '../../common/securityAudit/verificationCatalog.ts';
import { bindFrameworkRuntimeConfig } from '../securitySurfaces/registerHttpRoutes.ts';

const webAppInternals = WebAppInternals as unknown as {
  setInlineScriptsAllowed(allowed: boolean): Promise<void>;
};

// Serve Meteor's runtime configuration as a same-origin script so production
// can enforce script-src 'self' without unsafe-inline.
await bindFrameworkRuntimeConfig(webAppInternals, HTTP_FRAMEWORK_RUNTIME_CONFIG_VERIFICATION);
