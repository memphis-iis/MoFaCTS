import { expect } from 'chai';
import type { AiContentStageCaller } from './aiContentOpenRouterClient';
import { aiContentAiStageOutputKey, runAiContentPipeline } from './aiContentPipeline';

const LIST_HTML = `
<div class="mw-parser-output">
  <h2>Members</h2>
  <table class="wikitable">
    <tr><th>Name</th><th>Image</th></tr>
    <tr>
      <td><a href="/wiki/Cat" title="Cat">Cat</a></td>
      <td><a href="/wiki/File:Cat.jpg" title="File:Cat.jpg"><img alt="Cat breed portrait"></a></td>
    </tr>
    <tr>
      <td><a href="/wiki/Alabama" title="Alabama">Alabama</a></td>
      <td><a href="/wiki/File:Flag_of_Alabama.svg" title="File:Flag of Alabama.svg"><img alt="State flag"></a></td>
    </tr>
  </table>
  <table class="navbox"><tr><td><a href="/wiki/Noise">Navigation noise</a></td></tr></table>
</div>`;

const DETAIL_HTML = `
<div class="mw-parser-output">
  <aside class="infobox">
    <a href="/wiki/File:Map_of_Alabama.svg" title="File:Map of Alabama.svg">
      <img alt="Outline map of Alabama in the United States">
    </a>
  </aside>
</div>`;

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function imageInfo(pageid: number, title: string, description: string): unknown {
  return {
    pageid,
    title,
    imageinfo: [{
      url: `https://upload.wikimedia.org/${pageid}.png`,
      thumburl: `https://upload.wikimedia.org/thumb/${pageid}.png`,
      descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
      width: 640,
      height: 480,
      mime: 'image/png',
      extmetadata: {
        LicenseShortName: { value: 'CC BY-SA 4.0' },
        LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' },
        Artist: { value: 'Fixture author' },
        ImageDescription: { value: description },
      },
    }],
  };
}

function fixtureFetcher(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === 'upload.wikimedia.org') {
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    }
    if (url.searchParams.get('generator') === 'search') {
      return jsonResponse({
        query: {
          pages: [
            { pageid: 100, title: 'List of members', fullurl: 'https://en.wikipedia.org/?curid=100', extract: 'A list of members.', index: 1 },
            { pageid: 101, title: 'Members', fullurl: 'https://en.wikipedia.org/?curid=101', extract: 'An article.', index: 2 },
            { pageid: 102, title: 'Member history', fullurl: 'https://en.wikipedia.org/?curid=102', extract: 'History.', index: 3 },
            { pageid: 103, title: 'Fourth result', fullurl: 'https://en.wikipedia.org/?curid=103', extract: 'Must be bounded out.', index: 4 },
          ],
        },
      });
    }
    if (url.searchParams.get('action') === 'parse') {
      const pageId = Number(url.searchParams.get('pageid'));
      return jsonResponse({
        parse: {
          pageid: pageId,
          title: pageId === 100 ? 'List of members' : 'Alabama',
          text: pageId === 100 ? LIST_HTML : DETAIL_HTML,
        },
      });
    }
    const titles = url.searchParams.get('titles') || '';
    if (url.searchParams.get('prop') === 'info') {
      return jsonResponse({
        query: {
          pages: [{ pageid: 200, title: 'Alabama', fullurl: 'https://en.wikipedia.org/?curid=200' }],
        },
      });
    }
    if (titles.includes('Cat.jpg')) {
      return jsonResponse({ query: { pages: [imageInfo(501, 'File:Cat.jpg', 'Cat breed portrait')] } });
    }
    if (titles.includes('Flag of Alabama.svg')) {
      return jsonResponse({ query: { pages: [imageInfo(502, 'File:Flag of Alabama.svg', 'Flag of Alabama')] } });
    }
    if (titles.includes('Map of Alabama.svg')) {
      return jsonResponse({ query: { pages: [imageInfo(503, 'File:Map of Alabama.svg', 'Outline map of Alabama')] } });
    }
    throw new Error(`Unexpected fixture request: ${url.toString()}`);
  }) as typeof fetch;
}

function stageResult(parsedContent: unknown) {
  return {
    parsedContent,
    request: { provider: { require_parameters: true, allow_fallbacks: false } },
    rawContent: JSON.stringify(parsedContent),
    responseBody: { usage: { total_tokens: 10 } },
    usage: { totalTokens: 10 },
    costUsd: 0.001,
    model: 'openai/test',
    reasoningLevel: 'medium' as const,
  };
}

