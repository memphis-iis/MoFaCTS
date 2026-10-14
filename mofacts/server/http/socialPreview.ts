import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { themeRegistry } from '../lib/themeRegistry';
import { ensurePublishedDeploymentBrandProfile } from '../lib/deploymentBrandProfileRegistry';
import { deploymentBrandSocialImageUrl } from '../../common/deploymentBrandProfile';
import type { NextFunction } from 'connect';
import type { IncomingMessage, ServerResponse } from 'http';

type SocialPreviewSettings = {
  title?: unknown;
  type?: unknown;
  url?: unknown;
  description?: unknown;
  twitterDescription?: unknown;
  image?: unknown;
  imageType?: unknown;
  imageWidth?: unknown;
  imageHeight?: unknown;
  imageAlt?: unknown;
  noindex?: unknown;
};

type ThemeLike = {
  properties?: Record<string, unknown>;
};

const SOCIAL_CRAWLER_PATTERN = /\b(facebookexternalhit|facebot|linkedinbot|twitterbot|slackbot|discordbot|whatsapp|telegrambot|pinterest|skypeuripreview|microsoftpreview)\b/i;
const SOCIAL_PREVIEW_IMAGE_VERSION = '2026-10-13-1';
const execFileAsync = promisify(execFile);
let cachedPreviewPng: { key: string; png: Buffer; expiresAt: number } | null = null;

const WebAppAny = WebApp as unknown as {
  handlers: {
    use: (handler: (req: IncomingMessage, res: ServerResponse, next: NextFunction) => void) => void;
  };
};

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function absoluteUrl(pathOrUrl: string, rootUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  const root = rootUrl.replace(/\/+$/, '');
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${root}${path}`;
}

function withQueryParam(url: string, key: string, value: string) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function isHexColor(value: string | null): value is string {
  return !!value && /^#[0-9a-f]{6}$/i.test(value);
}

function safeColor(value: unknown, fallback: string): string {
  const candidate = firstNonEmptyString(value);
  return isHexColor(candidate) ? candidate : fallback;
}

function safeFontFamily(value: unknown) {
  return firstNonEmptyString(value) || 'Arial, sans-serif';
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function metaProperty(property: string, content: string | null) {
  return content ? `<meta property="${property}" content="${escapeHtml(content)}">` : '';
}

function metaName(name: string, content: string | null) {
  return content ? `<meta name="${name}" content="${escapeHtml(content)}">` : '';
}

async function getActiveTheme() {
  try {
    return (await themeRegistry.ensureActiveTheme()) as ThemeLike;
  } catch {
    return null;
  }
}

function findPublicAsset(assetPath: string) {
  const relativeAssetPath = assetPath.replace(/^\/+/, '');
  const roots = [
    path.join(process.cwd(), 'public'),
    path.join(process.cwd(), '..', 'public'),
    path.join(process.cwd(), '..', 'app', 'public'),
    path.join(process.cwd(), '..', 'web.browser', 'app'),
    path.join(process.cwd(), '..', '..', 'web.browser', 'app'),
    '/opt/bundle/bundle/programs/web.browser/app',
    '/opt/bundle/bundle/programs/web.browser.legacy/app',
  ];

  for (const root of roots) {
    const absolutePath = path.resolve(root, relativeAssetPath);
    const normalizedRoot = path.resolve(root);
    if (!absolutePath.startsWith(normalizedRoot)) {
      continue;
    }
    if (fs.existsSync(absolutePath)) {
      return absolutePath;
    }
  }
  return null;
}

function imageHrefForSvg(imageUrl: string | null, rootUrl: string) {
  if (!imageUrl) {
    return null;
  }
  if (imageUrl.startsWith('data:image/')) {
    return imageUrl;
  }
  if (imageUrl.startsWith('/')) {
    const localPath = findPublicAsset(imageUrl);
    if (localPath) {
      return process.platform === 'win32'
        ? `file:///${localPath.replace(/\\/g, '/')}`
        : `file://${localPath}`;
    }
  }
  return absoluteUrl(imageUrl, rootUrl);
}

function resolveThemeLogoPath(imageUrl: string | null) {
  if (!imageUrl) {
    throw new Error('Social preview requires Brand Profile identity.logoUrl.');
  }
  if (imageUrl.startsWith('/')) {
    const localPath = findPublicAsset(imageUrl);
    if (!localPath) {
      throw new Error(`Social preview Brand Profile logo was not found in bundled public assets: ${imageUrl}`);
    }
    return localPath;
  }
  if (imageUrl.startsWith('data:image/')) {
    return imageUrl;
  }
  throw new Error(`Social preview Brand Profile logo must be a local public asset or data image, got: ${imageUrl}`);
}

