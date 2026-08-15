import type { AiContentImageFilenamePattern } from '../../common/aiContentContract';

export type AiContentImagePatternSeed = Readonly<{
  itemId: string;
  response: string;
  fileTitle: string;
  sourcePath: 'list-page' | 'detail-page';
}>;

export type AiContentImagePatternInference = Readonly<{
  pattern: AiContentImageFilenamePattern | null;
  reason: string;
}>;

function comparable(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

function escapedPattern(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .split(/[ _]+/u)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[ _]+');
}

function splitFileTitle(seed: AiContentImagePatternSeed): { prefix: string; suffix: string; extension: string } | null {
  const fileTitle = seed.fileTitle.normalize('NFKC').trim();
  const response = seed.response.normalize('NFKC').trim();
  const namespace = fileTitle.match(/^File:/i)?.[0];
  if (!namespace || !response) return null;
  const basename = fileTitle.slice(namespace.length);
  const extensionIndex = basename.lastIndexOf('.');
  if (extensionIndex <= 0) return null;
  const stem = basename.slice(0, extensionIndex);
  const extension = basename.slice(extensionIndex);
  const matches = Array.from(stem.matchAll(new RegExp(escapedPattern(response), 'giu')));
  if (matches.length !== 1 || matches[0]?.index === undefined) return null;
  const match = matches[0];
  const start = match.index;
  const end = start + match[0].length;
  return {
    prefix: `${namespace}${stem.slice(0, start)}`,
    suffix: `${stem.slice(end)}${extension}`,
    extension,
  };
}

export function isAiContentImagePatternSeed(seed: AiContentImagePatternSeed): boolean {
  return splitFileTitle(seed) !== null;
}

export function inferAiContentImageFilenamePattern(
  first: AiContentImagePatternSeed,
  second: AiContentImagePatternSeed,
): AiContentImagePatternInference {
  if (first.sourcePath !== second.sourcePath) {
    return { pattern: null, reason: 'The first two successful images came from different source branches.' };
  }
  const firstSplit = splitFileTitle(first);
  const secondSplit = splitFileTitle(second);
  if (!firstSplit || !secondSplit) {
    return { pattern: null, reason: 'A seed filename did not contain its response exactly once with a file extension.' };
  }
  if (comparable(firstSplit.prefix) !== comparable(secondSplit.prefix)
    || comparable(firstSplit.suffix) !== comparable(secondSplit.suffix)
    || comparable(firstSplit.extension) !== comparable(secondSplit.extension)) {
    return { pattern: null, reason: 'The first two successful filenames did not produce the same prefix, suffix, and extension.' };
  }
  return {
    pattern: {
      patternId: `filename-pattern-${first.itemId}-${second.itemId}`,
      prefix: firstSplit.prefix,
      suffix: firstSplit.suffix,
      extension: firstSplit.extension,
      seedSourcePath: first.sourcePath,
      seedItemIds: [first.itemId, second.itemId],
      seedResponses: [first.response, second.response],
      seedFileTitles: [first.fileTitle, second.fileTitle],
    },
    reason: 'The first two successful images established one deterministic filename pattern.',
  };
}

export function predictedAiContentImageFileTitle(
  pattern: AiContentImageFilenamePattern,
  response: string,
): string {
  return `${pattern.prefix}${String(response || '').normalize('NFKC').trim()}${pattern.suffix}`;
}
