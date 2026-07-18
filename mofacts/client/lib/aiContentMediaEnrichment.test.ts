import { expect } from 'chai';
import { resolveWikimediaImage } from './aiContentMediaEnrichment';

describe('AI Wikimedia media resolution', function() {
  it('selects a query-relevant candidate with attribution evidence', async function() {
    const fetcher = async () => new Response(JSON.stringify({
      query: {
        pages: {
          1: {
            title: 'File:Alabama location map.svg',
            imageinfo: [{
              url: 'https://upload.wikimedia.org/alabama.svg',
              descriptionurl: 'https://commons.wikimedia.org/wiki/File:Alabama_location_map.svg',
              extmetadata: {
                LicenseShortName: { value: 'CC BY-SA 4.0' },
                LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' },
                Artist: { value: 'Map author' },
              },
            }],
          },
        },
      },
    }), { status: 200 });

    const result = await resolveWikimediaImage('Alabama location map', ['nothing labeled'], fetcher as typeof fetch);
    expect(result?.imgSrc).to.equal('https://upload.wikimedia.org/alabama.svg');
    expect(result?.attribution.licenseUrl).to.equal('https://creativecommons.org/licenses/by-sa/4.0/');
  });

  it('leaves low-confidence candidates unresolved', async function() {
    const fetcher = async () => new Response(JSON.stringify({
      query: { pages: { 1: { title: 'File:Alabama state flag.svg', imageinfo: [{ url: 'https://example.test/flag.svg', extmetadata: { LicenseShortName: { value: 'CC0' } } }] } } },
    }), { status: 200 });
    expect(await resolveWikimediaImage('Alabama location map', ['nothing labeled'], fetcher as typeof fetch)).to.equal(null);
  });
});
