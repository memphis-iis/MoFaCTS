import { expect } from 'chai';
import type { AiContentPair } from '../../common/aiContentContract';
import type { ConvertedImage } from './aiContentImageAssets';
import {
  buildWikimediaCollectionQuery,
  discoverAuthoritativeWikimediaPairs,
  discoverWikimediaImages,
  type WikimediaDiscoveryOptions,
} from './aiContentImageSets';
import type { WikimediaTopicPlan } from './aiContentWikimediaTopics';

const pairs: AiContentPair[] = [
  { id: 'scaphoid', kind: 'image', stimulus: 'image: Scaphoid', response: 'Scaphoid' },
  { id: 'lunate', kind: 'image', stimulus: 'image: Lunate', response: 'Lunate' },
];

function topicPlanner(topics = ['Bones of the hand', 'Carpal bones']) {
  return async (): Promise<WikimediaTopicPlan> => ({
    topics,
    attempts: [{
      operation: 'topic-planning',
      request: { model: 'fixture/model', messages: [] },
      parsedContent: topics,
      rawContent: JSON.stringify(topics),
      validation: { ok: true, errors: [] },
    }],
  });
}

function imagePage(response: string, license = 'CC BY-SA 4.0', series = 'Articulated') {
  return {
    title: `File:${series}${response}.png`,
    imageinfo: [{
      url: `https://upload.wikimedia.test/${series}${response}.png`,
      thumburl: `https://upload.wikimedia.test/1280px-${series}${response}.png`,
      descriptionurl: `https://commons.wikimedia.org/wiki/File:${series}${response}.png`,
      width: 1400,
      height: 1000,
      mime: 'image/png',
      extmetadata: {
        LicenseShortName: { value: license },
        LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' },
        Artist: { value: 'Example anatomy illustrator' },
        ObjectName: { value: `${response} bone` },
        ImageDescription: { value: `Articulated ${response} bone with surrounding bones.` },
        Categories: { value: `${series} bones series|${response} bone` },
      },
    }],
  };
}

function handChainFetcher(
  licenseByResponse: Record<string, string> = {},
  responses = ['Scaphoid', 'Lunate'],
  seriesByResponse: Record<string, string> = {},
): { fetcher: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const fetcher = async (input: string | URL | Request) => {
    const url = new URL(String(input));
    urls.push(url.toString());
    if (url.hostname === 'upload.wikimedia.test') {
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { 'content-type': 'image/png' } });
    }
    if (url.searchParams.get('list') === 'search') {
      return new Response(JSON.stringify({ query: { search: [{ title: 'Hand' }] } }), { status: 200 });
    }
    const title = url.searchParams.get('titles');
    if (url.searchParams.get('prop')?.startsWith('links|extlinks')) {
      const links = title === 'Hand'
        ? [{ ns: 0, title: 'Carpal bones' }, { ns: 0, title: 'Finger' }]
        : title === 'Carpal bones'
          ? responses.map((response) => ({ ns: 0, title: `${response} bone` }))
          : [];
      return new Response(JSON.stringify({ query: { pages: [{ title, links, extlinks: [] }] } }), { status: 200 });
    }
    if (url.searchParams.get('generator') === 'images') {
      const response = responses.find((candidate) => title?.startsWith(candidate));
      const pages = response
        ? [imagePage(response, licenseByResponse[response], seriesByResponse[response] || 'Articulated')]
        : [];
      return new Response(JSON.stringify({ query: { pages } }), { status: 200 });
    }
    throw new Error(`Unexpected Wikimedia fixture request: ${url}`);
  };
  return { fetcher: fetcher as typeof fetch, urls };
}

function fakeConverter(files: File[] = []) {
  return async (file: File): Promise<ConvertedImage> => {
    files.push(file);
    return { bytes: new Uint8Array([8, 9, 10]), width: 1280, height: 914 };
  };
}

