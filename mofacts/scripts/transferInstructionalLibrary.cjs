// Explicit operator tool. Import is read-only unless --apply is supplied.
// Node 24 loads the source-owned, type-only collection registry without emitting JS.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createReadStream } = require('node:fs');
const { parseEnv } = require('node:util');
const { collectionMongoName } = require('../common/collectionOwnership.ts');
const { isSparcInstructionalComponentKind } = require('../common/lib/sparcInstructionalLibrary.ts');
const { SPARC_PROMPT_IMAGE_SETTINGS, SPARC_PROMPT_IMAGE_PURPOSE } = require('../common/lib/sparcPromptImage.ts');

const FORMAT = 'mofacts-instructional-library-v2';
const OWNERS = ['SparcMoveManifests', 'DynamicAssets', 'SparcInstructionalLibrary'];
const LIMIT = 10000;
const MAX_DATA_BYTES = 128 * 1024 * 1024;
const TOOL_FILES = ['scripts/transferInstructionalLibrary.cjs', 'common/collectionOwnership.ts',
  'common/lib/sparcInstructionalLibrary.ts', 'common/lib/sparcPromptImage.ts'];
const ASSET_META = ['public', 'uploadPurpose', 'ready', 'figureLibraryVersion', 'fileName', 'tutorMessage',
  'description', 'displayWidth', 'model', 'quality', 'humanReplacement', 'replacedAt'];
const ASSET_FIELDS = ['_id', 'name', 'size', 'type', 'extension', 'ext', 'isVideo', 'isAudio', 'isImage',
  'isText', 'isJSON', 'isPDF', 'mime', 'mime-type', 'extensionWithDot', '_downloadRoute', '_collectionName'];
