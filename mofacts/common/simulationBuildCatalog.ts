import { isRecord } from '../../packages/phet-monitor/protocol';

export type ApprovedSimulationBuild = { id: string; url: string; sha256: string; catalog: { url: string; sha256: string } };
export function approvedSimulationBuild(input: unknown, id: string): ApprovedSimulationBuild {
  if (!Array.isArray(input)) throw new Error('Configure public.simulationBuilds before launching a simulation');
  const matches = input.filter(entry => isRecord(entry) && entry.id === id);
  if (matches.length !== 1) throw new Error('Simulation build is not uniquely approved');
  const build = matches[0] as Record<string, unknown>;
  if (typeof build.url !== 'string' || typeof build.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(build.sha256)) throw new Error('Invalid approved simulation artifact');
  const url = new URL(build.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('Invalid simulation URL');
  if (!isRecord(build.catalog) || typeof build.catalog.url !== 'string' || typeof build.catalog.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(build.catalog.sha256)) throw new Error('Approved simulation requires its hashed build catalog');
  const catalogUrl = new URL(build.catalog.url);
  if (catalogUrl.origin !== url.origin || catalogUrl.username || catalogUrl.password || catalogUrl.hash) throw new Error('Invalid simulation catalog URL');
  return { id, url: url.href, sha256: build.sha256, catalog: { url: catalogUrl.href, sha256: build.catalog.sha256 } };
}
