import { expect } from 'chai';
import { Writer } from 'protobufjs/minimal';
import {
  buildApkgFieldContent,
  detectApkgArchiveFormat,
  parseApkgLegacyMediaIndex,
  parseApkgModernMediaIndex,
} from './apkgProcessor';

function buildModernMediaPayload(filenames: string[]) {
  const writer = Writer.create();
  filenames.forEach((filename, index) => {
    writer
      .uint32(10)
      .fork()
      .uint32(10)
      .string(filename)
      .uint32(16)
      .uint32(1000 + index)
      .uint32(26)
      .bytes(new Uint8Array([index + 1]))
      .ldelim();
  });
  return writer.finish();
}

describe('apkgProcessor modern package support', function() {
  it('detects legacy APKG packages from JSON media and collection.anki21', function() {
    const format = detectApkgArchiveFormat(
      ['collection.anki21', 'collection.anki2', 'media'],
      new TextEncoder().encode('{"0":"front.png"}')
    );

    expect(format).to.equal('legacy');
  });

  it('detects modern APKG packages and ignores dummy collection.anki2', function() {
    const format = detectApkgArchiveFormat(
      ['collection.anki21b', 'collection.anki2', 'media'],
      new Uint8Array([0x28, 0xb5, 0x2f, 0xfd, 0x00])
    );

    expect(format).to.equal('modern');
  });

  it('rejects mixed APKG packages without a silent alternate path', function() {
    expect(() => detectApkgArchiveFormat(
      ['collection.anki21b', 'collection.anki2', 'media'],
      new TextEncoder().encode('{"0":"front.png"}')
    )).to.throw('modern packages must include collection.anki21b and Zstandard-compressed media');

    expect(() => detectApkgArchiveFormat(
      ['collection.anki21', 'media'],
      new Uint8Array([0x28, 0xb5, 0x2f, 0xfd, 0x00])
    )).to.throw('modern packages must include collection.anki21b and Zstandard-compressed media');
  });

  it('parses legacy JSON media maps', function() {
    expect(parseApkgLegacyMediaIndex('{"0":"front.png","1":"back.mp3"}')).to.deep.equal({
      '0': 'front.png',
      '1': 'back.mp3',
    });
  });

  it('parses modern protobuf media maps into numeric Anki media keys', function() {
    const mediaIndex = parseApkgModernMediaIndex(buildModernMediaPayload([
      'front.png',
      'back.mp3',
    ]));

    expect(mediaIndex).to.deep.equal({
      '0': 'front.png',
      '1': 'back.mp3',
    });
  });

  it('fails clearly for unsupported modern media protobuf shapes', function() {
    expect(() => parseApkgModernMediaIndex(new Uint8Array([0x12, 0x00])))
      .to.throw('Invalid modern APKG media protobuf');
  });

  it('classifies APKG sound tags as audio instead of images', function() {
    const zip = {
      file: (key: string) => key === '7' ? {} : null,
    };

    const content = buildApkgFieldContent(
      '[sound:quizlet-1771722878550018-back.mp3]',
      'audio',
      { '7': 'quizlet-1771722878550018-back.mp3' },
      { 'quizlet-1771722878550018-back.mp3': '7' },
      zip
    );

    expect(content.audio).to.equal('quizlet-1771722878550018-back.mp3');
    expect(content.image).to.equal(null);
    expect(content.resolvedRefs).to.have.length(1);
  });
});
