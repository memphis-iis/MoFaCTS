/**
 * MoFaCTS core code -- AGPLv3 licensed.
 *
 * Serves Psynaptix session-config YAML files under /psynaptix-config/ (issues
 * #89/#115/#140).
 *
 * Meteor's static public/ dir serves from a BUILT manifest, so runtime-added
 * files (e.g. an e2e package's psynaptix-config.yaml bind-mounted by the e2e
 * overlay) are not served. This route serves the YAML from a directory that
 * can be supplied at runtime:
 *
 *   PSYNAPTIX_CONFIG_DIR  (default: the Meteor bundle's web.browser/app
 *                         psynaptix-config dir — the baked public dir)
 *
 * The client's psynaptixConfigResolver fetches /psynaptix-config/<ref> and the
 * raw YAML is carried to the service as payload.configYaml (issue #115).
 * Path-traversal is guarded: the ref must be a plain file name.
 */

import fs from 'node:fs';
import path from 'node:path';
import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import type { IncomingMessage, ServerResponse } from 'http';

function resolveConfigDir(): string {
  const envDir = process.env.PSYNAPTIX_CONFIG_DIR;
  if (envDir && envDir.trim().length > 0) {
    return envDir.trim();
  }
  // Default: the Meteor bundle's public dir (where public/ is baked). In dev
  // (meteor run) the public dir is the repo's mofacts/public.
  return path.join(
    Meteor.isProduction
      ? '/opt/bundle/bundle/programs/web.browser/app'
      : path.resolve(process.cwd(), 'public'),
    'psynaptix-config',
  );
}

function serveYaml(ref: string, res: ServerResponse): void {
  const configDir = resolveConfigDir();
  // Guard: only a plain file name (no separators, no '..', no leading dots).
  if (
    !ref ||
    ref.includes('/') ||
    ref.includes('\\') ||
    ref === '..' ||
    ref.startsWith('.')
  ) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Invalid psynaptix config ref');
    return;
  }

  const filePath = path.join(configDir, ref);
  fs.readFile(filePath, (err, data) => {
    if (err || !data) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Psynaptix config not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/yaml; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}

WebApp.connectHandlers.use('/psynaptix-config', function(req: IncomingMessage, res: ServerResponse, next: () => void) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    next();
    return;
  }
  // req.url is like '/sample.yaml' (mounted at /psynaptix-config)
  const ref = (req.url ?? '').replace(/^\//, '').split('?')[0];
  if (!ref) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Missing psynaptix config ref');
    return;
  }
  serveYaml(ref, res);
});
