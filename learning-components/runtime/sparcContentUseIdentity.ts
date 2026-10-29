import { stableMoveJson, type SparcPrimitiveContent } from './sparcMoveLibraryContract';

export type SparcContentUseDigest = (text: string) => string;

/** Exact saved content identity; this deliberately makes no semantic/paraphrase judgment. */
export function sparcPrimitiveContentUseKeys(
  content: SparcPrimitiveContent,
  digest: SparcContentUseDigest,
  entryId?: string,
): string[] {
  if (entryId !== undefined && (typeof entryId !== 'string' || !entryId.trim())) throw new Error('Content identity requires a valid entry identity');
  const keys = new Set<string>(entryId ? [`entry:${entryId}`] : []);
  const add = (part: SparcPrimitiveContent) => {
    if (part.administrativeRemoval) return;
    if (typeof part.text !== 'string' || !part.text.trim()) throw new Error('Content identity requires saved component text');
    keys.add(`text:${digest(part.text)}`);
    const payload = { ...part };
    delete payload.support;
    const canonicalPayload = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
    if (part.choices) canonicalPayload.choices = [...part.choices].sort((a, b) => a.id.localeCompare(b.id));
    keys.add(`payload:${digest(stableMoveJson(canonicalPayload))}`);
    if (part.figure) {
      if (typeof part.figure.assetId !== 'string' || !part.figure.assetId.trim()) throw new Error('Content identity requires a valid image identity');
      keys.add(`image:${part.figure.assetId}`);
    }
    if (part.video) {
      if (typeof part.video.segmentId !== 'string' || !part.video.segmentId.trim()) throw new Error('Content identity requires a valid video identity');
      keys.add(`video:${part.video.segmentId}`);
    }
  };
  add(content);
  if (content.support) add(content.support);
  return [...keys].sort();
}

export function sparcCatalogContentUseKeys(
  entry: { _id: string; kind: string; content?: SparcPrimitiveContent },
  digest: SparcContentUseDigest,
): string[] {
  if (typeof entry._id !== 'string' || !entry._id.trim() || typeof entry.kind !== 'string') throw new Error('Catalog content identity requires an entry identity and kind');
  if (entry.kind === 'image') return [`entry:${entry._id}`, `image:${entry._id}`].sort();
  if (!entry.content) throw new Error('Catalog component content is missing');
  return sparcPrimitiveContentUseKeys(entry.content, digest, entry._id);
}