class TransferError extends Error {}
const fail = message => { throw new TransferError(message); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const digest = body => crypto.createHash('sha256').update(body).digest('hex');
function safeId(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) fail('Invalid shared content identity'); return value; }
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function contained(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || path.isAbsolute(relative)
    || relative.split('/').some(part => !part || part === '.' || part === '..')) fail('Unsafe transfer path');
  const target = path.resolve(root, relative);
  if (!target.startsWith(path.resolve(root) + path.sep)) fail('Transfer path escapes its directory');
  return target;
}
async function regularInside(root, relative) {
  const filename = contained(root, relative);
  const realRoot = await fs.realpath(root), realFile = await fs.realpath(filename);
  if (!realFile.startsWith(realRoot + path.sep) || !(await fs.stat(realFile)).isFile()) fail('Transfer file escapes its directory or is not a file');
  return realFile;
}
async function fileDigest(filename) {
  const hash = crypto.createHash('sha256');
  for await (const bytes of createReadStream(filename)) hash.update(bytes);
  return hash.digest('hex');
}
function imageName(asset) {
  const extension = asset.extension ?? asset.ext;
  const expected = { 'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/webp': ['webp'] }[asset.type];
  if (!expected?.includes(extension) || !Number.isSafeInteger(asset.size) || asset.size < 1
    || asset.size > SPARC_PROMPT_IMAGE_SETTINGS.maxBytes) fail('Invalid shared image type, extension, or size');
  return safeId(asset._id) + '.' + extension;
}
function portableAsset(asset) {
  if (asset.meta?.uploadPurpose !== SPARC_PROMPT_IMAGE_PURPOSE || asset.meta.public !== false
    || asset.meta.ready !== true || typeof asset.meta.figureLibraryVersion !== 'string') fail('Shared figure has no completed canonical asset');
  if (asset.meta.storageBackend === 's3') fail('This seed tool requires configured local asset storage; S3 is not supported');
  if (!asset.versions?.original || Object.keys(asset.versions).some(key => key !== 'original')) fail('Expected one original raster per shared figure asset');
  const record = Object.fromEntries(ASSET_FIELDS.filter(key => asset[key] !== undefined).map(key => [key, asset[key]]));
  record.meta = Object.fromEntries(ASSET_META.filter(key => asset.meta[key] !== undefined).map(key => [key, asset.meta[key]]));
  record.versions = { original: Object.fromEntries(['size', 'type', 'extension'].filter(key => asset.versions.original[key] !== undefined)
    .map(key => [key, asset.versions.original[key]])) };
  record.userId = null;
  record.path = imageName(asset);
  return record;
}
function destinationAsset(asset, root) {
  const record = portableAsset({ ...asset, versions: asset.versions });
  const assetPath = contained(root, imageName(asset));
  return { ...record, path: assetPath, _storagePath: path.resolve(root),
    versions: { original: { ...record.versions.original, path: assetPath } } };
}
function validateLibrary(entry) {
  safeId(entry._id);
  if (!isSparcInstructionalComponentKind(entry.kind) || 'reusable' in entry || 'previousEntryId' in entry || 'currentAssetId' in entry || 'revision' in entry
    || typeof entry.version !== 'string' || typeof entry.embeddingModel !== 'string'
    || !Array.isArray(entry.embedding) || !entry.embedding.length || entry.embedding.some(n => !Number.isFinite(n))) fail('Invalid shared library entry');
  if (['userId', 'sessionId', 'query', 'learnerText', 'generation'].some(key => key in entry)) fail('Private or unfinished content cannot be exported');
  if (entry.kind === 'image' && entry.ready !== true) fail('Pending figures cannot be transferred');
  if (entry.kind !== 'image' && (!object(entry.content) || typeof entry.content.text !== 'string')) fail('Instructional component has no saved content');
}
function validateGraph(records) {
  const library = new Map(), assets = new Map(), seen = new Set();
  for (const { owner, document } of records) {
    if (!OWNERS.includes(owner) || !object(document)) fail('Transfer contains a collection outside shared instructional content');
    safeId(document._id);
    const identity = owner + ':' + document._id;
    if (seen.has(identity)) fail('Duplicate transfer identity');
    seen.add(identity);
    if (owner === 'SparcInstructionalLibrary') { validateLibrary(document); library.set(document._id, document); }
    if (owner === 'DynamicAssets') { portableAsset(document); assets.set(document._id, document); }

  }
  const usedAssets = new Set();
  const image = (id, version) => {
    const asset = assets.get(id);
    if (!asset || asset.meta.figureLibraryVersion !== version) fail('Transfer is missing a referenced figure asset or version');
    usedAssets.add(id);
  };
  for (const entry of library.values()) {
    if (entry.kind === 'image') {
      image(entry._id, entry.version);
    } else if (entry.content.figure) {
      const assetId = entry.content.figure.assetId;
      const root = library.get(assetId);
      if (!root || root.kind !== 'image') fail('Rich support references a figure outside the shared library');
      image(assetId, root.version);
    }
    if (entry.content?.video) {
      const video = library.get(entry.content.video.segmentId);
      if (!video || video.kind !== 'video' || canonical(video.content.video) !== canonical(entry.content.video)) fail('Video support has no matching catalog passage');
    }
  }
  for (const { owner, document } of records) if (owner === 'SparcMoveManifests') {
    if (!Array.isArray(document.entries) || !document.entries.length || document.entries.some(id => !library.has(id))) fail('Move manifest references missing primitives');
  }
  if (usedAssets.size !== assets.size) fail('Transfer includes assets unrelated to the shared library');
  return { library, assets };
}

