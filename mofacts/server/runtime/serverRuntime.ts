import { registerDdpRateLimits } from './ddpRateLimits';
import { registerDynamicAssetsRoute } from './dynamicAssetsRoute';
import type { createStorageBoundary } from '../lib/storageBoundary';

type ServerRuntimeDeps = {
  DynamicAssets: {
    findOneAsync: (selector: Record<string, unknown>) => Promise<any>;
  };
  storageBoundary: ReturnType<typeof createStorageBoundary>;
  storageRoot: string;
  serverConsole: (...args: unknown[]) => void;
};

export function registerServerRuntime(deps: ServerRuntimeDeps) {
  registerDynamicAssetsRoute({
    DynamicAssets: deps.DynamicAssets,
    storageBoundary: deps.storageBoundary,
    storageRoot: deps.storageRoot,
    serverConsole: deps.serverConsole,
  });
  registerDdpRateLimits({
    serverConsole: deps.serverConsole,
  });
}
