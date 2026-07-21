import { AI_CONTENT_WORKING_RECORD_KEY, type AiContentWorkingRecord } from '../../common/aiContentContract';
import type { PreparedAiImageAsset } from './aiContentImageAssets';

const DATABASE_NAME = 'mofacts-ai-content-creator';
const DATABASE_VERSION = 1;
const STORE_NAME = 'working-records';

export type LocalAiContentAsset = PreparedAiImageAsset & {
  purpose: 'input' | 'resolved';
  previewUrl: string;
};

type StoredLocalAiContentAsset = Omit<LocalAiContentAsset, 'previewUrl'>;

type StoredAiContentSnapshot = {
  record: AiContentWorkingRecord;
  assets: StoredLocalAiContentAsset[];
};

export type AiContentWorkingSnapshot = {
  record: AiContentWorkingRecord;
  assets: LocalAiContentAsset[];
};

export function aiContentWorkingRecordKey(userId: string): string {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    throw new Error('AI Content Creator browser storage requires an authenticated user.');
  }
  return `${AI_CONTENT_WORKING_RECORD_KEY}:${normalizedUserId}`;
}

function requireIndexedDb(): IDBFactory {
  if (!globalThis.indexedDB) {
    throw new Error('AI Content Creator requires browser-local IndexedDB storage. Nothing was sent to the server.');
  }
  return globalThis.indexedDB;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = requireIndexedDb().open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open browser-local AI Content Creator storage.'));
  });
}

function transactionRequest<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Browser-local AI Content Creator storage failed.'));
    transaction.oncomplete = () => database.close();
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error('Browser-local AI Content Creator storage was aborted.'));
    };
  }));
}

function storedAsset(asset: LocalAiContentAsset): StoredLocalAiContentAsset {
  return {
    id: asset.id,
    originalName: asset.originalName,
    sourcePath: asset.sourcePath,
    packageFileName: asset.packageFileName,
    bytes: new Uint8Array(asset.bytes),
    width: asset.width,
    height: asset.height,
    purpose: asset.purpose,
  };
}

function restoredAsset(asset: StoredLocalAiContentAsset): LocalAiContentAsset {
  const bytes = new Uint8Array(asset.bytes);
  return {
    ...asset,
    bytes,
    previewUrl: URL.createObjectURL(new Blob([bytes.buffer], { type: 'image/webp' })),
  };
}

function storedRecord(record: AiContentWorkingRecord): AiContentWorkingRecord {
  return {
    ...record,
    pairs: record.pairs.map((pair) => {
      if (!pair.image) return pair;
      const image = { ...pair.image };
      delete image.previewUrl;
      return { ...pair, image };
    }),
  };
}

function restoredRecord(record: AiContentWorkingRecord, assets: LocalAiContentAsset[]): AiContentWorkingRecord {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  return {
    ...record,
    pairs: record.pairs.map((pair) => {
      const asset = pair.image?.assetId ? assetsById.get(pair.image.assetId) : undefined;
      if (!pair.image || !asset) return pair;
      return { ...pair, image: { ...pair.image, previewUrl: asset.previewUrl } };
    }),
  };
}

export async function loadAiContentWorkingSnapshot(userId: string): Promise<AiContentWorkingSnapshot | null> {
  const key = aiContentWorkingRecordKey(userId);
  const stored = await transactionRequest<StoredAiContentSnapshot | undefined>('readonly', (store) => store.get(key));
  if (!stored) return null;
  const assets = stored.assets.map(restoredAsset);
  return {
    record: restoredRecord(stored.record, assets),
    assets,
  };
}

export async function saveAiContentWorkingSnapshot(userId: string, snapshot: AiContentWorkingSnapshot): Promise<void> {
  const key = aiContentWorkingRecordKey(userId);
  const stored: StoredAiContentSnapshot = {
    record: storedRecord(snapshot.record),
    assets: snapshot.assets.map(storedAsset),
  };
  await transactionRequest('readwrite', (store) => store.put(stored, key));
}

export async function clearAiContentWorkingSnapshot(userId: string): Promise<void> {
  const key = aiContentWorkingRecordKey(userId);
  await transactionRequest('readwrite', (store) => store.delete(key));
}

export class AiContentWorkingSaveQueue {
  private requestedVersion = 0;
  private persistedVersion = 0;
  private latest: AiContentWorkingSnapshot | null = null;
  private running: Promise<void> | null = null;

  constructor(private readonly userId: string) {
    aiContentWorkingRecordKey(userId);
  }

  enqueue(snapshot: AiContentWorkingSnapshot): Promise<void> {
    this.requestedVersion += 1;
    this.latest = snapshot;
    if (!this.running) this.running = this.drain();
    return this.running;
  }

  async flush(): Promise<void> {
    if (this.running) await this.running;
  }

  private async drain(): Promise<void> {
    try {
      while (this.persistedVersion < this.requestedVersion) {
        const version = this.requestedVersion;
        const snapshot = this.latest;
        if (!snapshot) break;
        await saveAiContentWorkingSnapshot(this.userId, snapshot);
        this.persistedVersion = version;
      }
    } finally {
      this.running = null;
    }
  }
}
