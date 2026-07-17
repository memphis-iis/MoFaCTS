import {
  parseOpenRouterModelCatalog,
  type OpenRouterModelCatalogEntry,
} from '../../common/lib/openRouterModelCatalog';
import { meteorCallAsync } from './meteorAsync';

type MeteorCallAsync = (...args: unknown[]) => Promise<unknown>;

export function createOpenRouterModelCatalogLoader(callAsync: MeteorCallAsync) {
  return async function loadCatalog(): Promise<OpenRouterModelCatalogEntry[]> {
    const value = await callAsync('getOpenRouterModelCatalog');
    return parseOpenRouterModelCatalog(value);
  };
}

export const loadOpenRouterModelCatalog = createOpenRouterModelCatalogLoader(meteorCallAsync);
