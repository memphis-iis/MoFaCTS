import { expect } from 'chai';
import type { AiContentStageCaller } from './aiContentOpenRouterClient';
import { runAiContentPipeline } from './aiContentPipeline';

const STATES = ['Georgia', 'Alabama', 'Arizona', 'Alaska'] as const;
const PAGE_IDS: Record<string, number> = { Georgia: 201, Alabama: 202, Arizona: 203, Alaska: 204 };
function listHtml(states: readonly string[]): string {
  return `<div class="mw-parser-output"><h2>States</h2><table class="wikitable">
  <tr><th>State</th></tr>
  ${states.map((state) => `<tr><td><a href="/wiki/${state}" title="${state}">${state}</a></td></tr>`).join('')}
</table></div>`;
}

function detailHtml(fileTitle: string): string {
  return `<div class="mw-parser-output"><aside class="infobox"><a href="/wiki/${fileTitle.replaceAll(' ', '_')}" title="${fileTitle}"><img alt="Outline state map"></a></aside></div>`;
}

function imagePage(pageid: number, title: string): unknown {
  return {
    pageid,
    title,
    imageinfo: [{
      url: `https://upload.wikimedia.org/${pageid}.svg`,
      thumburl: `https://upload.wikimedia.org/thumb/${pageid}.png`,
      descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
      width: 640,
      height: 480,
      mime: 'image/svg+xml',
      extmetadata: {
        LicenseShortName: { value: 'CC BY-SA 4.0' },
        LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' },
        Artist: { value: 'Fixture author' },
        ImageDescription: { value: `Outline map ${title}` },
      },
    }],
  };
}

function response(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
}

function fixtureFetcher(fetchedDetailPageIds: number[], states: readonly string[] = STATES): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === 'upload.wikimedia.org') {
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } });
    }
    if (url.searchParams.get('generator') === 'search') {
      return response({ query: { pages: [{
        pageid: 100,
        title: 'List of U.S. states',
        fullurl: 'https://en.wikipedia.org/?curid=100',
        extract: 'A list of states.',
        index: 1,
      }] } });
    }
    if (url.searchParams.get('action') === 'parse') {
      const pageId = Number(url.searchParams.get('pageid'));
      if (pageId === 100) return response({ parse: { pageid: 100, title: 'List of U.S. states', text: listHtml(states) } });
      fetchedDetailPageIds.push(pageId);
      const state = states.find((name) => PAGE_IDS[name] === pageId)!;
      const fileTitle = state === 'Alaska'
        ? 'File:Alaska in United States (US49+1).svg'
        : `File:${state} in United States.svg`;
      return response({ parse: { pageid: pageId, title: state, text: detailHtml(fileTitle) } });
    }
    const titles = String(url.searchParams.get('titles') || '');
    if (url.searchParams.get('prop') === 'info') {
      const state = states.find((name) => titles.includes(name))!;
      return response({ query: { pages: [{ pageid: PAGE_IDS[state], title: state, fullurl: `https://en.wikipedia.org/?curid=${PAGE_IDS[state]}` }] } });
    }
    if (url.searchParams.get('prop') === 'imageinfo' && url.searchParams.get('redirects') === '1') {
      const predictedPages = states.flatMap((state, index) => {
        const predictedTitle = `File:${state} in United States.svg`;
        if (!titles.includes(predictedTitle)) return [];
        return [state === 'Alaska'
          ? { title: predictedTitle, missing: true }
          : imagePage(500 + index, predictedTitle)];
      });
      return response({ query: { pages: predictedPages } });
    }
    if (url.searchParams.get('prop') === 'imageinfo') {
      const state = states.find((name) => titles.includes(name))!;
      const fileTitle = state === 'Alaska'
        ? 'File:Alaska in United States (US49+1).svg'
        : `File:${state} in United States.svg`;
      return response({ query: { pages: [imagePage(300 + states.indexOf(state), fileTitle)] } });
    }
    throw new Error(`Unexpected fixture request: ${url.toString()}`);
  }) as typeof fetch;
}

function stageResult(parsedContent: unknown) {
  return {
    parsedContent,
    request: { provider: { require_parameters: true, allow_fallbacks: false } },
    rawContent: JSON.stringify(parsedContent),
    responseBody: null,
    usage: null,
    costUsd: null,
    model: 'openai/test',
    reasoningLevel: 'medium' as const,
  };
}