async function getSocialPreviewSettings() {
  const rootUrl = firstNonEmptyString(Meteor.settings.ROOT_URL, process.env.ROOT_URL, Meteor.absoluteUrl()) || 'http://localhost:3200';
  const root = rootUrl.replace(/\/+$/, '');
  const configured = ((Meteor.settings.public || {}) as { socialPreview?: SocialPreviewSettings }).socialPreview || {};
  const theme = await getActiveTheme();
  const themeProperties = theme?.properties || {};
  const brandProfile = await ensurePublishedDeploymentBrandProfile();
  const localized = brandProfile.locales[brandProfile.defaultLocale];
  const systemName = brandProfile.identity.name;
  const themeLogoUrl = firstNonEmptyString(brandProfile.identity.logoUrl);

  const title = localized.socialTitle;
  const description = localized.socialDescription;
  const imageUrl = absoluteUrl(deploymentBrandSocialImageUrl(brandProfile), root);
  const versionedImageUrl = imageUrl.includes('/social-preview')
    ? withQueryParam(imageUrl, 'v', SOCIAL_PREVIEW_IMAGE_VERSION)
    : imageUrl;

  return {
    title,
    heroTitle: localized.heroTitle,
    eyebrow: localized.eyebrow,
    description,
    twitterDescription: description,
    type: firstNonEmptyString(configured.type) || 'website',
    url: absoluteUrl(firstNonEmptyString(configured.url) || '/', root),
    image: versionedImageUrl,
    imageType: firstNonEmptyString(configured.imageType) || 'image/png',
    imageWidth: firstNonEmptyString(configured.imageWidth) || '1200',
    imageHeight: firstNonEmptyString(configured.imageHeight) || '630',
    imageAlt: localized.socialImageAlt,
    noindex: configured.noindex === true,
    rootUrl: root,
    theme: {
      logoHref: imageHrefForSvg(themeLogoUrl, root),
      backgroundColor: safeColor(themeProperties.app_background_color, '#F2F2F2'),
      cardColor: safeColor(themeProperties.learning_card_surface_color, '#FFFFFF'),
      accentColor: safeColor(themeProperties.app_accent_color, '#7ed957'),
      secondaryColor: safeColor(themeProperties.app_accent_color, '#7ed957'),
      textColor: safeColor(themeProperties.app_text_color, '#111827'),
      fontFamily: safeFontFamily(themeProperties.app_font_family),
      brandLabel: systemName,
    },
  };
}

function isSocialCrawler(req: IncomingMessage) {
  return SOCIAL_CRAWLER_PATTERN.test(String(req.headers['user-agent'] || ''));
}

function isShareablePageRequest(req: IncomingMessage) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return false;
  }
  const path = String(req.url || '/').split('?')[0] || '/';
  return path === '/' || path.startsWith('/experiment/');
}

async function buildSocialPreviewHtml() {
  const preview = await getSocialPreviewSettings();
  const imageTags = preview.image
    ? [
        metaProperty('og:image', preview.image),
        metaProperty('og:image:secure_url', preview.image),
        metaProperty('og:image:type', preview.imageType),
        metaProperty('og:image:width', preview.imageWidth),
        metaProperty('og:image:height', preview.imageHeight),
        metaProperty('og:image:alt', preview.imageAlt),
        metaName('twitter:image', preview.image),
      ]
    : [];

  const tags = [
    '<meta charset="utf-8">',
    `<title>${escapeHtml(preview.title)}</title>`,
    metaProperty('og:title', preview.title),
    metaProperty('og:type', preview.type),
    metaProperty('og:url', preview.url),
    metaProperty('og:description', preview.description),
    ...imageTags,
    metaName('twitter:card', preview.image ? 'summary_large_image' : 'summary'),
    metaName('twitter:title', preview.title),
    metaName('twitter:description', preview.twitterDescription),
    preview.noindex ? '<meta name="robots" content="noindex,nofollow">' : '',
    `<link rel="canonical" href="${escapeHtml(preview.url)}">`,
  ].filter(Boolean);

  return `<!doctype html><html><head>${tags.join('')}</head><body></body></html>`;
}

