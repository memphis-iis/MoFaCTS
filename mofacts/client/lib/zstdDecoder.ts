type ZstdModule = {
  HEAP8: Int8Array;
  HEAPU8: Uint8Array;
  init: (pathOrBuffer: string | ArrayBuffer | Uint8Array) => void;
  onAbort?: (reason: unknown) => void;
  onRuntimeInitialized?: () => void;
  _ZSTD_decompress: (
    destination: number,
    destinationCapacity: number,
    source: number,
    compressedSize: number,
  ) => number;
  _ZSTD_getFrameContentSize: (source: number, compressedSize: number) => number;
  _ZSTD_isError: (code: number) => number;
  _free: (pointer: number, size?: number) => void;
  _malloc: (size: number) => number;
};

type ZstdRuntimeModule = {
  Module: ZstdModule;
};

const ZSTD_JS_URL = '/vendor/zstd-wasm/0.0.27/zstd.js';
const ZSTD_WASM_URL = '/vendor/zstd-wasm/0.0.27/zstd.wasm';
const UNKNOWN_CONTENT_SIZE = -1;
const DEFAULT_HEAP_SIZE = 1024 * 1024;

let zstdRuntimePromise: Promise<ZstdModule> | null = null;

async function importVendoredZstdModule(): Promise<ZstdRuntimeModule> {
  return import(/* webpackIgnore: true */ ZSTD_JS_URL) as Promise<ZstdRuntimeModule>;
}

async function loadZstdRuntime(): Promise<ZstdModule> {
  if (!zstdRuntimePromise) {
    zstdRuntimePromise = importVendoredZstdModule()
      .then((runtime) => {
        const zstdModule = runtime.Module;
        return new Promise<ZstdModule>((resolve, reject) => {
          zstdModule.onAbort = reject;
          zstdModule.onRuntimeInitialized = () => resolve(zstdModule);
          zstdModule.init(ZSTD_WASM_URL);
        });
      })
      .catch((error: unknown) => {
        zstdRuntimePromise = null;
        throw error;
      });
  }
  return zstdRuntimePromise;
}

function freeZstdMemory(zstdModule: ZstdModule, pointer: number, size: number) {
  if (pointer) {
    zstdModule._free(pointer, size);
  }
}

export async function decompressZstd(bytes: Uint8Array): Promise<Uint8Array> {
  const zstdModule = await loadZstdRuntime();
  const sourcePointer = zstdModule._malloc(bytes.byteLength);
  zstdModule.HEAP8.set(bytes, sourcePointer);

  const contentSize = zstdModule._ZSTD_getFrameContentSize(sourcePointer, bytes.byteLength);
  const destinationCapacity = contentSize === UNKNOWN_CONTENT_SIZE
    ? DEFAULT_HEAP_SIZE
    : contentSize;
  const destinationPointer = zstdModule._malloc(destinationCapacity);

  try {
    const decompressedSize = zstdModule._ZSTD_decompress(
      destinationPointer,
      destinationCapacity,
      sourcePointer,
      bytes.byteLength,
    );
    if (zstdModule._ZSTD_isError(decompressedSize)) {
      throw new Error(`Zstandard decompression failed with code ${decompressedSize}`);
    }
    return new Uint8Array(zstdModule.HEAPU8.buffer, destinationPointer, decompressedSize).slice();
  } finally {
    freeZstdMemory(zstdModule, destinationPointer, destinationCapacity);
    freeZstdMemory(zstdModule, sourcePointer, bytes.byteLength);
  }
}
