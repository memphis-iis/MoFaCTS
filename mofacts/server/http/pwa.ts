import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { themeRegistry } from '../lib/themeRegistry';

type ThemeLike = {
  activeThemeId?: string;
  themeName?: string;
  metadata?: {
    updatedAt?: string;
  };
  properties?: Record<string, unknown>;
};

const PWA_ICON_ROUTE_PREFIX = '/theme-install-icon/';
const APPLE_TOUCH_ICON_ROUTE = '/apple-touch-icon.png';
const APPLE_TOUCH_ICON_PRECOMPOSED_ROUTE = '/apple-touch-icon-precomposed.png';
const DEFAULT_BACKGROUND_COLOR = '#F2F2F2';

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getSystemName() {
  const configuredName = Meteor.settings.public?.systemName;
  if (typeof configuredName === 'string' && configuredName.trim()) {
    return configuredName.trim();
  }
  return 'MoFaCTS';
}

function getThemeColors(theme: ThemeLike) {
  const properties = theme.properties || {};
  const backgroundColor =
    asNonEmptyString(properties.background_color) ||
    asNonEmptyString(properties.neutral_color) ||
    DEFAULT_BACKGROUND_COLOR;
  const themeColor =
    asNonEmptyString(properties.accent_color) ||
    asNonEmptyString(properties.background_color) ||
    DEFAULT_BACKGROUND_COLOR;

  return { backgroundColor, themeColor };
}

function buildThemeVersion(theme: ThemeLike) {
  const properties = theme.properties || {};
  return createHash('sha1')
    .update(JSON.stringify({
      activeThemeId: theme.activeThemeId || null,
      themeName: theme.themeName || null,
      updatedAt: theme.metadata?.updatedAt || null,
      logoUrl: properties.logo_url || null,
      favicon16Url: properties.favicon_16_url || null,
      favicon32Url: properties.favicon_32_url || null,
      appleTouchIconUrl: properties.apple_touch_icon_url || null,
      androidIcon192Url: properties.android_icon_192_url || null,
      androidIcon512Url: properties.android_icon_512_url || null,
      androidMaskableIcon192Url: properties.android_maskable_icon_192_url || null,
      androidMaskableIcon512Url: properties.android_maskable_icon_512_url || null,
      backgroundColor: properties.background_color || null,
      accentColor: properties.accent_color || null
    }))
    .digest('hex')
    .slice(0, 12);
}

function buildManifestPayload(theme: ThemeLike) {
  const properties = theme.properties || {};
  const appName = getSystemName();
  const shortName = appName.length > 24 ? appName.slice(0, 24) : appName;
  const description =
    asNonEmptyString(properties.signInDescription) ||
    'A web-based adaptive learning system that supports adaptive practice and learning.';
  const { backgroundColor, themeColor } = getThemeColors(theme);
  const version = buildThemeVersion(theme);

  return {
    id: '/',
    name: appName,
    short_name: shortName,
    description,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: backgroundColor,
    theme_color: themeColor,
    icons: [
      {
        src: `${PWA_ICON_ROUTE_PREFIX}192.png?v=${version}`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: `${PWA_ICON_ROUTE_PREFIX}512.png?v=${version}`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: `${PWA_ICON_ROUTE_PREFIX}maskable-192.png?v=${version}`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable'
      },
      {
        src: `${PWA_ICON_ROUTE_PREFIX}maskable-512.png?v=${version}`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }
    ]
  };
}

function resolveIconPropertyName(pathname: string) {
  switch (pathname) {
    case APPLE_TOUCH_ICON_ROUTE:
    case APPLE_TOUCH_ICON_PRECOMPOSED_ROUTE:
      return 'apple_touch_icon_url';
  }

  switch (pathname) {
    case `${PWA_ICON_ROUTE_PREFIX}192.png`:
      return 'android_icon_192_url';
    case `${PWA_ICON_ROUTE_PREFIX}512.png`:
      return 'android_icon_512_url';
    case `${PWA_ICON_ROUTE_PREFIX}maskable-192.png`:
      return 'android_maskable_icon_192_url';
    case `${PWA_ICON_ROUTE_PREFIX}maskable-512.png`:
      return 'android_maskable_icon_512_url';
    default:
      return null;
  }
}