describe('AI Content list-source pipeline', function() {
  it('uses direct table images and linked detail-page images in the same universal image run', async function() {
    const caller: AiContentStageCaller = async (call) => {
      if (call.stage === 'interpret-request') {
        return stageResult({
          promptType: 'image',
          responseType: 'text',
          subject: 'members',
          listSearchQuery: 'list of members outline maps or portraits',
          imageRequirement: 'an identifying portrait or plain outline map',
        });
      }
      if (call.stage === 'select-list-page') {
        return stageResult({ selectedCandidateId: 'list-page-100', rationale: 'The first result is the list.' });
      }
      if (call.stage === 'evaluate-direct-images' && call.itemId === 'item-100-1-1') {
        return stageResult({
          rankedCandidateIds: ['direct-image-item-100-1-1-1'],
          selectedCandidateId: 'direct-image-item-100-1-1-1',
          rationale: 'The direct portrait matches.',
        });
      }
      if (call.stage === 'evaluate-direct-images') {
        return stageResult({ rankedCandidateIds: [], selectedCandidateId: null, rationale: 'A flag is not a map.' });
      }
      if (call.stage === 'evaluate-detail-images') {
        return stageResult({
          rankedCandidateIds: ['detail-image-item-100-1-2-1'],
          selectedCandidateId: 'detail-image-item-100-1-2-1',
          rationale: 'The detail-page outline map matches.',
        });
      }
      throw new Error(`Unexpected AI stage ${call.stage}`);
    };

    const result = await runAiContentPipeline({
      notes: 'Create image prompts from the list, using portraits or outline maps.',
      mode: 'learning',
      model: 'openai/test',
      reasoningLevel: 'medium',
      stageCaller: caller,
      fetcher: fixtureFetcher(),
      converter: async () => ({ bytes: new Uint8Array([7, 8]), width: 640, height: 480 }),
    });

    expect(result.run.listCandidates).to.have.length(3);
    expect(result.pairs.map(({ response }) => response)).to.deep.equal(['Cat', 'Alabama']);
    expect(result.run.resolutions.map(({ sourcePath }) => sourcePath)).to.deep.equal(['list-page', 'detail-page']);
    expect(result.assets).to.have.length(2);
    expect(result.run.traces.map(({ stage }) => stage)).to.include.members([
      'hydrate-direct-images',
      'hydrate-detail-links',
      'fetch-detail-page',
      'extract-detail-images',
      'hydrate-detail-images',
    ]);
    expect(JSON.stringify(result.run.traces)).not.to.contain('sourceBytes');
    expect(JSON.stringify(result.run.traces)).not.to.contain('<div class="mw-parser-output">');
    const extractionTrace = result.run.traces.find(({ stage }) => stage === 'extract-list-entries');
    expect((extractionTrace?.output as any)?.page?.htmlCharacters).to.equal(LIST_HTML.length);
    const searchTrace = result.run.traces.find(({ stage }) => stage === 'search-wikipedia');
    expect((searchTrace?.input as any).requestUrl).to.contain('gsrsearch=');
  });

  it('calls one definition stage per authoritative item and leaves a leaking definition unresolved', async function() {
    let definitionCalls = 0;
    const caller: AiContentStageCaller = async (call) => {
      if (call.stage === 'interpret-request') {
        return stageResult({
          promptType: 'text',
          responseType: 'text',
          subject: 'members',
          listSearchQuery: 'list of members',
          imageRequirement: '',
        });
      }
      if (call.stage === 'select-list-page') {
        return stageResult({ selectedCandidateId: 'list-page-100', rationale: 'The first result is the list.' });
      }
      if (call.stage === 'generate-definition') {
        definitionCalls += 1;
        return stageResult({
          prompt: call.itemId === 'item-100-1-1'
            ? 'A domesticated feline recognized as a distinct lineage.'
            : 'The Alabama entry in this list.',
        });
      }
      throw new Error(`Unexpected AI stage ${call.stage}`);
    };

    const result = await runAiContentPipeline({
      notes: 'Create text definitions for every member.',
      mode: 'learning',
      model: 'openai/test',
      reasoningLevel: 'medium',
      stageCaller: caller,
      fetcher: fixtureFetcher(),
    });

    expect(definitionCalls).to.equal(2);
    expect(result.pairs).to.have.length(2);
    expect(result.pairs[0]?.stimulus).not.to.equal('');
    expect(result.pairs[1]?.stimulus).to.equal('');
    expect(result.run.resolutions[1]?.sourcePath).to.equal('unresolved');
  });

  it('retries from an unchanged recorded stage while reusing validated upstream AI outputs', async function() {
    const firstCaller: AiContentStageCaller = async (call) => {
      if (call.stage === 'interpret-request') return stageResult({
        promptType: 'text', responseType: 'text', subject: 'members', listSearchQuery: 'list of members', imageRequirement: '',
      });
      if (call.stage === 'select-list-page') return stageResult({ selectedCandidateId: 'list-page-100', rationale: 'First result.' });
      if (call.stage === 'generate-definition') return stageResult({
        prompt: call.itemId === 'item-100-1-1' ? 'A domesticated feline lineage.' : 'A southeastern U.S. state.',
      });
      throw new Error(`Unexpected AI stage ${call.stage}`);
    };
    const first = await runAiContentPipeline({
      notes: 'Create text definitions for every member.',
      mode: 'learning',
      model: 'openai/test',
      reasoningLevel: 'medium',
      stageCaller: firstCaller,
      fetcher: fixtureFetcher(),
    });
    const targetIndex = first.run.traces.findIndex(({ stage, itemId }) => stage === 'generate-definition' && itemId === 'item-100-1-2');
    const target = first.run.traces[targetIndex]!;
    const reusedAiOutputs: Record<string, unknown> = {};
    first.run.traces.slice(0, targetIndex).forEach((trace) => {
      if (trace.output !== undefined && ['interpret-request', 'select-list-page', 'generate-definition'].includes(trace.stage)) {
        reusedAiOutputs[aiContentAiStageOutputKey(trace.stage as any, trace.itemId)] = trace.output;
      }
    });
    const called: string[] = [];
    const retry = await runAiContentPipeline({
      notes: 'Create text definitions for every member.',
      mode: 'learning',
      model: 'openai/test',
      reasoningLevel: 'medium',
      fetcher: fixtureFetcher(),
      reusedAiOutputs,
      retryTarget: { key: aiContentAiStageOutputKey('generate-definition', target.itemId), input: target.input },
      stageCaller: async (call) => {
        called.push(aiContentAiStageOutputKey(call.stage, call.itemId));
        return stageResult({ prompt: 'A state in the southeastern United States.' });
      },
    });

    expect(called).to.deep.equal(['generate-definition:item-100-1-2']);
    expect(retry.run.traces.filter(({ request }) => (request as any)?.reusedValidatedUpstreamOutput).length).to.be.at.least(2);
    expect(retry.pairs[1]?.stimulus).to.equal('A state in the southeastern United States.');
  });
});
