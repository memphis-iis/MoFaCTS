import { isRecord } from './protocol.ts';

export type SimulationAssetReference = { url: string; sha256: string };
export type SimulationAsset = SimulationAssetReference & { catalog: SimulationAssetReference; attachments?: SimulationAssetReference[] };
const packageName = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}(?:\?[A-Za-z0-9=&._%-]{1,100})?$/;
const storedAsset = /^\/dynamic-assets\/[A-Za-z0-9_-]+\/[A-Za-z0-9][A-Za-z0-9._-]{0,199}(?:\?[A-Za-z0-9=&._%-]{1,100})?$/;
export function validateSimulationAsset(input: unknown, resolved = false): SimulationAsset {
  if (!isRecord(input) || !isRecord(input.catalog)) throw new Error('Simulation requires packaged HTML and catalog assets');
  if (input.attachments !== undefined && (!Array.isArray(input.attachments) || input.attachments.length > 16)) throw new Error('Invalid simulation attachments');
  for (const entry of [input, input.catalog, ...(input.attachments as unknown[] || [])]) {
    if (!isRecord(entry)) throw new Error('Invalid simulation attachment');
    if (typeof entry.url !== 'string' || !(resolved ? storedAsset : packageName).test(entry.url)
      || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid packaged simulation asset');
  }
  return input as SimulationAsset;
}
export function simulationAssetReferences(asset: SimulationAsset): SimulationAssetReference[] {
  return [asset, asset.catalog, ...(asset.attachments || [])];
}
export function simulationNodes(input: unknown): Array<Record<string, any>> {
  const result: Array<Record<string, any>> = [];
  const seen = new WeakSet<object>();
  function visit(value: unknown) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (isRecord(value) && value.atomType === 'simulation') result.push(value);
    for (const child of Object.values(value)) visit(child);
  }
  visit(input);
  return result;
}
export function validateSimulationCatalog(input: unknown, buildId: string, artifactSha256: string): asserts input is { addresses: unknown[] } & Record<string, unknown> {
  if (!isRecord(input) || input.version !== 1 || input.buildId !== buildId || input.artifactSha256 !== artifactSha256
    || input.protocolVersion !== 3 || !Array.isArray(input.addresses)) throw new Error('Simulation catalog identity mismatch');
}

// HTML assets execute in a unique opaque origin, including on direct navigation.
// This is shared platform policy, not lesson-specific hosting configuration.
export const SIMULATION_HTML_CSP = "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src data: blob:; worker-src blob:; frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
