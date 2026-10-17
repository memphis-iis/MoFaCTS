// This import makes Meteor retain the external npm package in its server bundle.
import 'highs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

declare const __meteor_bootstrap__: { serverDir: string };

/** Meteor's server bundle owns npm/node_modules. Resolve there with Node's
 * CommonJS resolver, not Rspack's virtual module resolver, for worker execution.
 */
export function resolveKcChainWorkerLoader(): string {
  return createRequire(join(__meteor_bootstrap__.serverDir, 'npm', 'package.json')).resolve('highs');
}