function inferContentTypeFromPath(assetPath: string) {
  const extension = path.extname(assetPath).toLowerCase();
  switch (extension) {
    case '.png':
      return 'image/png';
    case '.svg':
      return 'image/svg+xml';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

async function findExistingAssetPath(relativePath: string) {
  const candidateRoots = [
    path.resolve(process.cwd(), 'public'),
    path.resolve(process.cwd(), 'app', 'public'),
    path.resolve(process.cwd(), '..', 'public'),
    path.resolve(process.cwd(), '..', 'app'),
    '/opt/bundle/bundle/programs/web.browser/app',
    '/opt/bundle/bundle/programs/web.browser.legacy/app',
    '/opt/bundle/bundle/programs/web.cordova/app'
  ];

  for (const root of candidateRoots) {
    const resolvedPath = path.resolve(root, relativePath);
    const normalizedRoot = path.resolve(root);
    if (!resolvedPath.startsWith(normalizedRoot)) {
      continue;
    }
    try {
      await fs.access(resolvedPath);
      return resolvedPath;
    } catch (_error) {
      // Try the next candidate root.
    }
  }

  return null;
}

async function readThemeAssetFromUrl(assetUrl: string) {
  const parsedUrl = new URL(assetUrl, 'http://localhost');
  if (parsedUrl.origin !== 'http://localhost') {
    return null;
  }

  const pathname = decodeURIComponent(parsedUrl.pathname);
  const relativePath = pathname.replace(/^\/+/, '');
  if (!relativePath || relativePath.includes('..')) {
    return null;
  }

  const resolvedPath = await findExistingAssetPath(relativePath);
  if (!resolvedPath) {
    return null;
  }
  const content = await fs.readFile(resolvedPath);
  return {
    content,
    contentType: inferContentTypeFromPath(resolvedPath)
  };
}

async function resolveThemeIconContent(theme: ThemeLike, propertyName: string) {
  const properties = theme.properties || {};
  const propertyValue = asNonEmptyString(properties[propertyName]);
  if (!propertyValue) {
    return null;
  }

  const dataUrlMatch = propertyValue.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (dataUrlMatch) {
    const contentType = dataUrlMatch[1] || 'application/octet-stream';
    const base64Payload = dataUrlMatch[2];
    if (!base64Payload) {
      return null;
    }
    return {
      content: Buffer.from(base64Payload, 'base64'),
      contentType
    };
  }

  return await readThemeAssetFromUrl(propertyValue);
}

WebApp.connectHandlers.use(async function(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    next();
    return;
  }

  const requestUrl = req.url || '/';
  const parsedUrl = new URL(requestUrl, 'http://localhost');
  const pathname = parsedUrl.pathname;

  if (
    pathname !== '/site.webmanifest' &&
    pathname !== '/manifest.json' &&
    pathname !== APPLE_TOUCH_ICON_ROUTE &&
    pathname !== APPLE_TOUCH_ICON_PRECOMPOSED_ROUTE &&
    !pathname.startsWith(PWA_ICON_ROUTE_PREFIX)
  ) {
    next();
    return;
  }

  try {
    const theme = (await themeRegistry.ensureActiveTheme()) as ThemeLike;

    if (pathname === '/site.webmanifest' || pathname === '/manifest.json') {
      const payload = buildManifestPayload(theme);
      const body = JSON.stringify(payload);
      res.writeHead(200, {
        'Content-Type': 'application/manifest+json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      if (method === 'HEAD') {
        res.end();
        return;
      }
      res.end(body);
      return;
    }

    const propertyName = resolveIconPropertyName(pathname);
    if (!propertyName) {
      res.writeHead(404, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }

    const resolvedIcon = await resolveThemeIconContent(theme, propertyName);
    if (!resolvedIcon) {
      res.writeHead(404, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }

    res.writeHead(200, {
      'Content-Type': resolvedIcon.contentType,
      'Cache-Control': 'public, max-age=0, must-revalidate'
    });
    if (method === 'HEAD') {
      res.end();
      return;
    }
    res.end(resolvedIcon.content);
  } catch (_error) {
    console.error('[PWA] Failed to serve manifest/icon route', {
      url: req.url || '',
      error: _error instanceof Error ? _error.message : String(_error)
    });
    res.writeHead(500, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end('Internal Server Error');
  }
});
