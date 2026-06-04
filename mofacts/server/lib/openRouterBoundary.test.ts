import { expect } from 'chai';
import fs from 'node:fs';
import path from 'node:path';

function collectTypeScriptFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.meteor') {
      continue;
    }
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTypeScriptFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function findSourceServerRoot(): string {
  const candidates = [
    process.env.INIT_CWD,
    process.env.PWD,
    process.cwd(),
  ]
    .filter((candidate): candidate is string => Boolean(candidate))
    .flatMap((candidate) => [
      path.join(candidate, 'server'),
      path.join(candidate, 'mofacts', 'server'),
    ]);

  const serverRoot = candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, 'lib', 'openRouterBoundary.test.ts'))
  );
  if (!serverRoot) {
    throw new Error(`Could not locate MoFaCTS server source root from: ${candidates.join(', ')}`);
  }
  return serverRoot;
}

describe('OpenRouter server boundary', function() {
  it('keeps provider chat-completion calls out of server code', function() {
    const serverRoot = findSourceServerRoot();
    const openRouterChatCompletionsUrl = [
      'openrouter.ai',
      'api',
      'v1',
      'chat',
      'completions',
    ].join('/');
    const offenders = collectTypeScriptFiles(serverRoot).filter((filePath) => {
      const source = fs.readFileSync(filePath, 'utf8');
      return source.includes(openRouterChatCompletionsUrl);
    });

    expect(offenders.map((filePath) => path.relative(serverRoot, filePath))).to.deep.equal([]);
  });
});