async function exportLibrary({ db, session, root, bundle, EJSON, commitSnapshot = async () => {}, log = console.log }) {
  // Exclusive creation prevents reusing an incomplete or earlier export directory.
  await fs.mkdir(bundle, { mode: 0o700 });
  await fs.mkdir(path.join(bundle, 'assets'), { mode: 0o700 });
  const records = [], assetIds = new Set();
  let bytes = 0;
  function add(owner, document) {
    bytes += Buffer.byteLength(EJSON.stringify(document, { relaxed: false }));
    if (records.length >= LIMIT || bytes > MAX_DATA_BYTES) fail('Transfer exceeds its documented record/metadata bound');
    records.push({ owner, document });
    if (records.length % 500 === 0) log(JSON.stringify({ stage: 'export', records: records.length }));
  }
  const read = (owner, query) => db.collection(collectionMongoName(owner)).find(query, { session }).sort({ _id: 1 }).batchSize(100).limit(LIMIT + 1);
  for await (const entry of read('SparcInstructionalLibrary', { $or: [{ kind: { $ne: 'image' } }, { kind: 'image', ready: true }] })) {
    validateLibrary(entry); add('SparcInstructionalLibrary', entry);
    if (entry.kind === 'image') { assetIds.add(entry._id); }
    if (entry.content?.figure) assetIds.add(entry.content.figure.assetId);
  }
  for await (const row of read('SparcMoveManifests', {})) add('SparcMoveManifests', row);
  const ids = [...assetIds];
  const files = {};
  for (let offset = 0; offset < ids.length; offset += 100) {
    for await (const asset of read('DynamicAssets', { _id: { $in: ids.slice(offset, offset + 100) } })) {
      const portable = portableAsset(asset), relative = 'assets/' + imageName(asset);
      const filename = await regularInside(root, imageName(asset));
      if (path.resolve(asset.path) !== path.resolve(filename) || path.resolve(asset.versions.original.path) !== path.resolve(filename)) fail('Figure metadata does not match its canonical storage path');
      if ((await fs.stat(filename)).size !== asset.size) fail('Figure file size does not match its metadata');
      const target = contained(bundle, relative);
      await fs.copyFile(filename, target, require('node:fs').constants.COPYFILE_EXCL);
      await fs.chmod(target, 0o600);
      files[relative] = await fileDigest(target); add('DynamicAssets', portable);
    }
  }
  validateGraph(records);
  const metadata = EJSON.stringify(records, { relaxed: false });
  if (Buffer.byteLength(metadata) > MAX_DATA_BYTES) fail('Transfer metadata exceeds its documented byte bound');
  await fs.writeFile(path.join(bundle, 'content.ejson'), metadata, { flag: 'wx', mode: 0o600 });
  files['content.ejson'] = digest(metadata);
  for (const file of TOOL_FILES) {
    const destination = contained(bundle, 'tool/' + file);
    await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await fs.copyFile(path.resolve(__dirname, '..', file), destination, require('node:fs').constants.COPYFILE_EXCL);
    await fs.chmod(destination, 0o600); files['tool/' + file] = await fileDigest(destination);
  }
  const counts = Object.fromEntries(OWNERS.map(owner => [owner, records.filter(row => row.owner === owner).length]));
  const manifest = { format: FORMAT, createdAt: new Date().toISOString(), counts, files };
  const manifestText = JSON.stringify(manifest, null, 2) + '\n';
  // The manifest is the completion marker. Retain its SHA-256 independently.
  await commitSnapshot();
  await fs.writeFile(path.join(bundle, 'manifest.json'), manifestText, { flag: 'wx', mode: 0o600 });
  log(JSON.stringify({ exported: counts, manifestSha256: digest(manifestText) }));
  return manifest;
}

async function readBundle(bundle, expectedHash, EJSON) {
  if (!/^[a-f0-9]{64}$/.test(expectedHash ?? '')) fail('An independently retained --manifest-sha256 is required');
  const manifestFile = await regularInside(bundle, 'manifest.json');
  if ((await fs.stat(manifestFile)).size > 4 * 1024 * 1024) fail('Transfer manifest exceeds its bound');
  const text = await fs.readFile(manifestFile, 'utf8');
  if (digest(text) !== expectedHash) fail('Transfer manifest checksum differs');
  const manifest = JSON.parse(text);
  if (manifest.format !== FORMAT || !object(manifest.files) || !object(manifest.counts)) fail('Unsupported instructional transfer format');
  const names = Object.keys(manifest.files);
  if (names.length > LIMIT + TOOL_FILES.length + 1 || !names.includes('content.ejson')
    || TOOL_FILES.some(file => !names.includes('tool/' + file))) fail('Incomplete or oversized transfer manifest');
  for (const relative of names) {
    if (relative !== 'content.ejson' && !TOOL_FILES.some(file => relative === 'tool/' + file)
      && !/^assets\/[A-Za-z0-9_-]{1,128}\.(png|jpg|jpeg|webp)$/.test(relative)) fail('Unexpected transfer file');
    const file = await regularInside(bundle, relative), size = (await fs.stat(file)).size;
    if (size > (relative === 'content.ejson' ? MAX_DATA_BYTES : relative.startsWith('assets/') ? SPARC_PROMPT_IMAGE_SETTINGS.maxBytes : 1024 * 1024)
      || await fileDigest(file) !== manifest.files[relative]) fail('Transfer file size or checksum differs');
  }
  // Application documents use native JS numbers; dates retain their BSON type.
  const records = EJSON.parse(await fs.readFile(path.join(bundle, 'content.ejson'), 'utf8'), { relaxed: true });
  if (!Array.isArray(records) || records.length > LIMIT) fail('Transfer record bound exceeded');
  const graph = validateGraph(records);
  for (const owner of OWNERS) if (manifest.counts[owner] !== records.filter(row => row.owner === owner).length) fail('Transfer counts differ');
  for (const asset of graph.assets.values()) if (!manifest.files['assets/' + imageName(asset)]
    || (await fs.stat(contained(bundle, 'assets/' + imageName(asset)))).size !== asset.size) fail('Missing or incomplete transfer image');
  if (names.filter(name => name.startsWith('assets/')).length !== graph.assets.size) fail('Unreferenced transfer images');
  return { manifest, records, ...graph };
}

