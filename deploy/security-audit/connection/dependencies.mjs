import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// One existing dependency lock owns the MCP SDK and its HTTP/OAuth middleware.
// The audit image installs that lock independently; it never starts or imports
// the Mongo analytics entrypoint and receives no Mongo configuration.
const require = createRequire(new URL('../../../mofacts-mcp-sidecar/services/mongo-mcp/package.json', import.meta.url));
export const dependency = name => import(pathToFileURL(require.resolve(name)).href);
