import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import { HTTP_HEALTH_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog.ts';
import { registerPublicHttpMount } from '../securitySurfaces/registerHttpRoutes.ts';

export function buildHealthPayload(now = new Date()) {
  return {
    status: 'ok',
    app: 'mofacts',
    environment: Meteor.isProduction ? 'production' : 'development',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: now.toISOString()
  };
}

registerPublicHttpMount(WebApp.connectHandlers, '/health', {
  verification: HTTP_HEALTH_VERIFICATIONS,
  dataEgress: { kind: 'public-operational-metadata' },
}, (_request, res) => {
  const payload = buildHealthPayload();

  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
});
