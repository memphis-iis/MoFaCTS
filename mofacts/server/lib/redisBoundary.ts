import net from 'net';
import tls from 'tls';
import { randomBytes } from 'crypto';

type RedisCommandPart = string | number;

export type RedisBoundary = {
  enabled: boolean;
  ping: () => Promise<void>;
  withLock: <T>(key: string, ttlMs: number, work: () => Promise<T>) => Promise<T>;
};

function encodeCommand(parts: RedisCommandPart[]) {
  return Buffer.from([
    `*${parts.length}`,
    ...parts.flatMap((part) => {
      const value = String(part);
      return [`$${Buffer.byteLength(value)}`, value];
    }),
    '',
  ].join('\r\n'));
}

function parseSimpleRedisResponse(raw: string) {
  if (raw.startsWith('+')) {
    return raw.slice(1).split('\r\n')[0];
  }
  if (raw.startsWith('$-1')) {
    return null;
  }
  if (raw.startsWith('$')) {
    const lines = raw.split('\r\n');
    return lines[1] ?? '';
  }
  if (raw.startsWith(':')) {
    return Number(raw.slice(1).split('\r\n')[0]);
  }
  if (raw.startsWith('-')) {
    throw new Error(raw.slice(1).split('\r\n')[0] || 'Redis command failed');
  }
  throw new Error('Unexpected Redis response');
}

function redisUrlFromSettings(settings: unknown, env: NodeJS.ProcessEnv) {
  const record = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? settings as Record<string, any>
    : {};
  const openCore = record.openCore && typeof record.openCore === 'object' ? record.openCore : {};
  const enabled = openCore.requireRedis === true || env.MOFACTS_REQUIRE_REDIS === 'true';
  const url = String(env.REDIS_URL || openCore.redisUrl || '').trim();
  return { enabled, url };
}

async function sendRedisCommand(redisUrl: string, parts: RedisCommandPart[]) {
  const parsed = new URL(redisUrl);
  const port = Number(parsed.port || 6379);
  const host = parsed.hostname;
  const password = decodeURIComponent(parsed.password || '');
  const db = parsed.pathname.replace(/^\//, '');
  const commandSequence: RedisCommandPart[][] = [];
  if (password) {
    commandSequence.push(parsed.username ? ['AUTH', decodeURIComponent(parsed.username), password] : ['AUTH', password]);
  }
  if (db) {
    commandSequence.push(['SELECT', db]);
  }
  commandSequence.push(parts);

  const socket = parsed.protocol === 'rediss:'
    ? tls.connect({ host, port, servername: host })
    : net.connect({ host, port });

  socket.setTimeout(5000);

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('secureConnect', resolve);
      socket.once('error', reject);
      socket.once('timeout', () => reject(new Error('Redis connection timed out')));
    });

    let lastResponse: unknown = null;
    for (const command of commandSequence) {
      lastResponse = await new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const onData = (chunk: Buffer) => {
          chunks.push(chunk);
          const raw = Buffer.concat(chunks).toString('utf8');
          if (!raw.endsWith('\r\n')) {
            return;
          }
          socket.off('data', onData);
          try {
            resolve(parseSimpleRedisResponse(raw));
          } catch (error) {
            reject(error);
          }
        };
        socket.on('data', onData);
        socket.write(encodeCommand(command));
      });
    }
    return lastResponse;
  } finally {
    socket.destroy();
  }
}

export function createRedisBoundary(settings: unknown, env: NodeJS.ProcessEnv = process.env): RedisBoundary {
  const { enabled, url } = redisUrlFromSettings(settings, env);
  if (!enabled) {
    return {
      enabled: false,
      async ping() {
        return undefined;
      },
      async withLock(_key, _ttlMs, work) {
        return await work();
      },
    };
  }
  if (!url) {
    throw new Error('REDIS_URL is required when openCore.requireRedis is true');
  }

  return {
    enabled: true,
    async ping() {
      const response = await sendRedisCommand(url, ['PING']);
      if (response !== 'PONG') {
        throw new Error('Redis PING did not return PONG');
      }
    },
    async withLock<T>(key: string, ttlMs: number, work: () => Promise<T>) {
      const token = randomBytes(16).toString('hex');
      const response = await sendRedisCommand(url, ['SET', key, token, 'NX', 'PX', ttlMs]);
      if (response !== 'OK') {
        throw new Error(`Redis lock is already held: ${key}`);
      }
      try {
        return await work();
      } finally {
        await sendRedisCommand(url, ['DEL', key]);
      }
    },
  };
}
