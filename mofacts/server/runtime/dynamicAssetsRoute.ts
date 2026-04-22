import { WebApp } from 'meteor/webapp';
import type { IncomingMessage, ServerResponse } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { getMimeTypeForAssetName } from '../lib/mediaReferences';

type DynamicAssetLike = {
  _id: string;
  path: string;
  ext?: string;
  name?: string;
  fileName?: string;
  type?: string;
  size?: number;
  meta?: {
    public?: boolean;
  };
};

type DynamicAssetsRouteDeps = {
  DynamicAssets: {
    findOneAsync: (selector: Record<string, unknown>) => Promise<DynamicAssetLike | null>;
  };
  serverConsole: (...args: unknown[]) => void;
};

let routeRegistered = false;

function getDynamicAssetsStorageRoot() {
  const home = String(process.env.HOME || '').trim();
  return home ? path.resolve(home, 'dynamic-assets') : '';
}

async function isPathWithinDynamicAssetsStorage(assetPath: string) {
  const storageRoot = getDynamicAssetsStorageRoot();
  if (!storageRoot) {
    return true;
  }
  try {
    const [realAssetPath, realStorageRoot] = await Promise.all([
      fs.promises.realpath(assetPath),
      fs.promises.realpath(storageRoot),
    ]);
    const relative = path.relative(realStorageRoot, realAssetPath);
    return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
  } catch {
    return false;
  }
}

export function registerDynamicAssetsRoute(deps: DynamicAssetsRouteDeps) {
  if (routeRegistered) {
    return;
  }
  routeRegistered = true;

  WebApp.connectHandlers.use('/dynamic-assets', async (
    req: IncomingMessage,
    res: ServerResponse<IncomingMessage>,
    _next: unknown
  ) => {
    const requestUrl = String(req.url || '');
    const requestPath = requestUrl.split('?')[0]?.split('#')[0] || requestUrl;
    const assetId = requestPath.replace(/^\/+/, '').split('/').filter(Boolean)[0] || '';

    if (!assetId || !/^[A-Za-z0-9_-]+$/.test(assetId)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('File not found');
      return;
    }

    try {
      const asset = await deps.DynamicAssets.findOneAsync({ _id: assetId });
      if (!asset) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('File not found');
        return;
      }
      if (asset.meta?.public !== true) {
        deps.serverConsole('[dynamic-assets] Refused non-public asset', assetId);
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('File not found');
        return;
      }

      const assetPath = typeof asset.path === 'string' ? asset.path : '';
      if (!assetPath) {
        deps.serverConsole('[dynamic-assets] Missing asset path for', assetId);
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Asset storage path is unavailable');
        return;
      }
      if (!(await isPathWithinDynamicAssetsStorage(assetPath))) {
        deps.serverConsole('[dynamic-assets] Refused asset outside storage root', assetId, assetPath);
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('File not found');
        return;
      }

      try {
        await fs.promises.access(assetPath, fs.constants.R_OK);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        deps.serverConsole('[dynamic-assets] Asset file missing for', assetId, assetPath, message);
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Asset file is missing from storage');
        return;
      }

      const resolvedName = String(asset.name || asset.fileName || path.basename(assetPath) || 'asset').trim();
      const mimeType = typeof asset.type === 'string' && asset.type.trim().length > 0
        ? asset.type
        : getMimeTypeForAssetName(resolvedName);
      const headers: Record<string, string> = {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable'
      };
      if (typeof asset.size === 'number' && Number.isFinite(asset.size) && asset.size >= 0) {
        headers['Content-Length'] = String(asset.size);
      }

      const stream = fs.createReadStream(assetPath);
      let responseStarted = false;

      stream.on('open', () => {
        responseStarted = true;
        res.writeHead(200, headers);
      });
      stream.on('error', (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        deps.serverConsole('[dynamic-assets] Stream read failed for', assetId, assetPath, message);
        if (!responseStarted) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        }
        res.end('Failed to read asset from storage');
      });

      stream.pipe(res);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      deps.serverConsole('[dynamic-assets] Unexpected route failure for', assetId, message);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Dynamic asset route failed');
    }
  });
}