describe('AI Content deterministic filename-pattern pipeline', function() {
  it('uses one validated image plus a later canonical filename, resolves regular titles without AI, and defers an exception', async function() {
    const evaluatedItems: string[] = [];
    const fetchedDetailPageIds: number[] = [];
    const caller: AiContentStageCaller = async (call) => {
      if (call.stage === 'interpret-request') return stageResult({
        promptType: 'image',
        responseType: 'text',
        subject: 'U.S. states',
        listSearchQuery: 'list of U.S. states outline maps',
        imageRequirement: 'plain outline map of the state in the United States',
      });
      if (call.stage === 'select-list-page') {
        return stageResult({ selectedCandidateId: 'list-page-100', rationale: 'The supplied page is the state list.' });
      }
      if (call.stage === 'evaluate-detail-images') {
        evaluatedItems.push(String(call.itemId));
        const candidateId = (((call.schema.properties as any).rankedCandidateIds.items.enum as string[])[0]);
        return stageResult({ rankedCandidateIds: [candidateId], selectedCandidateId: candidateId, rationale: 'The outline map matches.' });
      }
      throw new Error(`Unexpected AI stage ${call.stage}`);
    };

    const result = await runAiContentPipeline({
      notes: 'Create image prompts for the U.S. states using plain outline maps.',
      mode: 'learning',
      model: 'openai/test',
      reasoningLevel: 'medium',
      stageCaller: caller,
      fetcher: fixtureFetcher(fetchedDetailPageIds),
      converter: async () => ({ bytes: new Uint8Array([7, 8]), width: 640, height: 480 }),
    });

    expect(result.pairs.map(({ response }) => response)).to.deep.equal([...STATES]);
    expect(result.run.resolutions.map(({ sourcePath }) => sourcePath))
      .to.deep.equal(['detail-page', 'filename-pattern', 'filename-pattern', 'detail-page']);
    expect(evaluatedItems).to.deep.equal(['item-100-1-1', 'item-100-1-4']);
    expect(fetchedDetailPageIds).to.deep.equal([201, 202, 204]);
    expect(result.run.imageFilenamePattern).to.include({
      prefix: 'File:',
      suffix: ' in United States.svg',
      seedSourcePath: 'detail-page',
    });
    expect(result.run.imageFilenamePattern?.seedResponses).to.deep.equal(['Georgia', 'Alabama']);
    expect(result.run.resolutions[2]?.filenamePatternId).to.equal(result.run.imageFilenamePattern?.patternId);
    const arizonaMatch = result.run.traces.find(({ stage, itemId }) => stage === 'match-image-filename-pattern' && itemId === 'item-100-1-3');
    const alaskaFallback = result.run.traces.find(({ stage, itemId }) => stage === 'queue-pattern-fallback' && itemId === 'item-100-1-4');
    expect(arizonaMatch?.status).to.equal('succeeded');
    expect(alaskaFallback?.status).to.equal('unresolved');
  });

  it('retries an unresolved seeding item after the complete pattern pass', async function() {
    const states = ['Alabama', 'Alaska', 'Arizona', 'Georgia'] as const;
    const evaluatedItems: string[] = [];
    const fetchedDetailPageIds: number[] = [];
    let alaskaEvaluations = 0;
    const caller: AiContentStageCaller = async (call) => {
      if (call.stage === 'interpret-request') return stageResult({
        promptType: 'image',
        responseType: 'text',
        subject: 'U.S. states',
        listSearchQuery: 'list of U.S. states outline maps',
        imageRequirement: 'plain outline map of the state in the United States',
      });
      if (call.stage === 'select-list-page') {
        return stageResult({ selectedCandidateId: 'list-page-100', rationale: 'The supplied page is the state list.' });
      }
      if (call.stage === 'evaluate-detail-images') {
        evaluatedItems.push(String(call.itemId));
        if (call.itemId === 'item-100-1-2') {
          alaskaEvaluations += 1;
          if (alaskaEvaluations === 1) throw new Error('AI response did not include a valid JSON value.');
        }
        const candidateId = (((call.schema.properties as any).rankedCandidateIds.items.enum as string[])[0]);
        return stageResult({ rankedCandidateIds: [candidateId], selectedCandidateId: candidateId, rationale: 'The outline map matches.' });
      }
      throw new Error(`Unexpected AI stage ${call.stage}`);
    };

    const result = await runAiContentPipeline({
      notes: 'Create image prompts for the U.S. states using plain outline maps.',
      mode: 'learning',
      model: 'openai/test',
      reasoningLevel: 'medium',
      stageCaller: caller,
      fetcher: fixtureFetcher(fetchedDetailPageIds, states),
      converter: async () => ({ bytes: new Uint8Array([7, 8]), width: 640, height: 480 }),
    });

    expect(result.pairs.map(({ response }) => response)).to.deep.equal([...states]);
    expect(result.run.resolutions.map(({ sourcePath }) => sourcePath))
      .to.deep.equal(['detail-page', 'detail-page', 'filename-pattern', 'filename-pattern']);
    expect(result.run.imageFilenamePattern?.seedResponses).to.deep.equal(['Alabama', 'Arizona']);
    expect(evaluatedItems).to.deep.equal([
      'item-100-1-1',
      'item-100-1-2',
      'item-100-1-2',
    ]);
    expect(fetchedDetailPageIds).to.deep.equal([202, 204, 203, 204]);
    const alaskaQueues = result.run.traces.filter(({ stage, itemId }) => stage === 'queue-pattern-fallback' && itemId === 'item-100-1-2');
    expect(alaskaQueues).to.have.length(1);
    expect(JSON.stringify(alaskaQueues[0]?.input)).to.contain('remained unresolved while collecting pattern seeds');
  });

  it('tests hydrated filenames again after a mismatching item without requiring the next semantic evaluation', async function() {
    const states = ['Alabama', 'Alaska', 'Arizona', 'Georgia'] as const;
    const evaluatedItems: string[] = [];
    const fetchedDetailPageIds: number[] = [];
    const caller: AiContentStageCaller = async (call) => {
      if (call.stage === 'interpret-request') return stageResult({
        promptType: 'image',
        responseType: 'text',
        subject: 'U.S. states',
        listSearchQuery: 'list of U.S. states outline maps',
        imageRequirement: 'plain outline map of the state in the United States',
      });
      if (call.stage === 'select-list-page') {
        return stageResult({ selectedCandidateId: 'list-page-100', rationale: 'The supplied page is the state list.' });
      }
      if (call.stage === 'evaluate-detail-images') {
        if (call.itemId === 'item-100-1-3') throw new Error('Arizona semantic evaluation must be skipped after filename inference.');
        evaluatedItems.push(String(call.itemId));
        const candidateId = (((call.schema.properties as any).rankedCandidateIds.items.enum as string[])[0]);
        return stageResult({ rankedCandidateIds: [candidateId], selectedCandidateId: candidateId, rationale: 'The outline map matches.' });
      }
      throw new Error(`Unexpected AI stage ${call.stage}`);
    };

    const result = await runAiContentPipeline({
      notes: 'Create image prompts for the U.S. states using plain outline maps.',
      mode: 'learning',
      model: 'openai/test',
      reasoningLevel: 'medium',
      stageCaller: caller,
      fetcher: fixtureFetcher(fetchedDetailPageIds, states),
      converter: async () => ({ bytes: new Uint8Array([7, 8]), width: 640, height: 480 }),
    });

    expect(result.pairs.map(({ response }) => response)).to.deep.equal([...states]);
    expect(result.run.resolutions.map(({ sourcePath }) => sourcePath))
      .to.deep.equal(['detail-page', 'detail-page', 'filename-pattern', 'filename-pattern']);
    expect(result.run.imageFilenamePattern?.seedResponses).to.deep.equal(['Alabama', 'Arizona']);
    expect(evaluatedItems).to.deep.equal(['item-100-1-1', 'item-100-1-2']);
    expect(fetchedDetailPageIds).to.deep.equal([202, 204, 203]);
    const inferenceStatuses = result.run.traces
      .filter(({ stage }) => stage === 'infer-image-filename-pattern')
      .map(({ status }) => status);
    expect(inferenceStatuses).to.deep.equal(['unresolved', 'succeeded']);
  });
});
