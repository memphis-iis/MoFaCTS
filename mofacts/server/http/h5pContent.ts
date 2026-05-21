import { WebApp } from 'meteor/webapp';
import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs/promises';
import path from 'path';
import { getH5PLibraryStorageRoot, resolveStoredH5PStoragePath } from '../lib/h5pPackage';

type UnknownRecord = Record<string, unknown>;

const H5P_ASSET_ROUTE_VERSION = 'embedded-h5p-v2';
const H5P_ASSET_VERSION_PREFIX = '__mofacts-v';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.woff') return 'font/woff';
  if (ext === '.woff2') return 'font/woff2';
  return 'application/octet-stream';
}

function decodeRoutePath(parts: string[]): string {
  return parts.map((part) => decodeURIComponent(part)).join('/');
}

function resolveInside(root: string, routePath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, routePath);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Requested H5P path escapes storage directory');
  }
  return resolved;
}

function stripAssetVersionPrefix(routePath: string): string {
  const parts = routePath.split('/').filter(Boolean);
  if (parts[0] === H5P_ASSET_VERSION_PREFIX && parts.length >= 3) {
    return parts.slice(2).join('/');
  }
  return routePath;
}

function h5pAssetBasePath(content: UnknownRecord, contentId: string): string {
  const packageHash = String(content.packageHash || '').trim();
  const version = packageHash
    ? `${H5P_ASSET_ROUTE_VERSION}-${packageHash.slice(0, 12)}`
    : H5P_ASSET_ROUTE_VERSION;
  return `/h5p-content/${encodeURIComponent(contentId)}/files/${H5P_ASSET_VERSION_PREFIX}/${encodeURIComponent(version)}`;
}

async function sendFile(res: ServerResponse, method: string, filePath: string, cacheControl: string) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('H5P file not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': contentTypeFor(filePath),
    'Cache-Control': cacheControl,
  });
  if (method === 'HEAD') {
    res.end();
    return;
  }
  res.end(await fs.readFile(filePath));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch (_error) {
    return false;
  }
}

async function resolveLibraryFilePath(requestedPath: string): Promise<string> {
  const libraryRoot = getH5PLibraryStorageRoot();
  const directPath = resolveInside(libraryRoot, requestedPath);
  if (await fileExists(directPath)) {
    return directPath;
  }

  const parts = requestedPath.split('/');
  const libraryFolder = parts[0] || '';
  if (!/^[A-Za-z0-9_.]+$/.test(libraryFolder) || parts.length < 2) {
    return directPath;
  }

  const entries = await fs.readdir(libraryRoot, { withFileTypes: true });
  const matchingFolder = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name.startsWith(`${libraryFolder}-`))
    .sort()
    .pop();

  if (!matchingFolder) {
    return directPath;
  }

  return resolveInside(libraryRoot, [matchingFolder, ...parts.slice(1)].join('/'));
}

function parseH5PLibraryReference(value: unknown): UnknownRecord | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const match = value.trim().match(/^([A-Za-z0-9_.]+)\s+(\d+)\.(\d+)$/);
  if (!match) {
    return undefined;
  }
  return {
    machineName: match[1],
    majorVersion: Number(match[2]),
    minorVersion: Number(match[3]),
  };
}

function collectNestedContentLibraries(value: unknown, dependencies: Map<string, UnknownRecord>) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectNestedContentLibraries(item, dependencies);
    }
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  for (const [key, childValue] of Object.entries(value as UnknownRecord)) {
    if (key === 'library') {
      const dependency = parseH5PLibraryReference(childValue);
      if (dependency) {
        const id = `${dependency.machineName}-${dependency.majorVersion}.${dependency.minorVersion}`;
        dependencies.set(id, dependency);
      }
    }
    collectNestedContentLibraries(childValue, dependencies);
  }
}