async function assertFresh(db, assetIds, session) {
  for (const owner of OWNERS.filter(name => name !== 'DynamicAssets')) {
    if (await db.collection(collectionMongoName(owner)).findOne({}, { projection: { _id: 1 }, session })) fail('Destination instructional library is not empty; this tool only seeds a fresh library');
  }
  for (let offset = 0; offset < assetIds.length; offset += 100) {
    if (await db.collection(collectionMongoName('DynamicAssets')).findOne({ _id: { $in: assetIds.slice(offset, offset + 100) } }, { projection: { _id: 1 }, session })) fail('A destination asset identity is already in use');
  }
}
async function importLibrary({ db, client, root, bundle, checked, apply = false, log = console.log }) {
  if (!checked.library.size) fail('Cannot seed an empty instructional library');
  const ids = [...checked.assets.keys()];
  await assertFresh(db, ids);
  for (const asset of checked.assets.values()) {
    const relative = imageName(asset), target = contained(root, relative);
    try {
      await fs.lstat(target);
      const file = await regularInside(root, relative);
      if (await fileDigest(file) !== checked.manifest.files['assets/' + relative]) fail('Destination image file conflicts with the transfer');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', records: checked.manifest.counts }));
  if (!apply) return;
  // Files precede the single DB transaction. A failed import leaves only private,
  // unreferenced files; an explicit retry verifies and reuses those exact bytes.
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  for (const asset of checked.assets.values()) {
    const relative = imageName(asset), target = contained(root, relative);
    try { await fs.copyFile(contained(bundle, 'assets/' + relative), target, require('node:fs').constants.COPYFILE_EXCL); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    const file = await regularInside(root, relative);
    if (await fileDigest(file) !== checked.manifest.files['assets/' + relative]) fail('Destination image checksum differs');
    await fs.chmod(file, 0o600);
  }
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      await assertFresh(db, ids, session);
      for (const owner of OWNERS) {
        const rows = checked.records.filter(row => row.owner === owner).map(row => owner === 'DynamicAssets' ? destinationAsset(row.document, root) : row.document);
        for (let offset = 0; offset < rows.length; offset += 100) {
          await db.collection(collectionMongoName(owner)).insertMany(rows.slice(offset, offset + 100), { session, ordered: true });
          log(JSON.stringify({ stage: 'seed', owner, records: Math.min(offset + 100, rows.length) }));
        }
      }
      await db.collection(collectionMongoName('SparcFigureBrowse')).updateOne({ _id: 'state' },
        { $inc: { revision: 1 }, $setOnInsert: { kind: 'state' } }, { upsert: true, session });
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } finally { await session.endSession(); }
  log(JSON.stringify({ imported: checked.manifest.counts, browseCacheInvalidated: true }));
}

function argumentsFor(args) {
  const [action, ...rest] = args, options = {};
  if (!['export', 'inspect', 'import'].includes(action)) fail('Use export, inspect, or import; see docs/instructional-library-transfer.md');
  for (let index = 0; index < rest.length; index++) {
    const name = rest[index];
    if (name === '--apply') { if (options.apply) fail('Duplicate argument'); options.apply = true; continue; }
    if (!['--bundle', '--settings', '--env-file', '--mongo-url-key', '--database', '--replica-set', '--mongo-driver', '--manifest-sha256'].includes(name)
      || options[name] !== undefined || !rest[index + 1] || rest[index + 1].startsWith('--')) fail('Unknown, duplicate, or missing transfer argument');
    options[name] = rest[++index];
  }
  if (!options['--bundle'] || (options.apply && action !== 'import')) fail('A bundle directory is required; --apply is only valid for import');
  return { action, options };
}
async function main(args) {
  const { action, options } = argumentsFor(args);
  const mongo = options['--mongo-driver'] ? require(path.resolve(options['--mongo-driver'])) : require('mongodb');
  const EJSON = mongo.BSON.EJSON;
  const bundle = path.resolve(options['--bundle']);
  const checked = action !== 'export' ? await readBundle(bundle, options['--manifest-sha256'], EJSON) : undefined;
  if (action === 'inspect') { console.log(JSON.stringify({ verified: true, counts: checked.manifest.counts })); return; }
  const environment = options['--env-file'] ? { ...process.env, ...parseEnv(await fs.readFile(options['--env-file'], 'utf8')) } : process.env;
  const uri = environment[options['--mongo-url-key'] ?? 'MONGO_URL'];
  const databaseName = options['--database'] ?? environment.EXPECTED_MONGO_DB_NAME;
  const replicaSet = options['--replica-set'] ?? environment.MOFACTS_MONGO_REPLICA_SET_NAME;
  if (!uri || !databaseName || !replicaSet || !options['--settings']) fail('Explicit Mongo connection, expected database, replica set, and private settings file are required');
  const settings = JSON.parse(await fs.readFile(options['--settings'], 'utf8'));
  if (settings.storage?.backend !== 'local' || !settings.storage.local?.dynamicAssetsPath) fail('This seed tool requires configured local asset storage');
  const root = path.resolve(settings.storage.local.dynamicAssetsPath);
  const client = new mongo.MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  try {
    await client.connect(); const db = client.db();
    if (db.databaseName !== databaseName || (await db.command({ hello: 1 })).setName !== replicaSet) fail('Connected database or replica set does not match the explicit destination');
    const auth = await db.command({ connectionStatus: 1 });
    if (!auth.authInfo?.authenticatedUsers?.length) fail('An authenticated MongoDB connection is required');
    for (const old of ['sparc_figure_library', 'sparc_move_library']) if (await db.collection(old).findOne({}, { projection: { _id: 1 } })) fail('Deploy the unified instructional library before transferring content');
    const indexes = await db.collection(collectionMongoName('SparcInstructionalLibrary')).listIndexes().toArray();
    if (!indexes.some(index => index.key.kind === 1 && index.key.embeddingVersion === 1
      && index.key['content.video.language'] === 1)) fail('The matching instructional/video library must be initialized by the deployed application first');
    if (action === 'export') {
      const session = client.startSession();
      try {
        session.startTransaction({ readConcern: { level: 'snapshot' } });
        await exportLibrary({ db, session, root, bundle, EJSON, commitSnapshot: () => session.commitTransaction() });
      } finally { await session.endSession(); }
    } else await importLibrary({ db, client, root, bundle, checked, apply: options.apply });
  } finally { await client.close(); }
}
module.exports = { FORMAT, OWNERS, digest, canonical, contained, portableAsset, destinationAsset,
  validateGraph, exportLibrary, readBundle, assertFresh, importLibrary, argumentsFor };
if (require.main === module) main(process.argv.slice(2)).catch(error => {
  // Do not print driver/provider errors, which can contain credentials or records.
  console.error(error instanceof TransferError ? error.message : 'Instructional library transfer failed. Check private connection/settings files, filesystem access, and the deployed runtime; connection details and records are redacted.');
  process.exitCode = 1;
});
