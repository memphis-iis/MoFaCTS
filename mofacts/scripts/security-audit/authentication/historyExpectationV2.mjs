import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import Module from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { sourceCommit } from '../../../common/securityAudit/proofFields.ts';
import { fixtureNamespaceV2 } from './stagingFixturesV2.mjs';

const invalid = () => { throw new Error('Synthetic history expectation is unavailable'); };

// Verification only: compile the actual reviewed committed formatter/HTTP owner
// in memory using the existing TypeScript compiler. No source is rewritten, no
// emitted twins are saved, and no unchecked download supplies its own baseline.
export async function renderFixtureHistoryExpectationV2({ repository, sourceRevision, namespace, userId, history }) {
  const revision = sourceCommit(sourceRevision); fixtureNamespaceV2(namespace);
  if (typeof repository !== 'string' || !path.isAbsolute(repository) || !userId
    || history?._id !== `${namespace}-history-learnerA` || history.userId !== userId
    || history.anonStudentId !== `${namespace}-learnerA` || history.TDFId !== `${namespace}-lesson`) invalid();
  const cache = new Map();
  function load(file) {
    if (!/^(?:mofacts\/(?:common|server\/lib)\/|mofacts\/server\/orm\.ts$|learning-components\/runtime\/)/.test(file)
      || file.includes('..') || !file.endsWith('.ts') || cache.size >= 32 && !cache.has(file)) invalid();
    if (cache.has(file)) return cache.get(file).exports;
    let bytes;
    try { bytes = execFileSync('git', ['show', `${revision}:${file}`], { cwd: repository, timeout: 10000, maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'] }); } catch { invalid(); }
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const compiled = ts.transpileModule(source, { fileName: file, compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } });
    const module = new Module(path.join(repository, file)); module.filename = path.join(repository, file); cache.set(file, module);
    module.require = request => {
      if (typeof request !== 'string' || !request.startsWith('.')) invalid();
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), request));
      return load(path.posix.extname(resolved) ? resolved : resolved + '.ts');
    };
    module._compile(compiled.outputText, module.filename); return module.exports;
  }
  const { assertCanonicalHistoryEnvelope } = load('learning-components/runtime/historyEnvelope.ts');
  assertCanonicalHistoryEnvelope(history);
  const { writeHistoryExport } = load('mofacts/server/lib/historyExport.ts');
  const { createOwnHistoryDownloadHandler } = load('mofacts/server/lib/ownHistoryDownloadHandler.ts');
  const request = Object.assign(new EventEmitter(), { method: 'GET', url: '/synthetic-owned-token/fixture.tsv' });
  const response = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false, headersSent: false });
  const chunks = []; let status, contentType, closed = false, length = 0;
  response.writeHead = (code, headers) => { status = code; contentType = headers['Content-Type']; response.headersSent = true; };
  response.write = bytes => { length += Buffer.byteLength(bytes); if (length > 2097152) invalid(); chunks.push(Buffer.from(bytes)); return true; };
  response.end = bytes => { if (bytes) response.write(bytes); response.writableEnded = true; };
  response.destroy = () => { response.destroyed = true; };
  const cursor = { async *[Symbol.asyncIterator]() { yield structuredClone(history); }, async close() { closed = true; } };
  const handler = createOwnHistoryDownloadHandler({
    consumeToken: token => { if (token !== 'synthetic-owned-token') invalid(); return { userId, fileName: 'fixture.tsv' }; },
    userExists: async id => id === userId, hasHistory: async id => id === userId,
    openHistory: () => cursor, writeHistory: (rows, write) => writeHistoryExport(rows, write, invalid),
  });
  await handler(request, response);
  if (status !== 200 || !closed || !response.writableEnded || response.destroyed
    || !contentType?.startsWith('text/tab-separated-values')) invalid();
  const bytes = Buffer.concat(chunks);
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex'), sourceRevision: revision };
}
