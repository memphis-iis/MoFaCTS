import { simulationNodes, validateSimulationAsset } from '../../packages/phet-monitor/assets';
import { validateSimulationConfig } from '../../packages/phet-monitor/lesson';
import { isRecord } from '../../packages/phet-monitor/protocol';

/** Telemetry may run only the simulation actually attached to this lesson/node. */
export function requirePackagedSimulation(lesson: unknown, scope: { pageKey: string; nodeId: string; buildId: string }) {
  const pages = isRecord(lesson) && isRecord(lesson.rawStimuliFile) && isRecord(lesson.rawStimuliFile.setspec) ? lesson.rawStimuliFile.setspec.sparcPages : undefined;
  if (!Array.isArray(pages)) throw new Error('Lesson has no packaged simulation pages');
  const matches = pages.filter(page => isRecord(page) && page.pageId === scope.pageKey).flatMap(page => simulationNodes(page.display)).filter(node => node.id === scope.nodeId);
  if (matches.length !== 1) throw new Error('Simulation node is missing or ambiguous in this lesson');
  const config = validateSimulationConfig(matches[0]!.simulation);
  validateSimulationAsset(config.asset, true);
  if (config.buildId !== scope.buildId) throw new Error('Simulation build is not approved by this lesson');
  return config;
}
