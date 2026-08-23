import { WebAppInternals } from 'meteor/webapp';

const webAppInternals = WebAppInternals as unknown as {
  setInlineScriptsAllowed(allowed: boolean): Promise<void>;
};

// Serve Meteor's runtime configuration as a same-origin script so production
// can enforce script-src 'self' without unsafe-inline.
await webAppInternals.setInlineScriptsAllowed(false);
