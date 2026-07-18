export type PackageUploadIntegrity = { expectedSize: number; sha256?: string };

type PackageUploadCollection = {
  insert: (options: { file: File; chunkSize: 'dynamic'; meta: Record<string, unknown> }, autoStart: false) => {
    on: (event: 'start' | 'progress' | 'end', handler: (...args: any[]) => void) => void;
    start: () => void;
  };
  link: (file: Record<string, unknown>) => string;
};

export type PackageAssetUploadOptions = {
  dynamicAssets: PackageUploadCollection;
  file: File;
  getUploadIntegrity: (file: File) => Promise<Partial<PackageUploadIntegrity>>;
  meta?: Record<string, unknown>;
  onStart?: (upload: unknown) => void;
  onProgress?: (progress: number, upload: unknown) => void;
  onProcessing?: (asset: Record<string, unknown>) => void;
};

type PackageUploadOptions = PackageAssetUploadOptions & {
  callAsync: (method: string, ...args: unknown[]) => Promise<any>;
  userId: string | null;
  emailOnCompletion?: boolean;
};

export type UploadedPackageAsset = {
  asset: Record<string, unknown> & { _id: string };
  link: string;
  integrity: PackageUploadIntegrity;
};

export type ProcessedPackageUpload = {
  asset: Record<string, unknown> & { _id: string };
  link: string;
  integrity: PackageUploadIntegrity;
  processing: any;
};

export async function uploadPackageAsset(options: PackageAssetUploadOptions): Promise<UploadedPackageAsset> {
  const computedIntegrity = await options.getUploadIntegrity(options.file);
  const integrity: PackageUploadIntegrity = {
    expectedSize: Number(computedIntegrity.expectedSize ?? options.file.size) || 0,
    ...(computedIntegrity.sha256 ? { sha256: computedIntegrity.sha256 } : {}),
  };
  const asset = await new Promise<Record<string, unknown> & { _id: string }>((resolve, reject) => {
    const upload = options.dynamicAssets.insert({
      file: options.file,
      chunkSize: 'dynamic',
      meta: {
        ...(options.meta || {}),
        uploadPurpose: 'package',
        expectedSize: integrity.expectedSize,
        ...(integrity.sha256 ? { sha256: integrity.sha256 } : {}),
      },
    }, false);
    upload.on('start', function(this: unknown) {
      options.onStart?.(this);
    });
    upload.on('progress', function(this: unknown, progress: number) {
      options.onProgress?.(Number(progress) || 0, this);
    });
    upload.on('end', (_error: unknown, fileObj: Record<string, unknown> & { _id: string }) => {
      if (_error) reject(_error);
      else if (!fileObj?._id) reject(new Error('Package upload completed without an asset id.'));
      else resolve(fileObj);
    });
    upload.start();
  });
  const extension = String(asset.ext || options.file.name.split('.').pop() || '').toLowerCase();
  if (extension !== 'zip') {
    throw new Error('Package upload completed with a non-ZIP asset.');
  }
  const link = options.dynamicAssets.link({ ...asset });
  if (!link) throw new Error('Package upload completed without a usable asset link.');
  return { asset, link, integrity };
}

export async function uploadAndProcessPackage(options: PackageUploadOptions): Promise<ProcessedPackageUpload> {
  const uploaded = await uploadPackageAsset(options);
  const { asset, link, integrity } = uploaded;
  options.onProcessing?.(asset);
  const processing = await options.callAsync(
    'processPackageUpload',
    asset._id,
    options.userId,
    link,
    options.emailOnCompletion === true,
    integrity,
  );
  if (!processing || !Array.isArray(processing.results)) {
    throw new Error('Package processing did not return a completion result.');
  }
  return { asset, link, integrity, processing };
}