function wrapText(value: string, maxCharsPerLine: number, maxLines: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
    }
    current = word;
    if (lines.length === maxLines) {
      break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    const finalIndex = maxLines - 1;
    const finalLine = lines[finalIndex] || '';
    lines[finalIndex] = `${finalLine.replace(/[.,;:!?]?$/, '')}...`;
  }
  return lines;
}

function previewImageTitle(preview: Awaited<ReturnType<typeof getSocialPreviewSettings>>) {
  return firstNonEmptyString(preview.theme.brandLabel, preview.title.split('|')[0]) || '';
}

function imageMagickCommand() {
  return process.platform === 'win32' ? 'magick' : 'convert';
}

async function execImageMagick(args: string[]) {
  try {
    await execFileAsync(imageMagickCommand(), args);
  } catch (error: any) {
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : '';
    const stdout = typeof error?.stdout === 'string' ? error.stdout.trim() : '';
    const details = [stderr, stdout].filter(Boolean).join('\n');
    throw new Error(`Social preview ImageMagick command failed: ${details || error?.message || String(error)}`);
  }
}

function writeDataImage(dataImage: string, outputPath: string) {
  const match = dataImage.match(/^data:image\/([a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) {
    throw new Error('Social preview data image logo must be base64 encoded.');
  }
  const matchedExtension = match[1] || '';
  const matchedData = match[2] || '';
  const extension = matchedExtension.toLowerCase() === 'jpeg' ? 'jpg' : matchedExtension.toLowerCase();
  const logoPath = `${outputPath}.${extension}`;
  fs.writeFileSync(logoPath, Buffer.from(matchedData, 'base64'));
  return logoPath;
}

function fontPath(fileName: string) {
  const candidates = [
    `/usr/share/fonts/dejavu/${fileName}`,
    `C:/Windows/Fonts/${fileName.replace('Sans', 'Sans.ttf')}`,
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return fileName.includes('Bold') ? 'DejaVu-Sans-Bold' : 'DejaVu-Sans';
}

function fontFamilyCandidates(fontFamily: string) {
  return fontFamily
    .split(',')
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
    .filter((part) => part && !['system-ui', '-apple-system', 'sans-serif', 'serif', 'monospace'].includes(part.toLowerCase()));
}

function resolveThemeFont(themeFontFamily: string, weight: 'regular' | 'bold') {
  const names = fontFamilyCandidates(themeFontFamily);
  for (const name of names) {
    const normalized = name.replace(/\s+/g, '');
    const candidates = weight === 'bold'
      ? [
          `C:/Windows/Fonts/${normalized}bd.ttf`,
          `/usr/share/fonts/${normalized}-Bold.ttf`,
          `/usr/share/fonts/${normalized}/${normalized}-Bold.ttf`,
          `/usr/share/fonts/truetype/${normalized}-Bold.ttf`,
          `/usr/share/fonts/truetype/${normalized}/${normalized}-Bold.ttf`,
        ]
      : [
          `C:/Windows/Fonts/${normalized}.ttf`,
          `/usr/share/fonts/${normalized}.ttf`,
          `/usr/share/fonts/${normalized}/${normalized}.ttf`,
          `/usr/share/fonts/truetype/${normalized}.ttf`,
          `/usr/share/fonts/truetype/${normalized}/${normalized}.ttf`,
        ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return fontPath(weight === 'bold' ? 'DejaVuSans-Bold.ttf' : 'DejaVuSans.ttf');
}

async function renderSocialPreviewPng() {
  const preview = await getSocialPreviewSettings();
  const cacheKey = JSON.stringify(preview);
  const now = Date.now();
  if (cachedPreviewPng && cachedPreviewPng.key === cacheKey && cachedPreviewPng.expiresAt > now) {
    return cachedPreviewPng.png;
  }

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mofacts-social-preview-'));
  const basePath = path.join(tempDir, 'base.png');
  const logoResizedPath = path.join(tempDir, 'logo.png');
  const pngPath = path.join(tempDir, 'preview.png');
  const rawLogoSource = firstNonEmptyString((await ensurePublishedDeploymentBrandProfile()).identity.logoUrl);
  const logoSource = resolveThemeLogoPath(rawLogoSource);
  const logoPath = logoSource.startsWith('data:image/')
    ? writeDataImage(logoSource, path.join(tempDir, 'logo-source'))
    : logoSource;
  const titleLine = previewImageTitle(preview);
  const heroLines = wrapText(preview.heroTitle, 17, 3);
  const subtitleLines = wrapText(preview.description, 43, 3);
  const fontRegular = resolveThemeFont(preview.theme.fontFamily, 'regular');
  const fontBold = resolveThemeFont(preview.theme.fontFamily, 'bold');
  try {
    await execImageMagick([
      '-size', '1200x630',
      `xc:${preview.theme.backgroundColor}`,
      // Match the public landing hero: readable copy beside practice/progress cards.
      '-fill', 'none',
      '-stroke', preview.theme.accentColor,
      '-strokewidth', '2',
      '-draw', 'ellipse 884,340 258,164 0,360',
      '-draw', 'ellipse 884,340 180,225 0,360',
      '-stroke', 'none',
      '-fill', preview.theme.cardColor,
      '-draw', 'roundrectangle 690,170 1030,345 22,22',
      '-draw', 'roundrectangle 814,326 1144,512 22,22',
      '-fill', preview.theme.accentColor,
      '-draw', 'roundrectangle 50,40 104,94 12,12',
      // Two curved arrows, matching the landing page's practice icon.
      '-draw', "path 'M 800,254 C 807,208 859,190 895,219 L 912,200 L 912,250 L 864,250 L 880,234 C 857,216 826,227 821,254 Z'",
      '-draw', "path 'M 912,266 C 905,312 853,330 817,301 L 800,320 L 800,270 L 848,270 L 832,286 C 855,304 886,293 891,266 Z'",
      // The second card uses the landing page's simple progress chart.
      '-draw', 'rectangle 878,371 886,463',
      '-draw', 'rectangle 878,455 1080,463',
      '-draw', 'rectangle 908,418 934,443',
      '-draw', 'rectangle 950,391 976,443',
      '-draw', 'rectangle 992,404 1018,443',
      '-draw', 'rectangle 1034,367 1060,443',
      '-gravity', 'NorthWest',
      '-font', fontBold,
      '-pointsize', '34',
      '-fill', preview.theme.textColor,
      '-annotate', '+118+48', titleLine,
      '-pointsize', '22',
      '-annotate', '+56+133', preview.eyebrow,
      '-pointsize', '64',
      '-annotate', '+56+181', heroLines[0] || '',
      '-annotate', '+56+257', heroLines[1] || '',
      '-annotate', '+56+333', heroLines[2] || '',
      '-font', fontRegular,
      '-pointsize', '26',
      '-annotate', '+56+432', subtitleLines[0] || '',
      '-annotate', '+56+468', subtitleLines[1] || '',
      '-annotate', '+56+504', subtitleLines[2] || '',
      '-pointsize', '22',
      '-annotate', '+56+573', preview.rootUrl.replace(/^https?:\/\//, ''),
      basePath,
    ]);
    await execImageMagick([logoPath, '-resize', '42x42', logoResizedPath]);
    await execImageMagick([basePath, logoResizedPath, '-geometry', '+56+46', '-composite', pngPath]);
  } finally {
    // Cleanup happens after the generated PNG is read below.
  }
  if (!fs.existsSync(pngPath)) {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
    throw new Error('Social preview render completed without producing preview.png.');
  }
  const png = await fs.promises.readFile(pngPath);
  await fs.promises.rm(tempDir, { recursive: true, force: true });
  cachedPreviewPng = { key: cacheKey, png, expiresAt: now + 5 * 60 * 1000 };
  return png;
}

async function handleSocialPreviewRequest(req: IncomingMessage, res: ServerResponse, next: NextFunction) {
  const pathName = String(req.url || '/').split('?')[0] || '/';
  if ((req.method === 'GET' || req.method === 'HEAD') && (pathName === '/social-preview.png' || pathName === '/social-preview-staging.png')) {
    try {
      const png = await renderSocialPreviewPng();
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': String(png.length),
        'Cache-Control': 'public, max-age=300',
      });
      res.end(req.method === 'HEAD' ? undefined : png);
    } catch (error) {
      console.error('[social-preview] Failed to render themed preview image.', error);
      next(error);
    }
    return;
  }

  if (!isSocialCrawler(req) || !isShareablePageRequest(req)) {
    next();
    return;
  }

  const html = await buildSocialPreviewHtml();
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(html);
}

WebAppAny.handlers.use((req: IncomingMessage, res: ServerResponse, next: NextFunction) => {
  void handleSocialPreviewRequest(req, res, next);
});
