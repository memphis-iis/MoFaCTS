import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import type { IncomingMessage, ServerResponse } from 'http';

export function buildHealthPayload(now = new Date()) {
  return {
    status: 'ok',
    app: 'mofacts',
    environment: Meteor.isProduction ? 'production' : 'development',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: now.toISOString()
  };
}

WebApp.connectHandlers.use('/health', function(req: IncomingMessage, res: ServerResponse, next: () => void) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    next();
    return;
  }
  const payload = buildHealthPayload();

  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
});