function mergeH5PDependencies(h5pJson: UnknownRecord, contentParams: UnknownRecord): UnknownRecord {
  const dependencies = new Map<string, UnknownRecord>();
  const nestedDependencies = new Map<string, UnknownRecord>();
  const existingDependencies = Array.isArray(h5pJson.preloadedDependencies)
    ? h5pJson.preloadedDependencies
    : [];

  for (const dependency of existingDependencies) {
    if (!dependency || typeof dependency !== 'object') {
      continue;
    }
    const dep = dependency as UnknownRecord;
    const machineName = String(dep.machineName || '').trim();
    const majorVersion = Number(dep.majorVersion);
    const minorVersion = Number(dep.minorVersion);
    if (!machineName || !Number.isFinite(majorVersion) || !Number.isFinite(minorVersion)) {
      continue;
    }
    dependencies.set(`${machineName}-${majorVersion}.${minorVersion}`, {
      ...dep,
      machineName,
      majorVersion,
      minorVersion,
    });
  }

  collectNestedContentLibraries(contentParams, nestedDependencies);
  for (const [id, dependency] of nestedDependencies) {
    dependencies.set(id, dependency);
  }

  const mainLibrary = String(h5pJson.mainLibrary || '').trim();
  if (mainLibrary) {
    for (const dependency of dependencies.values()) {
      if (dependency.machineName !== mainLibrary) {
        continue;
      }
      const existingPreloads = Array.isArray(dependency.preloadedDependencies)
        ? dependency.preloadedDependencies
        : [];
      const childDependencies = Array.from(nestedDependencies.values())
        .filter((nestedDependency) => nestedDependency.machineName !== mainLibrary);
      if (childDependencies.length) {
        dependency.preloadedDependencies = [
          ...existingPreloads,
          ...childDependencies,
        ];
      }
      break;
    }
  }

  return {
    ...h5pJson,
    preloadedDependencies: Array.from(dependencies.values()),
  };
}

