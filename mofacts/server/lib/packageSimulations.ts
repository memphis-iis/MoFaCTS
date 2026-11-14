import { readFile } from 'node:fs/promises';
import { simulationNodes, simulationAssetReferences, validateSimulationAsset, validateSimulationCatalog } from '../../../packages/phet-monitor/assets';
import { validateSimulationConfig } from '../../../packages/phet-monitor/lesson';
import type { UploadedPackageFile } from './packageParser';

/** Validate the complete package before any content/asset persistence. */
export async function validatePackagedSimulations(files: UploadedPackageFile[]): Promise<void> {
  for (const stimulus of files.filter(file => file.type === 'stim')) {
    for (const node of simulationNodes(stimulus.contents)) {
      const config = validateSimulationConfig(node.simulation);
      const asset = validateSimulationAsset(config.asset);
      for (const reference of simulationAssetReferences(asset)) {
        const matches = files.filter(file => file.type === 'media' && file.name.toLowerCase() === reference.url.split('?')[0]!.toLowerCase());
        if (matches.length !== 1 || !matches[0]!.source) throw new Error(`Missing or ambiguous simulation asset: ${reference.url}`);
        if (matches[0]!.source!.size > (reference === asset ? 64 : reference === asset.catalog ? 8 : 512) * 1024 * 1024) throw new Error('Simulation asset exceeds size limit');
        if (matches[0]!.source!.sha256 !== reference.sha256) throw new Error(`Simulation asset hash mismatch: ${reference.url}`);
      }
      if (!/\.html$/i.test(asset.url.split('?')[0]!)) throw new Error('Simulation entry must be packaged HTML');
      const catalog = JSON.parse(await readFile(files.find(file => file.name.toLowerCase() === asset.catalog.url.split('?')[0]!.toLowerCase())!.source!.path, 'utf8'));
      validateSimulationCatalog(catalog, config.buildId, asset.sha256);
      for (const binding of config.bindings) {
        if (!catalog.addresses.some((entry: any) => entry.coverage === 'observed' && (binding.address.path ? entry.path === binding.address.path : entry.tandem === binding.address.tandem))) throw new Error(`Binding absent from simulation catalog: ${binding.name}`);
      }
    }
  }
}

/** Resolve only assets written by this upload, scoped to this stimulus set. */
export function resolvePackagedSimulations(stimuli: unknown, paths: Map<string, string> | undefined): void {
  for (const node of simulationNodes(stimuli)) {
    const asset = validateSimulationAsset(node.simulation.asset);
    for (const reference of simulationAssetReferences(asset)) {
      const [filename, query] = reference.url.split('?');
      const canonical = paths?.get(filename!.toLowerCase());
      const match = canonical?.match(/^\/cdn\/storage\/Assets\/([A-Za-z0-9_-]+)\/original\/[^/?#]+$/);
      if (!match) throw new Error(`Simulation asset was not stored by this package upload: ${reference.url}`);
      reference.url = `/dynamic-assets/${match[1]}/${filename}${query ? `?${query}` : ''}`;
    }
  }
}

/** Declared simulation dependencies belong only to the lessons referencing them.
 * Ordinary package media retains its existing scope behavior. Shared dependencies
 * accumulate all their declaring lesson scopes. No simulation names are special. */
export function packagedSimulationMediaScopes(files: UploadedPackageFile[], stimulusScopesByName: Map<string, Set<string | number>>) {
  const result = new Map<string, Set<string | number>>();
  for (const file of files.filter(file => file.type === 'stim')) {
    const key = file.name.replace(/\\/g, '/').replace(/^\.\//, '').trim().toLowerCase();
    for (const node of simulationNodes(file.contents)) {
      for (const reference of simulationAssetReferences(validateSimulationAsset(node.simulation.asset))) {
        const name = reference.url.split('?')[0]!.toLowerCase();
        const scopes = result.get(name) ?? new Set<string | number>();
        const owners = stimulusScopesByName.get(key);
        if (!owners?.size) throw new Error(`Simulation stimulus has no persisted scope: ${file.name}`);
        for (const owner of owners) scopes.add(owner);
        result.set(name, scopes);
      }
    }
  }
  return result;
}
