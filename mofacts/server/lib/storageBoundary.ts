import fs from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export type StorageValidationCheck = {
  name: string;
  status: 'pass' | 'fail';
  message: string;
};

type StorageSettings = {
  backend?: string;
  local?: {
    dynamicAssetsPath?: string;
    h5pContentPath?: string;
    h5pLibrariesPath?: string;
  };
  s3?: {
    endpoint?: string;
    bucket?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    prefix?: string;
    forcePathStyle?: boolean;
  };
};

type S3Config = Required<Pick<NonNullable<StorageSettings['s3']>, 'endpoint' | 'bucket' | 'region' | 'accessKeyId' | 'secretAccessKey'>> & {
  prefix: string;
  forcePathStyle: boolean;
};

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getStorageSettings(settings: unknown): StorageSettings {
  const record = isRecord(settings) ? settings : {};
  return isRecord(record.storage) ? record.storage as StorageSettings : {};
}

export function getStorageBackend(settings: unknown): 'local' | 's3' {
  const backend = getStorageSettings(settings).backend || 'local';
  if (backend !== 'local' && backend !== 's3') {
    throw new Error('storage.backend must be local or s3');
  }
  return backend;
}

export function getLocalStoragePaths(settings: unknown, env: NodeJS.ProcessEnv = process.env) {
  const storage = getStorageSettings(settings);
  const local = isRecord(storage.local) ? storage.local : {};
  const home = String(env.HOME || process.cwd()).trim();
  return {
    dynamicAssetsPath: path.resolve(local.dynamicAssetsPath || path.join(home, 'dynamic-assets')),
    h5pContentPath: path.resolve(local.h5pContentPath || path.join(home, 'h5p-content')),
    h5pLibrariesPath: path.resolve(local.h5pLibrariesPath || path.join(home, 'h5p-libraries')),
  };
}

function normalizeStorageKeyPart(value: string) {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .join('/');
}

function normalizePrefix(value: unknown) {
  const prefix = typeof value === 'string' ? normalizeStorageKeyPart(value.trim()) : '';
  return prefix ? `${prefix}/` : '';
}

function getS3Config(settings: unknown): S3Config {
  const storage = getStorageSettings(settings);
  const s3 = isRecord(storage.s3) ? storage.s3 : {};
  const endpoint = typeof s3.endpoint === 'string' ? s3.endpoint.trim() : '';
  const bucket = typeof s3.bucket === 'string' ? s3.bucket.trim() : '';
  const region = typeof s3.region === 'string' ? s3.region.trim() : '';
  const accessKeyId = typeof s3.accessKeyId === 'string' ? s3.accessKeyId.trim() : '';
  const secretAccessKey = typeof s3.secretAccessKey === 'string' ? s3.secretAccessKey.trim() : '';
  const missing = [
    ['storage.s3.endpoint', endpoint],
    ['storage.s3.bucket', bucket],
    ['storage.s3.region', region],
    ['storage.s3.accessKeyId', accessKeyId],
    ['storage.s3.secretAccessKey', secretAccessKey],
  ].filter(([, value]) => !value).map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`${missing.join(', ')} required when storage.backend is s3`);
  }
  return {
    endpoint,
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    prefix: normalizePrefix(s3.prefix),
    forcePathStyle: s3.forcePathStyle !== false,
  };
}

function createS3Client(config: S3Config) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function buildS3Key(config: S3Config, key: string) {
  const normalizedKey = normalizeStorageKeyPart(key);
  if (!normalizedKey) {
    throw new Error('S3 object key cannot be empty');
  }
  if (normalizedKey.split('/').some((segment) => segment === '..')) {
    throw new Error(`S3 object key "${key}" contains an unsafe path segment`);
  }
  return `${config.prefix}${normalizedKey}`;
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) {
    return Buffer.alloc(0);
  }
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (typeof (body as { transformToByteArray?: unknown }).transformToByteArray === 'function') {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return Buffer.from(bytes);
  }
  throw new Error('Unsupported S3 response body');
}

function isS3NotFoundError(error: unknown) {
  const err = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown }; Code?: unknown };
  return err?.name === 'NotFound'
    || err?.name === 'NoSuchKey'
    || err?.$metadata?.httpStatusCode === 404
    || err?.Code === 'NoSuchKey';
}