function sanitizeEmbeddedH5PParams(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeEmbeddedH5PParams(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const source = value as UnknownRecord;
  const clone: UnknownRecord = {};
  for (const [key, childValue] of Object.entries(source)) {
    clone[key] = sanitizeEmbeddedH5PParams(childValue);
  }

  const behaviour = clone.behaviour;
  if (behaviour && typeof behaviour === 'object' && !Array.isArray(behaviour)) {
    clone.behaviour = {
      ...(behaviour as UnknownRecord),
      enableFullScreen: false,
    };
  }

  return clone;
}

async function sendH5PJsonWithNestedDependencies(args: {
  res: ServerResponse;
  method: string;
  h5pJsonPath: string;
  contentJsonPath: string;
}) {
  const h5pJson = JSON.parse(await fs.readFile(args.h5pJsonPath, 'utf8')) as UnknownRecord;
  let contentParams: UnknownRecord = {};
  if (await fileExists(args.contentJsonPath)) {
    contentParams = JSON.parse(await fs.readFile(args.contentJsonPath, 'utf8')) as UnknownRecord;
  }
  const body = JSON.stringify(mergeH5PDependencies(h5pJson, contentParams));
  args.res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  if (args.method === 'HEAD') {
    args.res.end();
    return;
  }
  args.res.end(body);
}

async function sendH5PContentJson(args: {
  res: ServerResponse;
  method: string;
  contentJsonPath: string;
}) {
  const contentParams = JSON.parse(await fs.readFile(args.contentJsonPath, 'utf8')) as UnknownRecord;
  const body = JSON.stringify(sanitizeEmbeddedH5PParams(contentParams));
  args.res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  if (args.method === 'HEAD') {
    args.res.end();
    return;
  }
  args.res.end(body);
}

export function renderH5PPlayerHtml(content: UnknownRecord): string {
  const contentId = String(content.contentId || '');
  const library = String(content.library || '');
  const contentParams = sanitizeEmbeddedH5PParams(content.contentParams || {}) as UnknownRecord;
  const assetBasePath = h5pAssetBasePath(content, contentId);
  const payload = {
    contentId,
    library,
    mainLibrary: content.mainLibrary,
    title: content.title,
    params: contentParams,
    paths: {
      content: assetBasePath,
      playerMain: '/h5p-standalone/main.bundle.js',
      frameJs: '/h5p-standalone/frame.bundle.js',
      frameCss: '/h5p-standalone/styles/h5p.css',
    },
  };

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(content.title || 'H5P activity')}</title>
  <link rel="stylesheet" href="/h5p-standalone/styles/h5p.css">
  <style>
    html,body{width:100%;min-height:100%;margin:0;padding:0;background:#fff;color:#1f2933;font-family:system-ui,-apple-system,Segoe UI,sans-serif;overflow:hidden}
    #h5p-container{box-sizing:border-box;width:100%;min-height:120px;padding:16px;overflow:visible}
    #h5p-container .h5p-content{box-sizing:border-box;width:100%!important;max-width:100%!important;overflow:visible}
    #h5p-container iframe{width:100%!important;max-width:100%!important;border:0!important}
    #h5p-error{display:none;margin:16px;padding:12px;border:1px solid #b91c1c;color:#7f1d1d;background:#fef2f2}
  </style>
</head>
<body>
  <div id="h5p-container"></div>
  <div id="h5p-error" role="alert"></div>
  <script src="/h5p-standalone/main.bundle.js" charset="UTF-8"></script>
  <script>
    const data = ${escapeScriptJson(payload)};
    const startedAt = Date.now();
    let lastEventAt = startedAt;
    let batchSequence = 0;

    function renderedContentHeight() {
      const root = document.body || document.documentElement;
      if (!root) {
        return 0;
      }

      const container = document.getElementById('h5p-container');
      const rootRect = root.getBoundingClientRect();
      const containerRect = container ? container.getBoundingClientRect() : rootRect;
      let top = Math.min(0, rootRect.top, containerRect.top);
      let bottom = Math.max(rootRect.bottom, containerRect.bottom);
      const elements = root.querySelectorAll('*');
      for (let i = 0; i < elements.length; i += 1) {
        const element = elements[i];
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') {
          continue;
        }
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 && rect.height <= 0) {
          continue;
        }
        top = Math.min(top, rect.top);
        bottom = Math.max(bottom, rect.bottom);
      }

      return Math.ceil(bottom - top);
    }

    function currentSizePayload(request) {
      const scrollHeight = Math.max(
        document.documentElement ? document.documentElement.scrollHeight : 0,
        document.body ? document.body.scrollHeight : 0,
        document.getElementById('h5p-container')?.scrollHeight || 0,
        renderedContentHeight(),
        120
      );
      const clientHeight = Math.max(
        document.documentElement ? document.documentElement.clientHeight : 0,
        document.body ? document.body.clientHeight : 0,
        120
      );
      return {
        contentId: data.contentId,
        requestId: request && request.requestId,
        measurementWidth: request && request.measurementWidth,
        phase: request && request.phase,
        epoch: request && request.epoch,
        scrollHeight,
        clientHeight,
      };
    }

    function postH5PResizeAction(action, request) {
      parent.postMessage({
        context: 'h5p',
        action,
        ...currentSizePayload(request),
      }, window.location.origin);
    }

    window.addEventListener('message', function (event) {
      if (event.data?.context !== 'h5p') {
        return;
      }
      if (event.data.action === 'ready') {
        postH5PResizeAction('hello');
      } else if (event.data.action === 'resize') {
        postH5PResizeAction('prepareResize', event.data);
      } else if (event.data.action === 'resizePrepared') {
        postH5PResizeAction('resize', event.data);
      }
    });

    if (parent && parent !== window) {
      postH5PResizeAction('hello');
    }

    function announceH5PReadyForMeasurement() {
      postH5PResizeAction('hello');
    }

    function startContentSizeObserver(root) {
      if (!window.ResizeObserver) {
        showError('H5P requires ResizeObserver for content sizing.');
        return;
      }

      let lastSignature = '';
      const observed = new WeakSet();
      function postContentChanged(reason) {
        const payload = currentSizePayload({ reason });
        const signature = [
          payload.scrollHeight,
          payload.clientHeight,
        ].join(':');
        if (signature === lastSignature) {
          return;
        }
        lastSignature = signature;
        parent.postMessage({
          context: 'h5p',
          action: 'contentChanged',
          reason,
          ...payload,
        }, window.location.origin);
      }

      const resizeObserver = new ResizeObserver(function () {
        postContentChanged('content-resize');
      });

      function observeElement(element) {
        if (!observed.has(element)) {
          observed.add(element);
          resizeObserver.observe(element);
        }
      }

      root.querySelectorAll('*').forEach(function (element) {
        observeElement(element);
      });
      observeElement(root);

      const mutationObserver = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          mutation.addedNodes.forEach(function (node) {
            if (node.nodeType !== Node.ELEMENT_NODE) {
              return;
            }
            observeElement(node);
            node.querySelectorAll?.('*').forEach(function (element) {
              observeElement(element);
            });
          });
        });
        postContentChanged('content-mutation');
      });
      mutationObserver.observe(root, { childList: true, subtree: true });
    }

    function textFromHtml(value) {
      const div = document.createElement('div');
      div.innerHTML = String(value || '');
      return div.textContent.trim();
    }

    function stripHtml(value) {
      return textFromHtml(value);
    }

    function splitResponse(value) {
      if (Array.isArray(value)) return value.map(String);
      return String(value || '')
        .split(/\\[,\\]|\\|\\||\\n|\\r|\\t/)
        .map((part) => part.trim())
        .filter(Boolean);
    }

    function scoreFromStatement(statement, event) {
      const result = statement && statement.result ? statement.result : {};
      const score = result.score || {};
      const raw = Number(score.raw ?? event?.getScore?.());
      const max = Number(score.max ?? event?.getMaxScore?.());
      const scaled = Number(score.scaled);
      return {
        score: Number.isFinite(raw) ? raw : undefined,
        maxScore: Number.isFinite(max) ? max : undefined,
        scaledScore: Number.isFinite(scaled) ? scaled : undefined,
        passed: typeof result.success === 'boolean' ? result.success : undefined,
        responseSummary: result.response,
      };
    }

    function answerCorrect(value, accepted) {
      const response = String(value || '').trim().toLowerCase();
      return accepted.some((answer) => String(answer || '').trim().toLowerCase() === response);
    }

    function normalizeMultiChoice(params, statement) {
      const response = String(statement?.result?.response || '').trim();
      const choices = statement?.object?.definition?.choices || [];
      const selectedChoice = choices.find((choice) => choice.id === response);
      const selectedLabel = selectedChoice
        ? Object.values(selectedChoice.description || {})[0]
        : '';
      const answers = Array.isArray(params.answers) ? params.answers : [];
      const byLabel = answers.find((answer) => stripHtml(answer.text) === selectedLabel);
      const byIndex = /^\\d+$/.test(response) ? answers[Number(response)] : null;
      const answer = byLabel || byIndex || {};
      return [{
        partId: 'choice',
        label: stripHtml(answer.text || selectedLabel || response),
        response: selectedLabel || response,
        correct: typeof answer.correct === 'boolean' ? answer.correct : undefined,
      }];
    }

    function normalizeTrueFalse(params, statement) {
      const response = String(statement?.result?.response || '').trim().toLowerCase();
      const value = response === 'true' || response === 't' || response === '1';
      const correctValue = String(params.correct).toLowerCase() === 'true';
      return [{
        partId: 'binary',
        label: value ? 'true' : 'false',
        response: value ? 'true' : 'false',
        correct: value === correctValue,
      }];
    }

    function blankAnswers(markup) {
      const answers = [];
      String(markup || '').replace(/\\*([^*]+)\\*/g, (_, answerText) => {
        answers.push(String(answerText).split('/').map((answer) => answer.trim()).filter(Boolean));
        return '';
      });
      return answers;
    }

    function normalizeBlanks(params, statement) {
      const responses = splitResponse(statement?.result?.response);
      const answers = (Array.isArray(params.questions) ? params.questions : []).flatMap(blankAnswers);
      return answers.map((accepted, index) => {
        const response = responses[index] || '';
        return {
          partId: 'blank-' + index,
          label: accepted[0] || '',
          response,
          correct: answerCorrect(response, accepted),
        };
      });
    }

    function normalizeDragText(params, statement) {
      const responses = splitResponse(statement?.result?.response);
      const answers = [];
      String(params.textField || '').replace(/\\*([^*:]+)(?::[^*]+)?\\*/g, (_, answerText) => {
        answers.push(String(answerText).trim());
        return '';
      });
      return answers.map((answer, index) => {
        const response = responses[index] || '';
        return {
          partId: 'drop-' + index,
          label: answer,
          response,
          correct: String(response).trim().toLowerCase() === String(answer).trim().toLowerCase(),
        };
      });
    }

    function parseDragPairs(response) {
      return splitResponse(response).map((entry) => {
        const numbers = String(entry).match(/\\d+/g) || [];
        return numbers.length >= 2 ? { elementIndex: Number(numbers[0]), zoneIndex: Number(numbers[1]) } : null;
      }).filter(Boolean);
    }

    function normalizeDragQuestion(params, statement) {
      const task = params.question?.task || {};
      const elements = Array.isArray(task.elements) ? task.elements : [];
      const zones = Array.isArray(task.dropZones) ? task.dropZones : [];
      const pairs = parseDragPairs(statement?.result?.response);
      const pairByElement = new Map(pairs.map((pair) => [pair.elementIndex, pair]));
      return elements.map((element, index) => {
        const pair = pairByElement.get(index) || { elementIndex: index, zoneIndex: -1 };
        const zone = zones[pair.zoneIndex] || {};
        return {
          partId: element.type?.subContentId || String(index),
          label: stripHtml(element.type?.params?.text || 'Item ' + (index + 1)),
          targetId: pair.zoneIndex >= 0 ? String(pair.zoneIndex) : '',
          targetLabel: stripHtml(zone.label || ''),
          response: stripHtml(zone.label || ''),
          correct: Array.isArray(zone.correctElements) ? zone.correctElements.includes(String(index)) : undefined,
        };
      });
    }

    function normalizeEvents(statement) {
      const params = data.params || {};
      if (data.mainLibrary === 'H5P.MultiChoice') return normalizeMultiChoice(params, statement);
      if (data.mainLibrary === 'H5P.Blanks') return normalizeBlanks(params, statement);
      if (data.mainLibrary === 'H5P.TrueFalse') return normalizeTrueFalse(params, statement);
      if (data.mainLibrary === 'H5P.DragText') return normalizeDragText(params, statement);
      if (data.mainLibrary === 'H5P.DragQuestion') return normalizeDragQuestion(params, statement);
      return [];
    }

    function emitNormalizedResult(statement, event) {
      const score = scoreFromStatement(statement, event);
      const now = Date.now();
      const events = normalizeEvents(statement).map((item, index) => {
        const latencyMs = index === 0 ? now - lastEventAt : 0;
        return { ...item, eventIndex: index, timestamp: now, latencyMs };
      });
      lastEventAt = now;
      const maxScore = score.maxScore ?? events.length;
      const earned = typeof score.score === 'number'
        ? score.score
        : events.filter((item) => item.correct === true).length;
      const batch = {
        type: 'mofacts:h5p-result',
        batchId: data.contentId + '-' + now + '-' + (batchSequence++),
        contentId: data.contentId,
        library: data.library,
        widgetType: data.mainLibrary,
        completed: true,
        passed: typeof score.passed === 'boolean' ? score.passed : earned >= maxScore,
        score: earned,
        maxScore,
        scaledScore: score.scaledScore ?? (maxScore ? earned / maxScore : 0),
        responseSummary: score.responseSummary,
        events,
      };
      parent.postMessage(batch, window.location.origin);
    }

    function statementFromEvent(event) {
      const candidate = event?.data?.statement || event?.statement || event?.data || {};
      return candidate && typeof candidate === 'object' ? candidate : {};
    }

    function shouldNormalize(statement) {
      const verb = String(statement?.verb?.id || '').toLowerCase();
      return verb.includes('/answered') || verb.includes('/completed') || verb.includes('/passed');
    }

    function showError(message) {
      const target = document.getElementById('h5p-error');
      target.textContent = message;
      target.style.display = 'block';
      parent.postMessage({
        type: 'mofacts:h5p-failed',
        contentId: data.contentId,
        message,
      }, window.location.origin);
    }

    document.addEventListener('DOMContentLoaded', function () {
      const el = document.getElementById('h5p-container');
      const options = {
        id: data.contentId,
        h5pJsonPath: data.paths.content,
        librariesPath: data.paths.content,
        contentJsonPath: data.paths.content + '/content',
        frameJs: data.paths.frameJs,
        frameCss: data.paths.frameCss,
        frame: false,
        copyright: false,
        export: false,
        embed: false,
        embedType: 'div',
        fullScreen: false,
        reportingIsEnabled: true,
        xAPIObjectIRI: window.location.origin + '/h5p-content/' + encodeURIComponent(data.contentId),
      };
      new H5PStandalone.H5P(el, options).then(function () {
        parent.postMessage({ type: 'mofacts:h5p-loaded', contentId: data.contentId }, window.location.origin);
        startContentSizeObserver(el);
        announceH5PReadyForMeasurement();
        if (!window.H5P || !H5P.externalDispatcher) {
          showError('H5P runtime loaded without an xAPI dispatcher.');
          return;
        }
        H5P.externalDispatcher.on('xAPI', function (event) {
          const statement = statementFromEvent(event);
          parent.postMessage({
            type: 'mofacts:h5p-xapi',
            contentId: data.contentId,
            library: data.library,
            statement,
          }, window.location.origin);
          if (shouldNormalize(statement)) {
            emitNormalizedResult(statement, event);
          }
        });
      }).catch(function (error) {
        showError(error && error.message ? error.message : 'H5P runtime failed to load.');
      });
    });
  </script>
