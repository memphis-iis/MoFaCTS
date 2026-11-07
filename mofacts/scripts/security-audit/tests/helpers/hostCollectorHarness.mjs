// Root-only fixtures use rewritten fixed paths in one private owned directory.
// All service commands are synthetic; no real Docker socket/service is accessed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseHostObservationBytes } from '../../../../common/securityAudit/hostObservations.ts';
import { ACTIVE_AUDIT_CATALOG, readAuditCatalog } from '../../../../common/securityAudit/catalogRegistry.ts';
import { evaluateHostObservations } from '../../internal/evaluateHost.mjs';

assert.equal(process.getuid(), 0);
assert.equal(spawnSync('jq', ['--version']).status, 0, 'Fixture requires existing jq');
const repository = fileURLToPath(new URL('../../../../../', import.meta.url));
const source = path.join(repository, 'deploy/security-audit');
const root = fs.mkdtempSync('/root/mofacts-host-observations-fixture-');
fs.chmodSync(root, 0o700);
const config = {
  MOFACTS_APP_CONTAINER: 'app', MOFACTS_MONGO_CONTAINER: 'mongo', MOFACTS_REDIS_CONTAINER: 'redis',
  MOFACTS_MONGO_DB: 'fixture', MOFACTS_MONGO_REPLICA_SET: 'fixture-rs', MOFACTS_MONGO_ADMIN_USER: 'observer',
  MOFACTS_MONGO_ADMIN_PASSWORD: 'synthetic-private-marker', MOFACTS_MONGO_APP_USER: 'learner-app',
  MOFACTS_MONGO_APP_PASSWORD: 'synthetic-private-marker', MOFACTS_MONGO_SIDECAR_USER: 'reserved-helper',
  MOFACTS_MONGO_APP_ROLE: 'readWrite', MOFACTS_SIDECAR_EXPECTED_STATE: 'absent',
  MOFACTS_REDIS_PASSWORD: 'synthetic-private-marker', MOFACTS_MANAGEMENT_CIDRS: '100.64.0.0/10',
  MOFACTS_SSH_MANAGEMENT_INTERFACE: 'tailscale0', MOFACTS_PUBLIC_HOSTNAME: 'fixture.example.org',
  APACHE_HTTPS_SITE_FILE: path.join(root, 'site.conf'),
};
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
let cases = 0;
try {
  const bin = path.join(root, 'bin'); fs.mkdirSync(bin, { mode: 0o700 });
  for (const name of ['host-listener-policy.awk', 'host-firewall-policy.awk', 'host-apache-policy.awk',
    'host-sidecar-policy.jq', 'host-mongo-roles.js', 'host-mongo-connectivity.js']) {
    fs.copyFileSync(path.join(source, name), path.join(root, name));
    fs.chownSync(path.join(root, name), 0, 0); fs.chmodSync(path.join(root, name), 0o644);
  }
  fs.copyFileSync(path.join(repository, 'deploy/mongodb/read-default-concern-role.json'), path.join(root, 'read-default-concern-role.json'));
  fs.copyFileSync(path.join(repository, 'mofacts/common/securityAudit/catalogs/host-measurements.v1.json'), path.join(root, 'host-measurements.v1.json'));
  for (const file of ['read-default-concern-role.json', 'host-measurements.v1.json']) {
    fs.chownSync(path.join(root, file), 0, 0); fs.chmodSync(path.join(root, file), 0o644);
  }
  const constants = { CONFIG_FILE: 'config', DESCRIPTOR_FILE: 'host-measurements.v1.json', LISTENER_POLICY_FILE: 'host-listener-policy.awk',
    FIREWALL_POLICY_FILE: 'host-firewall-policy.awk', APACHE_POLICY_FILE: 'host-apache-policy.awk', SIDECAR_POLICY_FILE: 'host-sidecar-policy.jq',
    MONGO_ROLE_PROBE_FILE: 'host-mongo-roles.js', MONGO_CONNECTIVITY_FILE: 'host-mongo-connectivity.js', READ_CONCERN_ROLE_FILE: 'read-default-concern-role.json' };
  const script = fs.readFileSync(path.join(source, 'host-observations.sh'), 'utf8').split('\n').map(line => {
    const key = line.split('=', 1)[0]; return Object.hasOwn(constants, key) ? key + '=' + quote(path.join(root, constants[key])) : line;
  }).join('\n');
  fs.writeFileSync(path.join(root, 'collector.sh'), script, { mode: 0o755 });
  for (const file of [root, path.join(root, 'host-measurements.v1.json')]) {
    const stat = fs.lstatSync(file);
    assert.equal(stat.uid, 0, 'Fixture owner'); assert.equal(stat.gid, 0, 'Fixture group');
    assert.equal(stat.mode & 0o777, file === root ? 0o700 : 0o644, 'Fixture mode');
  }
  fs.writeFileSync(path.join(root, 'site.conf'), '<VirtualHost *:443>\nServerName fixture.example.org\nProxyPass / http://127.0.0.1:3000/\nProxyPass /websocket ws://127.0.0.1:3000/websocket\n</VirtualHost>\n');
  const command = `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path');
const r=process.env.FIXTURE_ROOT,s=JSON.parse(fs.readFileSync(path.join(r,'scenario')));
const a=process.argv.slice(2),name=path.basename(process.argv[1]);
const emit=v=>process.stdout.write(String(v)+'\\n');
if(name==='ss') {if(s.ssError)process.exit(1);emit(s.ssRaw??('tcp LISTEN 0 10 127.0.0.1:3000 0.0.0.0:*'+(s.listener?'\\n'+s.listener:'')));}
else if(name==='ufw') {if(s.ufwError)process.exit(1); if(a[0]==='status')emit('Status: active\\nDefault: deny (incoming)');
  else emit('ufw allow 80/tcp\\nufw allow 443/tcp\\nufw allow in on tailscale0 from 100.64.0.0/10 to any port 22 proto tcp');}
else if(name==='systemctl') {if(s.serviceError)process.exit(1);if(s.apacheInactive){emit('inactive');process.exit(3);}emit('active');}
else if(name==='apache2ctl') {if(s.apacheError)process.exit(1);if(a[0]==='configtest'&&s.apacheSyntaxError){process.stderr.write('AH00526: Syntax error on line 1\\n');process.exit(1);}process.stderr.write(a[0]==='configtest'?'Syntax OK\\n':'*:443 fixture.example.org ('+path.join(r,'site.conf')+':1)\\n');}
else if(name==='docker') {
 if(a[0]==='container'&&a[1]==='ls') {emit('1'.repeat(64));}
 else if(a[0]==='container'&&a[1]==='inspect') {
  emit(JSON.stringify({id:'1'.repeat(64),service:s.helper?'mongo-mcp':null,imageTitle:null,exposedPorts:null,bindings:null,networkPorts:null}));
 } else if(a[0]==='inspect') {
  const c=a.at(-1);if(s.inspectError===c)process.exit(1);
  const binding={HostIp:s.publicApp?'0.0.0.0':'127.0.0.1',HostPort:'3000'};
  const ports=c==='app'&&!s.missingAppBinding?{'3000/tcp':s.duplicateAppBinding?[binding,binding]:[binding]}:{};
  emit(JSON.stringify({ports,networkMode:'fixture-private'}));
 } else if(a[0]==='exec') {
  if(a.includes('mongosh')) {
   fs.readFileSync(0,'utf8');
   const arg=a.find(v=>v.startsWith('MOFACTS_AUDIT_MONGO_CONNECTIVITY='));
   if(arg) {const p=JSON.parse(arg.slice(arg.indexOf('=')+1));
    if(s.mongoError===p.operation)process.exit(70);
    if(p.username==='reserved-helper')fs.writeFileSync(path.join(r,'helper-auth-called'),'called');
    emit(JSON.stringify({state:'observed',value:p.operation==='unauthenticated'?!!s.mongoAnonymous:true}));
   } else {if(s.roleRaw!==undefined)emit(s.roleRaw);else emit(JSON.stringify({state:'observed',appRolesExact:!s.roleMismatch,readConcernRoleExact:true,sidecarUserAbsent:true}));process.exit(s.roleMismatch?3:0);}
  } else if(a.includes('redis-cli')) {if(s.redisError)process.exit(1);emit(a.some(v=>v.startsWith('REDISCLI_AUTH='))||s.redisAnonymous?'PONG':'NOAUTH Authentication required.');}
  else if(a.includes('node')) {if(s.appRedisError)process.exit(70);emit('connected');}
  else process.exit(1);
 } else process.exit(1);
} else process.exit(1);
`;
  for (const name of ['ss', 'ufw', 'systemctl', 'apache2ctl', 'docker']) fs.writeFileSync(path.join(bin, name), command, { mode: 0o755 });
  const catalog = await readAuditCatalog(ACTIVE_AUDIT_CATALOG, 'ingestion');
  async function run(scenario = {}, changes = {}, options = {}) {
    const values = { ...config, ...changes };
    fs.writeFileSync(path.join(root, 'config'), Object.entries(values).filter(([,v]) => v !== null).map(([k,v]) => k + '=' + quote(v)).join('\n') + '\n');
    fs.chmodSync(path.join(root, 'config'), options.mode ?? 0o600);
    fs.writeFileSync(path.join(root, 'scenario'), JSON.stringify(scenario));
    fs.rmSync(path.join(root, 'helper-auth-called'), { force: true });
    const result = spawnSync('bash', [path.join(root, 'collector.sh'), ...(options.args ?? [])], { encoding: 'utf8', timeout: 25000,
      env: { ...process.env, SSH_ORIGINAL_COMMAND: options.original ?? '', PATH: bin + ':' + process.env.PATH, FIXTURE_ROOT: root,
        MOFACTS_MONGO_APP_USER: 'ambient-user-must-not-win' }, maxBuffer: 100000 });
    assert.equal((result.stdout + result.stderr).includes('synthetic-private-marker'), false);
    assert.equal(result.status, options.exit ?? 0, result.stderr + result.stdout + '\nDescriptor assignment: '
      + script.split('\n').find(line => line.startsWith('DESCRIPTOR_FILE=')));
    cases++;
    if (options.exit) return undefined;
    assert.equal(result.stderr, '', 'Only bounded observations may be emitted');
    const envelope = await parseHostObservationBytes(Buffer.from(result.stdout), new Date());
    const evaluated = await evaluateHostObservations(catalog, 'full', envelope, new Date());
    assert.equal(fs.existsSync(path.join(root, 'helper-auth-called')), false, 'Absent helper must never be authenticated');
    return { envelope, controls: Object.fromEntries(evaluated.controls.map(row => [row.controlId, row])) };
  }
  const safe = await run(); assert(Object.values(safe.controls).every(row => row.status === 'PASS'));
  for (const scenario of [{ missingAppBinding: true }, { duplicateAppBinding: true }]) {
    const result = await run(scenario);
    assert.equal(result.controls['internal.docker-ports'].status, 'FAIL');
    assert.equal(result.controls['internal.app-loopback'].status, 'PASS');
  }
  for (const [scenario, key] of [[{ apacheInactive: true }, 'apacheActive'], [{ apacheSyntaxError: true }, 'apacheConfigValid']]) {
    const result = await run(scenario);
    assert.equal(result.controls['internal.reverse-proxy-routes'].status, 'FAIL');
    assert.equal(result.envelope.observations.proxy[key].value, false);
    assert.equal(result.envelope.observations.proxy.configuredHostMatched.value, true);
  }
  for (const scenario of [{ serviceError: true }, { apacheError: true }]) {
    const result = await run(scenario);
    assert.equal(result.controls['internal.reverse-proxy-routes'].status, 'ERROR');
  }
  await run({}, {}, { args: ['ignored'], exit: 64 });
  await run({}, {}, { original: 'sh', exit: 64 });
  const unsafe = await run({}, {}, { mode: 0o644 }); assert.equal(unsafe.controls['internal.audit-config'].status, 'FAIL');
  const incomplete = await run({}, { MOFACTS_REDIS_PASSWORD: null }); assert.equal(incomplete.controls['internal.audit-config'].status, 'FAIL');
  const badConfig = await run({}, { MOFACTS_MONGO_APP_USER: 'observer' }); assert.equal(badConfig.controls['internal.audit-config'].status, 'ERROR');
  const helper = await run({ helper: true }); assert.equal(helper.controls['internal.sidecar-loopback'].status, 'FAIL');
  const noSockets = await run({ ssError: true }); assert.equal(noSockets.controls['internal.app-loopback'].status, 'ERROR');
  const listener = await run({ listener: 'udp UNCONN 0 0 0.0.0.0:27017 0.0.0.0:*' });
  assert.equal(listener.envelope.observations.listeners.unexpectedSensitiveUdpListenerCount.value, 1);
  assert.equal(listener.controls['internal.listening-sockets.sensitive'].status, 'FAIL');
  const partialDocker = await run({ inspectError: 'redis', publicApp: true }); assert.equal(partialDocker.controls['internal.docker-ports'].status, 'FAIL');
  const redis = await run({ redisAnonymous: true, appRedisError: true }); assert.equal(redis.controls['internal.redis-auth'].status, 'FAIL');
  assert.equal(redis.envelope.observations.redis.applicationConnectivity.state, 'unavailable');
  const mongo = await run({ mongoAnonymous: true, mongoError: 'replica' }); assert.equal(mongo.controls['internal.mongodb-auth.unauthenticated-access'].status, 'FAIL');
  const role = await run({ roleMismatch: true, mongoError: 'replica' }); assert.equal(role.controls['internal.mongodb-auth.scoped-roles'].status, 'FAIL');
  for (const raw of ['not-json', '{}', '[]\n[]', 'x'.repeat(257), '{"state":"observed"}\u0000']) {
    const result = await run({ roleRaw: raw }); assert.equal(result.envelope.observations.mongoRoles.applicationGrantsMatched.state, 'unavailable');
  }
  for (const raw of ['x'.repeat(1048577), 'tcp LISTEN 0 10 127.0.0.1:3000 0.0.0.0:*\u0000']) {
    const result = await run({ ssRaw: raw }); assert.equal(result.controls['internal.app-loopback'].status, 'ERROR');
  }
  console.log(`V2 host collector fixtures passed (${cases} cases).`);
} finally { fs.rmSync(root, { recursive: true, force: true }); }
