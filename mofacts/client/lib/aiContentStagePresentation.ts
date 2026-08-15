import type {
  AiContentPipelineRun,
  AiContentStageName,
  AiContentStageTrace,
} from '../../common/aiContentContract';

export const AI_CONTENT_STAGE_DESCRIPTIONS: Record<AiContentStageName, string> = {
  'interpret-request': 'Understand the author request and construct one Wikipedia list-search intent.',
  'search-wikipedia': 'Search Wikipedia for authoritative list-page candidates.',
  'select-list-page': 'Select the authoritative Wikipedia list page.',
  'fetch-list-page': 'Retrieve the selected Wikipedia list page.',
  'select-list-region': 'Select the table, list, or gallery containing the requested items.',
  'extract-list-entries': 'Extract the authoritative item list.',
  'select-source-fields': 'Select the source fields used as learner prompts and correct responses.',
  'generate-definition': 'Generate and validate a learner-facing definition.',
  'evaluate-direct-images': 'Evaluate images contained directly in the list entry.',
  'hydrate-direct-images': 'Resolve direct image references through Wikimedia.',
  'hydrate-detail-links': 'Resolve the list entry links to canonical Wikipedia pages.',
  'select-detail-link': 'Select the canonical Wikipedia page for the item.',
  'fetch-detail-page': 'Retrieve the canonical Wikipedia page for the item.',
  'extract-detail-images': 'Find Wikimedia image references on the item page.',
  'hydrate-detail-images': 'Resolve item-page image references through Wikimedia.',
  'evaluate-detail-images': 'Evaluate which item-page image best matches the requested role.',
  'infer-image-filename-pattern': 'Test whether canonical filenames establish a reusable image rule.',
  'resolve-pattern-file-titles': 'Resolve the predicted image filenames through Wikimedia.',
  'match-image-filename-pattern': 'Check the predicted filename for this item.',
  'queue-pattern-fallback': 'Queue this filename exception for individual image resolution.',
  'acquire-image': 'Download, validate, and prepare the selected image.',
};

const TRACE_STATUS_LABELS: Record<AiContentStageTrace['status'], string> = {
  running: 'In progress',
  succeeded: 'Completed',
  unresolved: 'No result; continuing',
  failed: 'Failed',
};

export function aiContentPipelineProgressMessage(run: AiContentPipelineRun): string {
  const trace = run.traces.at(-1);
  if (!trace) return 'Starting the content workflow.';
  const entryIndex = trace.itemId ? run.entries.findIndex(({ itemId }) => itemId === trace.itemId) : -1;
  const item = entryIndex >= 0 ? run.entries[entryIndex] : undefined;
  const itemContext = item
    ? ` Item ${entryIndex + 1} of ${run.entries.length}: ${item.displayedResponse}.`
    : '';
  return `Step ${run.traces.length} — ${TRACE_STATUS_LABELS[trace.status]}: ${AI_CONTENT_STAGE_DESCRIPTIONS[trace.stage]}${itemContext}`;
}
