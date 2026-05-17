import { WebApp } from 'meteor/webapp';
import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs/promises';
import path from 'path';
import { getH5PLibraryStorageRoot } from '../lib/h5pPackage';

type UnknownRecord = Record<string, unknown>;

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

export function renderH5PPlayerHtml(content: UnknownRecord): string {
  const contentId = String(content.contentId || '');
  const library = String(content.library || '');
  const payload = {
    contentId,
    library,
    mainLibrary: content.mainLibrary,
    title: content.title,
    params: content.contentParams || {},
    paths: {
      content: `/h5p-content/${encodeURIComponent(contentId)}/files`,
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
    html,body{width:100%;height:100%;margin:0;padding:0;background:#fff;color:#1f2933;font-family:system-ui,-apple-system,Segoe UI,sans-serif;overflow:hidden}
    #h5p-container{box-sizing:border-box;width:100%;height:100vh;padding:16px;overflow:hidden}
    #h5p-container .h5p-iframe,
    #h5p-container .h5p-content,
    #h5p-container .h5p-container{box-sizing:border-box;width:100%!important;max-width:100%!important;height:100%!important;max-height:100%!important;overflow:hidden!important}
    #h5p-container iframe{width:100%!important;max-width:100%!important;height:100%!important;border:0!important;overflow:hidden!important}
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
    let sizePollCount = 0;

    function postSize() {
      const height = Math.min(window.innerHeight || 900, Math.max(
        document.documentElement ? document.documentElement.scrollHeight : 0,
        document.body ? document.body.scrollHeight : 0,
        document.getElementById('h5p-container')?.scrollHeight || 0,
        120
      ));
      parent.postMessage({
        type: 'mofacts:h5p-resize',
        contentId: data.contentId,
        height,
      }, window.location.origin);
    }

    function startSizeReporting() {
      postSize();
      if (window.ResizeObserver) {
        const observer = new ResizeObserver(postSize);
        observer.observe(document.documentElement);
        observer.observe(document.body);
        const container = document.getElementById('h5p-container');
        if (container) observer.observe(container);
      }
      const intervalId = setInterval(function () {
        postSize();
        sizePollCount += 1;
        if (sizePollCount > 20) {
          clearInterval(intervalId);
        }
      }, 500);
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
        fullScreen: true,
        reportingIsEnabled: true,
        xAPIObjectIRI: window.location.origin + '/h5p-content/' + encodeURIComponent(data.contentId),
      };
      new H5PStandalone.H5P(el, options).then(function () {
        parent.postMessage({ type: 'mofacts:h5p-loaded', contentId: data.contentId }, window.location.origin);
        startSizeReporting();
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

    const storagePath = String(content.storagePath || '');
    if (!storagePath) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('H5P content storage path is missing');
      return;
    }
    const routePath = decodeRoutePath(parts.slice(2));
    const requestedPath = routePath || 'h5p.json';
    const contentFilePath = resolveInside(storagePath, requestedPath);
    if (await fileExists(contentFilePath)) {
      await sendFile(res, method, contentFilePath, 'public, max-age=31536000, immutable');
      return;
    }

    const libraryFilePath = resolveInside(getH5PLibraryStorageRoot(), requestedPath);
    await sendFile(res, method, libraryFilePath, 'public, max-age=31536000, immutable');
  } catch (_error) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('H5P file not found');
  }
});