</body>
</html>`;
}

WebApp.connectHandlers.use('/h5p-content', async (req: IncomingMessage, res: ServerResponse, _next: () => void) => {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method not allowed');
    return;
  }

  try {
    const parts = String(req.url || '').split('?')[0]?.split('/').filter(Boolean) || [];
    const contentId = decodeURIComponent(parts[0] || '');
    const action = parts[1] || '';
    if (!contentId || (action !== 'play' && action !== 'files')) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('H5P content not found');
      return;
    }

    const content = await H5PContents.findOneAsync({ contentId });
    if (!content) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('H5P content not found');
      return;
    }

    if (action === 'play') {
      const body = renderH5PPlayerHtml(content);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      if (method === 'HEAD') {
        res.end();
        return;
      }
      res.end(body);
      return;
    }

    let storagePath = '';
    try {
      storagePath = resolveStoredH5PStoragePath(String(content.storagePath || ''));
    } catch (_error) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('H5P content storage path is missing');
      return;
    }
    const routePath = stripAssetVersionPrefix(decodeRoutePath(parts.slice(2)));
    const requestedPath = routePath || 'h5p.json';
    const contentFilePath = resolveInside(storagePath, requestedPath);
    if (await fileExists(contentFilePath)) {
      if (requestedPath === 'h5p.json') {
        await sendH5PJsonWithNestedDependencies({
          res,
          method,
          h5pJsonPath: contentFilePath,
          contentJsonPath: resolveInside(storagePath, 'content/content.json'),
        });
        return;
      }
      if (requestedPath === 'content/content.json') {
        await sendH5PContentJson({
          res,
          method,
          contentJsonPath: contentFilePath,
        });
        return;
      }
      await sendFile(res, method, contentFilePath, 'public, max-age=31536000, immutable');
      return;
    }

    const libraryFilePath = await resolveLibraryFilePath(requestedPath);
    await sendFile(res, method, libraryFilePath, 'public, max-age=31536000, immutable');
  } catch (_error) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('H5P file not found');
  }
});
