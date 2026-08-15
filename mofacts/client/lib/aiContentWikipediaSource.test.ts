import { expect } from 'chai';
import {
  extractWikipediaListRegions,
  type RetrievedWikipediaPage,
} from './aiContentWikipediaSource';

describe('Wikipedia list-source extraction', function() {
  it('keeps display labels separate from normalized keys and excludes navigation regions', function() {
    const page: RetrievedWikipediaPage = {
      pageId: 42,
      title: 'List of regions',
      canonicalUrl: 'https://en.wikipedia.org/?curid=42',
      html: `
        <div class="mw-parser-output">
          <h2>Regions</h2>
          <table class="wikitable">
            <tr><th>Name</th><th>Image</th></tr>
            <tr>
              <th scope="row"><a href="/wiki/New_York" title="New York">N.Y.<sup class="reference">[1]</sup></a></th>
              <td><a href="/wiki/File:New_York_map.svg" title="File:New York map.svg"><img alt="Outline map"></a></td>
            </tr>
          </table>
          <table class="navbox"><tr><td><a href="/wiki/Noise">Navigation noise</a></td></tr></table>
        </div>
      `,
    };

    const extraction = extractWikipediaListRegions(page);
    expect(extraction.regions).to.have.length(1);
    const entry = extraction.regions[0]?.entries[0];
    expect(entry?.item.displayedResponse).to.equal('N.Y.');
    expect(entry?.item.normalizedResponseKey).to.equal('n.y.');
    expect(entry?.item.sourceLocator).to.contain('Regions');
    expect(entry?.directImages[0]?.fileTitle).to.equal('File:New York map.svg');
    expect(entry?.detailLinks[0]?.title).to.equal('New York');
  });

  it('keeps file references inside their own list entry', function() {
    const page: RetrievedWikipediaPage = {
      pageId: 43,
      title: 'List of cats',
      canonicalUrl: 'https://en.wikipedia.org/?curid=43',
      html: `
        <div class="mw-parser-output"><ul>
          <li><a href="/wiki/Abyssinian_cat">Abyssinian</a><a href="/wiki/File:Abyssinian.jpg"><img alt="Abyssinian cat"></a></li>
          <li><a href="/wiki/Bengal_cat">Bengal</a><a href="/wiki/File:Bengal.jpg"><img alt="Bengal cat"></a></li>
        </ul></div>
      `,
    };

    const entries = extractWikipediaListRegions(page).regions[0]?.entries || [];
    expect(entries.map(({ item }) => item.displayedResponse)).to.deep.equal(['Abyssinian', 'Bengal']);
    expect(entries[0]?.directImages.map(({ fileTitle }) => fileTitle)).to.deep.equal(['File:Abyssinian.jpg']);
    expect(entries[1]?.directImages.map(({ fileTitle }) => fileTitle)).to.deep.equal(['File:Bengal.jpg']);
  });

  it('preserves table headings and row values as selectable source fields', function() {
    const page: RetrievedWikipediaPage = {
      pageId: 44,
      title: 'List of capitals in the United States',
      canonicalUrl: 'https://en.wikipedia.org/?curid=44',
      html: `
        <div class="mw-parser-output"><table class="wikitable">
          <tr><th>State</th><th>Capital</th><th>Since</th></tr>
          <tr><th scope="row"><a href="/wiki/Alabama">Alabama</a></th><td><a href="/wiki/Montgomery,_Alabama">Montgomery</a></td><td>1846</td></tr>
          <tr><th scope="row"><a href="/wiki/Alaska">Alaska</a></th><td><a href="/wiki/Juneau,_Alaska">Juneau</a></td><td>1906</td></tr>
        </table></div>`,
    };

    const region = extractWikipediaListRegions(page).regions[0]!;
    expect(region.candidate.fields).to.deep.equal([
      { fieldId: 'region-44-1-field-1', label: 'State', sampleValues: ['Alabama', 'Alaska'] },
      { fieldId: 'region-44-1-field-2', label: 'Capital', sampleValues: ['Montgomery', 'Juneau'] },
      { fieldId: 'region-44-1-field-3', label: 'Since', sampleValues: ['1846', '1906'] },
    ]);
    expect(region.entries[0]?.item.sourceFields?.map(({ value }) => value))
      .to.deep.equal(['Alabama', 'Montgomery', '1846']);
  });
});
