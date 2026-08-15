import { expect } from 'chai';
import {
  hydrateWikimediaImageCandidates,
  predictedWikimediaFileRequestUrls,
  resolvePredictedWikimediaFiles,
  wikimediaCandidateHydrationRequestUrls,
} from './aiContentWikimediaFiles';
import type { WikipediaFileReference } from './aiContentWikipediaSource';

const reference: WikipediaFileReference = {
  candidateId: 'image-1',
  itemId: 'item-1',
  fileTitle: 'File:Example.svg',
  caption: 'Example map',
  altText: 'Outline map',
  surroundingText: 'Example',
  structuralRole: 'table entry 1',
};

function metadataResponse(options: {
  pageid?: number;
  title?: string;
  license?: string;
  licenseUrl?: string;
  artist?: string;
} = {}): Response {
  return new Response(JSON.stringify({
    query: {
      pages: [{
        pageid: options.pageid ?? 10,
        title: options.title ?? 'File:Example.svg',
        imageinfo: [{
          url: 'https://upload.wikimedia.org/example.svg',
          descriptionurl: 'https://commons.wikimedia.org/wiki/File:Example.svg',
          width: 500,
          height: 400,
          mime: 'image/svg+xml',
          extmetadata: {
            LicenseShortName: { value: options.license ?? 'CC BY 4.0' },
            LicenseUrl: { value: options.licenseUrl ?? 'https://creativecommons.org/licenses/by/4.0/' },
            Artist: { value: options.artist ?? 'Creator' },
          },
        }],
      }],
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('Wikimedia canonical file hydration', function() {
  it('exposes the exact bounded API URL and builds complete canonical provenance', async function() {
    const urls = wikimediaCandidateHydrationRequestUrls([reference]);
    expect(urls).to.have.length(1);
    expect(urls[0]).to.contain('commons.wikimedia.org/w/api.php');
    expect(urls[0]).to.contain('titles=File%3AExample.svg');

    const result = await hydrateWikimediaImageCandidates(
      [reference],
      { sourcePath: 'list-page', parentListPageId: 5 },
      (async () => metadataResponse()) as typeof fetch,
    );
    expect(result.rejections).to.deep.equal([]);
    expect(result.candidates[0]).to.include({
      candidateId: 'image-1',
      filePageId: 10,
      fileTitle: 'File:Example.svg',
      sourcePath: 'list-page',
    });
    expect(result.candidates[0]?.attribution.licenseUrl).to.equal('https://creativecommons.org/licenses/by/4.0/');
  });

  it('rejects missing canonical page IDs and disallowed licenses', async function() {
    const missingId = await hydrateWikimediaImageCandidates(
      [reference],
      { sourcePath: 'list-page', parentListPageId: 5 },
      (async () => metadataResponse({ pageid: 0 })) as typeof fetch,
    );
    expect(missingId.rejections[0]?.reason).to.contain('file-page ID');

    const nonFree = await hydrateWikimediaImageCandidates(
      [reference],
      { sourcePath: 'list-page', parentListPageId: 5 },
      (async () => metadataResponse({ license: 'Non-free', licenseUrl: '' })) as typeof fetch,
    );
    expect(nonFree.rejections[0]?.reason).to.contain('allowed machine-readable license');

    const missingCreator = await hydrateWikimediaImageCandidates(
      [reference],
      { sourcePath: 'list-page', parentListPageId: 5 },
      (async () => metadataResponse({ artist: '' })) as typeof fetch,
    );
    expect(missingCreator.rejections[0]?.reason).to.contain('creator attribution');
  });

  it('resolves normalized and redirected predicted file titles to canonical metadata', async function() {
    const predictions = [{
      itemId: 'georgia',
      response: 'Georgia',
      predictedFileTitle: 'file:Georgia_in_United States.svg',
      parentListPageId: 5,
      filenamePatternId: 'pattern-1',
    }];
    expect(predictedWikimediaFileRequestUrls(predictions)[0]).to.contain('redirects=1');
    const result = await resolvePredictedWikimediaFiles(predictions, (async () => new Response(JSON.stringify({
      query: {
        normalized: [{ from: 'file:Georgia_in_United States.svg', to: 'File:Georgia in United States.svg' }],
        redirects: [{ from: 'File:Georgia in United States.svg', to: 'File:Georgia in the United States.svg' }],
        pages: [{
          pageid: 22,
          title: 'File:Georgia in the United States.svg',
          imageinfo: [{
            url: 'https://upload.wikimedia.org/georgia.svg',
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:Georgia_in_the_United_States.svg',
            width: 500,
            height: 400,
            mime: 'image/svg+xml',
            extmetadata: {
              LicenseShortName: { value: 'CC BY 4.0' },
              LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0/' },
              Artist: { value: 'Creator' },
            },
          }],
        }],
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch);
    expect(result.rejections).to.deep.equal([]);
    expect(result.candidates[0]).to.include({
      itemId: 'georgia',
      sourcePath: 'filename-pattern',
      filePageId: 22,
      fileTitle: 'File:Georgia in the United States.svg',
    });
  });

  it('rejects HTTP-success responses without a canonical file record and image metadata', async function() {
    const prediction = [{
      itemId: 'missing',
      response: 'Missing',
      predictedFileTitle: 'File:Missing in United States.svg',
      parentListPageId: 5,
      filenamePatternId: 'pattern-1',
    }];
    const result = await resolvePredictedWikimediaFiles(prediction, (async () => new Response(JSON.stringify({
      query: { pages: [{ title: 'File:Missing in United States.svg', missing: true }] },
    }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch);
    expect(result.candidates).to.deep.equal([]);
    expect(result.rejections[0]?.reason).to.contain('canonical file-page ID with image metadata');
  });

  it('applies the same license checks to predicted canonical files', async function() {
    const prediction = [{
      itemId: 'restricted',
      response: 'Restricted',
      predictedFileTitle: 'File:Restricted in United States.svg',
      parentListPageId: 5,
      filenamePatternId: 'pattern-1',
    }];
    const result = await resolvePredictedWikimediaFiles(
      prediction,
      (async () => metadataResponse({
        title: 'File:Restricted in United States.svg',
        license: 'Non-free',
        licenseUrl: '',
      })) as typeof fetch,
    );
    expect(result.candidates).to.deep.equal([]);
    expect(result.rejections[0]?.reason).to.contain('allowed machine-readable license');
  });
});