export function createStorageBoundary(settings: unknown) {
  const backend = getStorageBackend(settings);
  if (backend === 'local') {
    return {
      backend,
      async putObject(_key: string, _body: Buffer, _contentType?: string) {
        throw new Error('putObject is only available when storage.backend is s3');
      },
      async getObject(_key: string) {
        throw new Error('getObject is only available when storage.backend is s3');
      },
      async objectExists(_key: string) {
        throw new Error('objectExists is only available when storage.backend is s3');
      },
      async deleteObject(_key: string) {
        throw new Error('deleteObject is only available when storage.backend is s3');
      },
      async listChildPrefixes(_prefix: string) {
        throw new Error('listChildPrefixes is only available when storage.backend is s3');
      },
    };
  }

  const config = getS3Config(settings);
  const client = createS3Client(config);
  return {
    backend,
    bucket: config.bucket,
    key(key: string) {
      return buildS3Key(config, key);
    },
    async putObject(key: string, body: Buffer, contentType?: string) {
      const fullKey = buildS3Key(config, key);
      await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: fullKey,
        Body: body,
        ContentType: contentType,
      }));
      return fullKey;
    },
    async getObject(key: string) {
      const fullKey = buildS3Key(config, key);
      const response = await client.send(new GetObjectCommand({
        Bucket: config.bucket,
        Key: fullKey,
      }));
      return {
        body: await bodyToBuffer(response.Body),
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        key: fullKey,
      };
    },
    async objectExists(key: string) {
      try {
        const fullKey = buildS3Key(config, key);
        await client.send(new HeadObjectCommand({
          Bucket: config.bucket,
          Key: fullKey,
        }));
        return true;
      } catch (error) {
        if (isS3NotFoundError(error)) {
          return false;
        }
        throw error;
      }
    },
    async deleteObject(key: string) {
      const fullKey = buildS3Key(config, key);
      await client.send(new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: fullKey,
      }));
    },
    async listChildPrefixes(prefix: string) {
      const fullPrefix = buildS3Key(config, prefix).replace(/\/?$/, '/');
      const response = await client.send(new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: fullPrefix,
        Delimiter: '/',
      }));
      return (response.CommonPrefixes || [])
        .map((item) => item.Prefix || '')
        .filter(Boolean)
        .map((item) => item.startsWith(config.prefix) ? item.slice(config.prefix.length) : item);
    },
  };
}

function pathIsInsideDirectory(targetPath: string, parentPath: string) {
  const relative = path.relative(parentPath, targetPath);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function assertStorageRelativePathSafe(rootPath: string, relativePath: string) {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedTarget = path.resolve(resolvedRoot, relativePath);
  if (!pathIsInsideDirectory(resolvedTarget, resolvedRoot)) {
    throw new Error(`Storage path "${relativePath}" escapes storage root "${resolvedRoot}"`);
  }
  return resolvedTarget;
}

async function validateDirectoryAccess(name: string, dirPath: string): Promise<StorageValidationCheck> {
  try {
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) {
      return { name, status: 'fail', message: `${dirPath} exists but is not a directory` };
    }
    await fs.access(dirPath, fs.constants.R_OK | fs.constants.W_OK);
    return { name, status: 'pass', message: `${dirPath} is readable and writable` };
  } catch (error: unknown) {
    return {
      name,
      status: 'fail',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function validateS3Config(storage: StorageSettings, settings: unknown): Promise<StorageValidationCheck[]> {
  if (storage.backend !== 's3') {
    return [];
  }
  const s3 = isRecord(storage.s3) ? storage.s3 : {};
  const checks: StorageValidationCheck[] = [];
  const requiredKeys: Array<keyof NonNullable<StorageSettings['s3']>> = [
    'endpoint',
    'bucket',
    'region',
    'accessKeyId',
    'secretAccessKey',
  ];
  for (const key of requiredKeys) {
    const value = s3[key];
    checks.push({
      name: `storage.s3.${key}`,
      status: typeof value === 'string' && value.trim().length > 0 ? 'pass' : 'fail',
      message: typeof value === 'string' && value.trim().length > 0
        ? 'configured'
        : 'required when storage.backend is s3',
    });
  }
  if (typeof s3.endpoint === 'string' && s3.endpoint.trim()) {
    try {
      const parsed = new URL(s3.endpoint);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        checks.push({ name: 'storage.s3.endpoint', status: 'fail', message: 'must use http:// or https://' });
      }
    } catch {
      checks.push({ name: 'storage.s3.endpoint', status: 'fail', message: 'must be a valid URL' });
    }
  }
  if (checks.some((item) => item.status === 'fail')) {
    return checks;
  }
  try {
    const boundary = createStorageBoundary(settings);
    if (boundary.backend !== 's3') {
      return checks;
    }
    const validationKey = `readiness/${Date.now()}-${Math.random().toString(16).slice(2)}.txt`;
    await boundary.putObject(validationKey, Buffer.from('mofacts-storage-readiness'), 'text/plain');
    if (!(await boundary.objectExists(validationKey))) {
      checks.push({ name: 'storage.s3.permissions', status: 'fail', message: 'S3 object was written but HEAD failed' });
    } else {
      const object = await boundary.getObject(validationKey);
      if (object.body.toString('utf8') !== 'mofacts-storage-readiness') {
        checks.push({ name: 'storage.s3.permissions', status: 'fail', message: 'S3 object read returned unexpected content' });
      } else {
        checks.push({ name: 'storage.s3.permissions', status: 'pass', message: 'S3 write, read, and head succeeded' });
      }
    }
    await boundary.deleteObject(validationKey);
  } catch (error: unknown) {
    checks.push({
      name: 'storage.s3.permissions',
      status: 'fail',
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return checks;
}

export async function validateStorageBoundary(settings: unknown, env: NodeJS.ProcessEnv = process.env) {
  const storage = getStorageSettings(settings);
  const backend = storage.backend || 'local';
  if (backend !== 'local' && backend !== 's3') {
    return [{ name: 'storage.backend', status: 'fail' as const, message: 'must be local or s3' }];
  }

  const paths = getLocalStoragePaths(settings, env);
  const checks = [
    await validateDirectoryAccess('storage.local.dynamicAssetsPath', paths.dynamicAssetsPath),
    await validateDirectoryAccess('storage.local.h5pContentPath', paths.h5pContentPath),
    await validateDirectoryAccess('storage.local.h5pLibrariesPath', paths.h5pLibrariesPath),
  ];
  checks.push(...await validateS3Config(storage, settings));
  return checks;
}
