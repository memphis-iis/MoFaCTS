import { parseCiEvidenceJson } from '../qualification/ciEvidence.mjs';
import { collectionMongoName } from '../../../common/collectionOwnership.ts';
import { AUDIT_VERIFICATIONS, DEFAULT_PUBLICATION_VERIFICATIONS, DYNAMIC_ASSET_HTTP_MOUNTS, NAMED_PUBLICATION_VERIFICATIONS,
  HTTP_AUDIT_VERIFICATIONS, HTTP_FILE_VERIFICATIONS, HTTP_HEALTH_VERIFICATIONS } from '../../../common/securityAudit/verificationCatalog.ts';
import { getManagementRoutePolicies } from '../../../client/lib/adminUi/managementRoutePresentationPolicies.ts';
import { uploadMethodNames } from '../../../packages/ostrio-files/upload-policy.js';

const actors = new Set(['anonymous', 'learnerA', 'learnerB', 'teacherA', 'teacherB', 'admin', 'reset', 'expiry', 'lockout']);
const invalid = () => { throw new Error('Protected probe inventory could not be established; no values were emitted.'); };
const primitiveKind = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;

// Historical fixtures record method names and mounted paths. Resolve them from
// current owners so the metadata diagnostic has no access-policy manifest.
export function legacyProbeSubjectNames() {
  const endpoints = [...Object.values(HTTP_AUDIT_VERIFICATIONS), ...Object.values(HTTP_FILE_VERIFICATIONS),
    ...HTTP_HEALTH_VERIFICATIONS.endpoints];
  const mounts = endpoints.map(row => /^http:[a-z]+:(\/.*?)(?:\/:token\/:filename)?$/.exec(row.surfaceId)?.[1]).filter(Boolean);
  return {
    methods: [...AUDIT_VERIFICATIONS.filter(row => row.kind === 'integrationTest' && row.surfaceId === `method:${row.method}`).map(row => row.method),
      ...Object.values(uploadMethodNames(collectionMongoName('DynamicAssets')))],
    publications: [...Object.keys(NAMED_PUBLICATION_VERIFICATIONS), ...Object.values(DEFAULT_PUBLICATION_VERIFICATIONS).map(row => row.surfaceId)],
    httpRoutes: [...new Set([...mounts, ...Object.values(DYNAMIC_ASSET_HTTP_MOUNTS)])],
    managementRoutes: getManagementRoutePolicies().map(({ routeName, path }) => `${routeName}|${path}`),
  };
}

// Diagnostic only: names come from public source, values never from protected
// arguments/URLs/canaries. Unresolved cases are retained, never declared policy.
export function legacyProbeInventory(bytes, subjects = legacyProbeSubjectNames()) {
  try {
    const fixture = parseCiEvidenceJson(bytes, 65536);
    if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture)) invalid();
    const methods = new Set(subjects.methods);
    const publications = new Set(subjects.publications);
    const http = subjects.httpRoutes.filter(name => typeof name === 'string' && name.startsWith('/'));
    const routes = subjects.managementRoutes.filter(name => typeof name === 'string' && name.includes('|'));
    const families = {}, seen = new Set();
    let total = 0;
    for (const [family, key, subjectKey] of [['method', 'authorizationProbes', 'method'],
      ['publication', 'publicationProbes', 'publication'], ['route', 'routeProbes', 'path'], ['download', 'downloadProbes', 'path']]) {
      const probes = fixture[key];
      if (!Array.isArray(probes) || !probes.length || probes.length > 512) invalid();
      families[family] = probes.map((probe, index) => {
        if (!probe || !actors.has(probe.actor) || typeof probe[subjectKey] !== 'string'
          || !probe[subjectKey].length || probe[subjectKey].length > 2048) invalid();
        const identity = family + '\0' + probe.actor + '\0' + probe[subjectKey];
        if (seen.has(identity)) invalid(); seen.add(identity);
        if (probe.args !== undefined && !Array.isArray(probe.args) || probe.args?.length > 32) invalid();
        const expectation = probe[family === 'publication' ? 'expectError' : 'expectDenied'];
        const row = { index, actorAlias: probe.actor, argumentKinds: (probe.args || []).map(primitiveKind),
          legacyExpectation: typeof expectation === 'boolean' ? expectation ? 'deny' : 'allow' : 'unspecified' };
        if (family === 'method' || family === 'publication') {
          const known = (family === 'method' ? methods : publications).has(probe[subjectKey]);
          row.surfaceResolution = known ? 'current-source-subject' : 'unresolved';
          if (known) row.surfaceId = (family === 'method' ? 'method:' : 'publication:') + probe[subjectKey];
          if (family === 'publication') row.otherUserCanaryPresent = typeof probe.otherUserCanary === 'string' && probe.otherUserCanary.length > 0;
        } else {
          const value = new URL(probe.path, 'https://fixture.invalid');
          if (value.username || value.password || !['http:', 'https:'].includes(value.protocol)) invalid();
          row.absoluteUrl = /^https?:\/\//.test(probe.path);
          row.queryBindingsPresent = Boolean(value.search);
          row.sourceRouteCandidates = family === 'route'
            ? routes.filter(name => name.slice(name.indexOf('|') + 1) === value.pathname)
            : http.filter(prefix => value.pathname === prefix || value.pathname.startsWith(prefix.endsWith('/') ? prefix : prefix + '/'));
          row.sourceResolution = row.sourceRouteCandidates.length === 1 ? 'single-source-candidate' : 'unresolved';
        }
        return row;
      });
      total += probes.length; if (total > 1024) invalid();
    }
    const unresolvedSubjectCount = Object.values(families).flat()
      .filter(row => row.surfaceResolution === 'unresolved' || row.sourceResolution === 'unresolved').length;
    const inventory = { schema: 'LegacyAuthenticationProbeInventoryV1', purpose: 'source-review-only-not-authoritative-policy',
      total, unresolvedSubjectCount, families };
    if (Buffer.byteLength(JSON.stringify(inventory)) > 65536) invalid();
    return inventory;
  } catch { invalid(); }
}