function authoritativeFixture(missingResponse = ''): {
  fetcher: typeof fetch;
} {
  const articleLinks: Record<string, string[]> = {
    Hand: ['Carpal bones'],
    'Carpal bones': ['Scaphoid bone', 'Lunate bone'],
    'Scaphoid bone': [],
    'Lunate bone': [],
  };
  const fetcher = async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.hostname === 'upload.wikimedia.test') {
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } });
    }
    if (url.searchParams.get('list') === 'search') {
      return new Response(JSON.stringify({ query: { search: [{ title: 'Hand' }] } }), { status: 200 });
    }
    const title = String(url.searchParams.get('titles') || '');
    if (url.searchParams.get('action') === 'parse' && url.searchParams.get('prop') === 'sections') {
      return new Response(JSON.stringify({ parse: { sections: [{ index: '1', line: 'Bones', level: '2' }] } }), { status: 200 });
    }
    if (url.searchParams.get('action') === 'parse' && url.searchParams.get('prop') === 'links|wikitext') {
      const pageTitle = String(url.searchParams.get('page') || '');
      return new Response(JSON.stringify({ parse: {
        links: (articleLinks[pageTitle] || []).map((linkedTitle) => ({ ns: 0, title: linkedTitle })),
        wikitext: pageTitle === 'Hand'
          ? '[[File:Hand.jpg|thumb|Context image showing the [[carpal bones]]]]\nThe requested bones comprise one branch, the [[carpal bones]].'
          : `==Bones==\n${pageTitle} fixture section.`,
      } }), { status: 200 });
    }
    if (url.searchParams.get('prop') === 'categories') {
      return new Response(JSON.stringify({ query: { pages: [{ title, categories: [{ title: 'Category:Carpal bones' }] }] } }), { status: 200 });
    }
    if (url.searchParams.get('list') === 'categorymembers') {
      return new Response(JSON.stringify({ query: { categorymembers: [
        { ns: 0, title: 'Carpal bones' },
        { ns: 0, title: 'Scaphoid bone' },
        { ns: 0, title: 'Lunate bone' },
      ] } }), { status: 200 });
    }
    if (url.searchParams.get('prop')?.startsWith('links|extlinks')) {
      return new Response(JSON.stringify({ query: { pages: [{
        title,
        extract: `${title} is an anatomical Wikipedia article used by this fixture.`,
        links: (articleLinks[title] || []).map((linkedTitle) => ({ ns: 0, title: linkedTitle })),
        extlinks: [],
      }] } }), { status: 200 });
    }
    if (url.searchParams.get('generator') === 'images') {
      const response = title === 'Scaphoid bone' ? 'Scaphoid' : title === 'Lunate bone' ? 'Lunate' : '';
      if (!response || response === missingResponse) {
        return new Response(JSON.stringify({ query: { pages: [] } }), { status: 200 });
      }
      const page = imagePage(response);
      page.imageinfo[0]!.extmetadata.Categories = { value: `${response} bone` };
      return new Response(JSON.stringify({ query: { pages: [page] } }), { status: 200 });
    }
    throw new Error(`Unexpected authoritative Wikimedia fixture request: ${url}`);
  };
  return { fetcher: fetcher as typeof fetch };
}

function options(
  fetcher: typeof fetch,
  selectedPairs: AiContentPair[] = pairs,
  converter = fakeConverter(),
): WikimediaDiscoveryOptions {
  return {
    notes: 'bones of the hand with image prompts',
    pairs: selectedPairs,
    model: 'fixture/model',
    fetcher,
    converter,
    topicPlanner: topicPlanner(),
  };
}

