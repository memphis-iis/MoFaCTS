import { createHash } from 'node:crypto';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = value => Buffer.from(JSON.stringify(value));
export function dockerTar(entries) {
  const chunks = [];
  for (const [name, value] of entries) {
    const data = Buffer.from(value);
    const header = Buffer.alloc(512);
    header.write(name, 0);
    header.write('0000644\0', 100);
    header.write('0000000\0', 108);
    header.write('0000000\0', 116);
    header.write(data.length.toString(8).padStart(11, '0') + '\0', 124);
    header.write('00000000000\0', 136);
    header.fill(32, 148, 156);
    header[156] = 48;
    header.write('ustar\0', 257);
    header.write('00', 263);
    header.write(header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0') + '\0 ', 148);
    chunks.push(header, data, Buffer.alloc((512 - data.length % 512) % 512));
  }
  return Buffer.concat([...chunks, Buffer.alloc(1024)]);
}
export function dockerImageFixture(kind = 'classic', marker = 'one') {
  const config = encode({ architecture: 'amd64', os: 'linux', config: { Labels: { synthetic: marker } } });
  const configDigest = 'sha256:' + hash(config);
  const configPath = kind === 'classic' ? `${hash(config)}.json` : `blobs/sha256/${hash(config)}`;
  const files = new Map([[configPath, config], ['layer/layer.tar', Buffer.from('synthetic-layer')]]);
  files.set('manifest.json', encode([{ Config: configPath, RepoTags: ['synthetic:test'], Layers: ['layer/layer.tar'] }]));
  let descriptor = null;
  let nativeId = configDigest;
  if (kind !== 'classic') {
    const manifest = encode({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json',
      config: { mediaType: 'application/vnd.oci.image.config.v1+json', digest: configDigest, size: config.length }, layers: [] });
    descriptor = { mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: 'sha256:' + hash(manifest), size: manifest.length,
      platform: { os: 'linux', architecture: 'amd64' } };
    files.set(`blobs/sha256/${hash(manifest)}`, manifest);
    if (kind === 'index') {
      const index = encode({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.index.v1+json', manifests: [descriptor] });
      files.set(`blobs/sha256/${hash(index)}`, index);
      descriptor = { mediaType: 'application/vnd.oci.image.index.v1+json', digest: 'sha256:' + hash(index), size: index.length };
    }
    nativeId = descriptor.digest;
    files.set('index.json', encode({ schemaVersion: 2, manifests: [descriptor] }));
    files.set('oci-layout', encode({ imageLayoutVersion: '1.0.0' }));
  }
  return { files, inspection: { nativeId, platform: 'linux/amd64', descriptor }, configDigest,
    archive: () => dockerTar(files) };
}
