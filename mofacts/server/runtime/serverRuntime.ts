import { registerDdpRateLimits } from './ddpRateLimits';
import { registerDynamicAssetsRoute } from './dynamicAssetsRoute';

type ServerRuntimeDeps = {
  DynamicAssets: {
    findOneAsync: (selector: Record<string, unknown>) => Promise<any>;
  };
  serverConsole: (...args: unknown[]) => void;
};

export function registerServerRuntime(deps: ServerRuntimeDeps) {
  registerDynamicAssetsRoute({
    DynamicAssets: deps.DynamicAssets,
    serverConsole: deps.serverConsole,
  });
  registerDdpRateLimits({
    serverConsole: deps.serverConsole,
  });
}