describe('collection-based Wikimedia discovery', function() {
  it('lets Wikipedia links create the canonical pair names while member pages supply the images', async function() {
    const { fetcher } = authoritativeFixture();
    const result = await discoverAuthoritativeWikimediaPairs({
      notes: 'bones of the hand and wrist with image prompts',
      model: 'fixture/model',
      fetcher,
      converter: fakeConverter(),
      topicPlanner: topicPlanner(['Hand']),
    });
    expect(result.pairs.map((pair) => pair.response)).to.deep.equal(['Scaphoid bone', 'Lunate bone']);
    expect(result.pairs.every((pair) => pair.kind === 'image')).to.equal(true);
    expect(result.assets.map((asset) => asset.pairId)).to.have.members(result.pairs.map((pair) => pair.id));
    expect(result.unresolvedPairIds).to.deep.equal([]);
    expect(result.groundings.map((entry) => entry.articleTitle)).to.deep.equal(['Hand', 'Carpal bones']);
  });

  it('retains a Wikipedia member as an unresolved image slot instead of converting it to text', async function() {
    const { fetcher } = authoritativeFixture('Lunate');
    const result = await discoverAuthoritativeWikimediaPairs({
      notes: 'bones of the hand and wrist with image prompts',
      model: 'fixture/model',
      fetcher,
      converter: fakeConverter(),
      topicPlanner: topicPlanner(['Hand']),
    });
    const lunate = result.pairs.find((pair) => pair.response === 'Lunate bone');
    expect(lunate).to.include({ kind: 'image', stimulus: 'image: Lunate bone' });
    expect(lunate?.image?.status).to.equal('unresolved');
    expect(result.unresolvedPairIds).to.deep.equal([lunate?.id]);
  });

  it('cleans notes without using that cleaning as one query per response', function() {
    expect(buildWikimediaCollectionQuery('Create a lesson on bones of the hand with image prompts')).to.equal('bones of the hand');
  });

  it('traverses Hand to Carpal bones to member articles, downloads PNG, and converts a coherent 1280px series', async function() {
    const { fetcher, urls } = handChainFetcher();
    const convertedFiles: File[] = [];
    const result = await discoverWikimediaImages(options(fetcher, pairs, fakeConverter(convertedFiles)));
    expect(result.stopReason).to.equal('complete');
    expect(result.roundsCompleted).to.equal(3);
    expect(result.unresolvedPairIds).to.deep.equal([]);
    expect(result.assets.map((asset) => asset.pairId)).to.have.members(['scaphoid', 'lunate']);
    expect(result.assets.every((asset) => asset.renditionUrl.includes('1280px-'))).to.equal(true);
    expect(result.assets.every((asset) => asset.sourceMediaType === 'image/png')).to.equal(true);
    expect(result.assets.every((asset) => asset.sourceBytes.byteLength === 4)).to.equal(true);
    expect(result.assets.every((asset) => asset.webpBytes.byteLength === 3)).to.equal(true);
    expect(convertedFiles.every((file) => file.type === 'image/png')).to.equal(true);
    expect(new Set(result.assets.map((asset) => asset.sourceUrl)).size).to.equal(2);
    expect(urls.filter((value) => new URL(value).searchParams.get('list') === 'search')).to.have.length(2);
    expect(result.diagnostics.some((entry) => entry.traversalPath?.join(' -> ').includes('Hand -> Carpal bones -> Scaphoid bone'))).to.equal(true);
  });

  it('stops after the first round when the overview article contains the required image', async function() {
    const singlePair = [pairs[0]!];
    const fetcher = async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === 'upload.wikimedia.test') {
        return new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/png' } });
      }
      if (url.searchParams.get('list') === 'search') {
        return new Response(JSON.stringify({ query: { search: [{ title: 'Hand' }] } }), { status: 200 });
      }
      if (url.searchParams.get('generator') === 'images') {
        return new Response(JSON.stringify({ query: { pages: [imagePage('Scaphoid')] } }), { status: 200 });
      }
      if (url.searchParams.get('prop')?.startsWith('links|extlinks')) {
        return new Response(JSON.stringify({ query: { pages: [{ title: 'Hand', links: [], extlinks: [] }] } }), { status: 200 });
      }
      throw new Error(`Unexpected request ${url}`);
    };
    const result = await discoverWikimediaImages(options(fetcher as typeof fetch, singlePair));
    expect(result.stopReason).to.equal('complete');
    expect(result.roundsCompleted).to.equal(1);
  });

  it('enumerates a linked Commons category as a terminal image collection', async function() {
    const fetcher = async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === 'upload.wikimedia.test') {
        return new Response(new Uint8Array([1, 2]), { status: 200, headers: { 'content-type': 'image/png' } });
      }
      if (url.searchParams.get('list') === 'search') {
        return new Response(JSON.stringify({ query: { search: [{ title: 'Carpal bones' }] } }), { status: 200 });
      }
      if (url.hostname === 'commons.wikimedia.org' && url.searchParams.get('generator') === 'categorymembers') {
        return new Response(JSON.stringify({ query: { pages: [imagePage('Scaphoid'), imagePage('Lunate')] } }), { status: 200 });
      }
      if (url.searchParams.get('generator') === 'images') {
        return new Response(JSON.stringify({ query: { pages: [] } }), { status: 200 });
      }
      if (url.searchParams.get('prop')?.startsWith('links|extlinks')) {
        return new Response(JSON.stringify({ query: { pages: [{
          title: 'Carpal bones',
          links: [],
          extlinks: [{ url: 'https://commons.wikimedia.org/wiki/Category:Articulated_carpal_bones' }],
        }] } }), { status: 200 });
      }
      throw new Error(`Unexpected request ${url}`);
    };
    const result = await discoverWikimediaImages(options(fetcher as typeof fetch));
    expect(result.unresolvedPairIds).to.deep.equal([]);
    expect(result.diagnostics.some((entry) => entry.message.includes('Commons links'))).to.equal(true);
  });

  it('never assigns the same source file to two image pairs', async function() {
    const shared = imagePage('Scaphoid');
    shared.title = 'File:ArticulatedScaphoidLunate.png';
    shared.imageinfo[0]!.extmetadata.ObjectName = { value: 'Scaphoid and Lunate bones' };
    const fetcher = async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === 'upload.wikimedia.test') {
        return new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/png' } });
      }
      if (url.searchParams.get('list') === 'search') {
        return new Response(JSON.stringify({ query: { search: [{ title: 'Carpal bones' }] } }), { status: 200 });
      }
      if (url.searchParams.get('generator') === 'images') {
        return new Response(JSON.stringify({ query: { pages: [shared] } }), { status: 200 });
      }
      if (url.searchParams.get('prop')?.startsWith('links|extlinks')) {
        return new Response(JSON.stringify({ query: { pages: [{ title: 'Carpal bones', links: [], extlinks: [] }] } }), { status: 200 });
      }
      throw new Error(`Unexpected request ${url}`);
    };
    const result = await discoverWikimediaImages(options(fetcher as typeof fetch));
    expect(result.assets).to.have.length(1);
    expect(result.unresolvedPairIds).to.have.length(1);
  });

  it('rejects a broad image whose description mentions a target but whose file identity does not name it', async function() {
    const broad = imagePage('Hand');
    broad.title = 'File:Carpus.png';
    broad.imageinfo[0]!.extmetadata.ObjectName = { value: 'Bones of the hand' };
    broad.imageinfo[0]!.extmetadata.ImageDescription = { value: 'The scaphoid and lunate are visible in this overview.' };
    broad.imageinfo[0]!.extmetadata.Categories = { value: 'Articulated bones series' };
    const fetcher = async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.searchParams.get('list') === 'search') {
        return new Response(JSON.stringify({ query: { search: [{ title: 'Carpal bones' }] } }), { status: 200 });
      }
      if (url.searchParams.get('generator') === 'images') {
        return new Response(JSON.stringify({ query: { pages: [broad] } }), { status: 200 });
      }
      if (url.searchParams.get('prop')?.startsWith('links|extlinks')) {
        return new Response(JSON.stringify({ query: { pages: [{ title: 'Carpal bones', links: [], extlinks: [] }] } }), { status: 200 });
      }
      throw new Error(`Unexpected request ${url}`);
    };
    const result = await discoverWikimediaImages(options(fetcher as typeof fetch));
    expect(result.assets).to.deep.equal([]);
    expect(result.unresolvedPairIds).to.have.members(['scaphoid', 'lunate']);
  });

  it('matches conventional ordinal and anatomical title variants', async function() {
    const variantPairs: AiContentPair[] = [
      { id: 'triquetrum', kind: 'image', stimulus: 'image: Triquetrum bone', response: 'Triquetrum bone' },
      { id: 'metacarpal-1', kind: 'image', stimulus: 'image: Metacarpal bone 1', response: 'Metacarpal bone 1' },
    ];
    const variants = [imagePage('Triqueterum'), imagePage('First metacarpal bone')];
    variants[0]!.title = 'File:HandSkeletonWithTriqueterumHighlighted.png';
    variants[0]!.imageinfo[0]!.extmetadata.ObjectName = { value: 'HandSkeletonWithTriqueterumHighlighted' };
    variants[0]!.imageinfo[0]!.extmetadata.ImageDescription = { value: 'Skeleton of the right hand with triqueterum highlighted in red.' };
    variants[0]!.imageinfo[0]!.extmetadata.Categories = { value: 'Articulated hand bones series' };
    variants[1]!.imageinfo[0]!.extmetadata.Categories = { value: 'Articulated hand bones series' };
    const fetcher = async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === 'upload.wikimedia.test') {
        return new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/png' } });
      }
      if (url.searchParams.get('list') === 'search') {
        return new Response(JSON.stringify({ query: { search: [{ title: 'Hand bones' }] } }), { status: 200 });
      }
      if (url.searchParams.get('generator') === 'images') {
        return new Response(JSON.stringify({ query: { pages: variants } }), { status: 200 });
      }
      if (url.searchParams.get('prop')?.startsWith('links|extlinks')) {
        return new Response(JSON.stringify({ query: { pages: [{ title: 'Hand bones', links: [], extlinks: [] }] } }), { status: 200 });
      }
      throw new Error(`Unexpected request ${url}`);
    };
    const result = await discoverWikimediaImages(options(fetcher as typeof fetch, variantPairs));
    expect(result.unresolvedPairIds).to.deep.equal([]);
  });

  it('prefers a static contextual family over an equally complete animated family', async function() {
    const contextual = pairs.flatMap((pair) => {
      const response = pair.response;
      const staticImage = imagePage(response, 'CC BY-SA 4.0', 'Articulated');
      staticImage.title = `File:Articulated${response}.png`;
      staticImage.imageinfo[0]!.extmetadata.ObjectName = { value: `Articulated${response}` };
      const animatedImage = imagePage(response, 'CC BY-SA 4.0', 'Animated');
      animatedImage.title = `File:${response} bone (left hand) - animation01.gif`;
      animatedImage.imageinfo[0]!.mime = 'image/gif';
      animatedImage.imageinfo[0]!.extmetadata.ObjectName = { value: `${response} bone (left hand) - animation01` };
      animatedImage.imageinfo[0]!.extmetadata.Categories = { value: 'Animations of bones of the human upper limb from Anatomography' };
      return [staticImage, animatedImage];
    });
    const fetcher = async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === 'upload.wikimedia.test') {
        return new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/png' } });
      }
      if (url.searchParams.get('list') === 'search') {
        return new Response(JSON.stringify({ query: { search: [{ title: 'Carpal bones' }] } }), { status: 200 });
      }
      if (url.searchParams.get('generator') === 'images') {
        return new Response(JSON.stringify({ query: { pages: contextual } }), { status: 200 });
      }
      if (url.searchParams.get('prop')?.startsWith('links|extlinks')) {
        return new Response(JSON.stringify({ query: { pages: [{ title: 'Carpal bones', links: [], extlinks: [] }] } }), { status: 200 });
      }
      throw new Error(`Unexpected request ${url}`);
    };
    const result = await discoverWikimediaImages(options(fetcher as typeof fetch));
    expect(result.assets.every((asset) => asset.sourceTitle.startsWith('Articulated'))).to.equal(true);
  });

  it('retains an animated source when its converted frame is the only contextual image for a set member', async function() {
    const staticScaphoid = imagePage('Scaphoid');
    const animated = imagePage('Lunate', 'CC BY-SA 4.0', 'Animated');
    animated.title = 'File:Lunate bone (left hand) - animation01.gif';
    animated.imageinfo[0]!.mime = 'image/gif';
    animated.imageinfo[0]!.extmetadata.ObjectName = { value: 'Lunate bone (left hand) - animation01' };
    animated.imageinfo[0]!.extmetadata.ImageDescription = { value: 'Lunate bone shown in red.' };
    animated.imageinfo[0]!.extmetadata.Categories = { value: 'Animations of bones of the human upper limb from Anatomography' };
    const fetcher = async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === 'upload.wikimedia.test') {
        return new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/gif' } });
      }
      if (url.searchParams.get('list') === 'search') {
        return new Response(JSON.stringify({ query: { search: [{ title: 'Carpal bones' }] } }), { status: 200 });
      }
      if (url.searchParams.get('generator') === 'images') {
        return new Response(JSON.stringify({ query: { pages: [staticScaphoid, animated] } }), { status: 200 });
      }
      if (url.searchParams.get('prop')?.startsWith('links|extlinks')) {
        return new Response(JSON.stringify({ query: { pages: [{ title: 'Carpal bones', links: [], extlinks: [] }] } }), { status: 200 });
      }
      throw new Error(`Unexpected request ${url}`);
    };
    const result = await discoverWikimediaImages(options(fetcher as typeof fetch));
    expect(result.assets.map((asset) => asset.sourceTitle)).to.include('Lunate bone (left hand) - animation01.gif');
  });

  it('rejects known labeled anatomical plate families that reveal the answer', async function() {
    const labeled = imagePage('Scaphoid');
    labeled.title = 'File:Ospoignet - Scaphoid bone.png';
    labeled.imageinfo[0]!.extmetadata.Categories = { value: "Gray's Anatomy plates" };
    const fetcher = async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.searchParams.get('list') === 'search') {
        return new Response(JSON.stringify({ query: { search: [{ title: 'Scaphoid bone' }] } }), { status: 200 });
      }
      if (url.searchParams.get('generator') === 'images') {
        return new Response(JSON.stringify({ query: { pages: [labeled] } }), { status: 200 });
      }
      if (url.searchParams.get('prop')?.startsWith('links|extlinks')) {
        return new Response(JSON.stringify({ query: { pages: [{ title: 'Scaphoid bone', links: [], extlinks: [] }] } }), { status: 200 });
      }
      throw new Error(`Unexpected request ${url}`);
    };
    const result = await discoverWikimediaImages(options(fetcher as typeof fetch, [pairs[0]!]));
    expect(result.assets).to.deep.equal([]);
    expect(result.diagnostics.some((entry) => entry.message.includes('learner-visible anatomical labels'))).to.equal(true);
  });

  it('rejects a disallowed license and keeps the remaining image slots unresolved', async function() {
    const { fetcher } = handChainFetcher({ Lunate: 'Fair use' });
    const result = await discoverWikimediaImages(options(fetcher));
    expect(result.assets.map((asset) => asset.pairId)).to.deep.equal(['scaphoid']);
    expect(result.unresolvedPairIds).to.deep.equal(['lunate']);
    expect(result.diagnostics.some((entry) => entry.stage === 'license' && entry.decision === 'rejected')).to.equal(true);
  });

  it('preserves the best coherent partial family when one member is unusable', async function() {
    const partialPairs: AiContentPair[] = [
      ...pairs,
      { id: 'capitate', kind: 'image', stimulus: 'image: Capitate', response: 'Capitate' },
    ];
    const { fetcher } = handChainFetcher({ Capitate: 'Fair use' }, ['Scaphoid', 'Lunate', 'Capitate']);
    const result = await discoverWikimediaImages(options(fetcher, partialPairs));
    expect(result.assets.map((asset) => asset.pairId)).to.have.members(['scaphoid', 'lunate']);
    expect(result.unresolvedPairIds).to.deep.equal(['capitate']);
  });

  it('selects separate coherent families for natural branches', async function() {
    const branchPairs: AiContentPair[] = [
      ...pairs,
      { id: 'trapezium', kind: 'image', stimulus: 'image: Trapezium', response: 'Trapezium' },
      { id: 'trapezoid', kind: 'image', stimulus: 'image: Trapezoid', response: 'Trapezoid' },
    ];
    const responses = ['Scaphoid', 'Lunate', 'Trapezium', 'Trapezoid'];
    const { fetcher } = handChainFetcher({}, responses, { Scaphoid: 'Articulated', Lunate: 'Articulated', Trapezium: 'Anatomograph', Trapezoid: 'Anatomograph' });
    const result = await discoverWikimediaImages(options(fetcher, branchPairs));
    expect(result.unresolvedPairIds).to.deep.equal([]);
    expect(new Set(result.assets.map((asset) => asset.familyKey)).size).to.equal(2);
  });

  it('visits cyclic article links once and reports an empty frontier', async function() {
    const inspected: string[] = [];
    const fetcher = async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.searchParams.get('list') === 'search') {
        return new Response(JSON.stringify({ query: { search: [{ title: 'Hand' }] } }), { status: 200 });
      }
      const title = String(url.searchParams.get('titles'));
      if (url.searchParams.get('prop')?.startsWith('links|extlinks')) {
        inspected.push(title);
        const linked = title === 'Hand' ? 'Carpal bones' : 'Hand';
        return new Response(JSON.stringify({ query: { pages: [{ title, links: [{ ns: 0, title: linked }], extlinks: [] }] } }), { status: 200 });
      }
      if (url.searchParams.get('generator') === 'images') {
        return new Response(JSON.stringify({ query: { pages: [] } }), { status: 200 });
      }
      throw new Error(`Unexpected request ${url}`);
    };
    const result = await discoverWikimediaImages(options(fetcher as typeof fetch));
    expect(result.stopReason).to.equal('frontier-empty');
    expect(inspected.filter((title) => title === 'Hand')).to.have.length(1);
    expect(inspected.filter((title) => title === 'Carpal bones')).to.have.length(1);
  });

  it('reports the five-round depth limit distinctly', async function() {
    const fetcher = async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.searchParams.get('list') === 'search') {
        return new Response(JSON.stringify({ query: { search: [{ title: 'Hand anatomy 1' }] } }), { status: 200 });
      }
      const title = String(url.searchParams.get('titles'));
      if (url.searchParams.get('prop')?.startsWith('links|extlinks')) {
        const number = Number(title.match(/(\d+)$/)?.[1] || 1);
        return new Response(JSON.stringify({ query: { pages: [{ title, links: [{ ns: 0, title: `Hand anatomy ${number + 1}` }], extlinks: [] }] } }), { status: 200 });
      }
      if (url.searchParams.get('generator') === 'images') {
        return new Response(JSON.stringify({ query: { pages: [] } }), { status: 200 });
      }
      throw new Error(`Unexpected request ${url}`);
    };
    const result = await discoverWikimediaImages(options(fetcher as typeof fetch));
    expect(result.stopReason).to.equal('depth-limit');
    expect(result.roundsCompleted).to.equal(5);
  });
});
