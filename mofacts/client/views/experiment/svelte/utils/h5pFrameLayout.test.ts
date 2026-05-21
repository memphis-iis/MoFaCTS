import { expect } from 'chai';
import { buildH5PFrameLayout } from './h5pFrameLayout';

describe('h5p frame layout', function() {
  it('scales self-hosted content to fit the live viewport height', function() {
    const layout = buildH5PFrameLayout({
      isSelfHosted: true,
      stageWidth: 520,
      stageHeight: 604,
      preferredHeight: 560,
      fitResult: {
        phase: 'question',
        mode: 'scaled',
        measurementWidth: 520,
        naturalWidth: 520,
        naturalHeight: 1908,
        availableWidth: 520,
        availableHeight: 604,
        visualWidth: 520,
        visualHeight: 604,
        scale: 604 / 1908,
        reservedControlHeight: 60,
        reason: 'test',
      },
      naturalWidth: 520,
      naturalHeight: 1908,
      measurementWidth: 520,
      measuring: false,
    });

    expect(layout.displaySurfaceHeight).to.equal(1908);
    expect(layout.displayFrameHeight).to.equal(1908);
    expect(layout.visualStyle).to.equal('width:164px;height:604px;');
    expect(layout.surfaceStyle).to.equal(`width:520px;height:1908px;transform:scale(${604 / 1908});`);
    expect(layout.frameStyle).to.equal('width:520px;height:1908px;');
  });

  it('keeps self-hosted content unscaled while filling the live slot when the measurement already fits', function() {
    const layout = buildH5PFrameLayout({
      isSelfHosted: true,
      stageWidth: 900,
      stageHeight: 700,
      preferredHeight: 560,
      fitResult: {
        phase: 'question',
        mode: 'native',
        measurementWidth: 900,
        naturalWidth: 900,
        naturalHeight: 620,
        availableWidth: 900,
        availableHeight: 700,
        visualWidth: 900,
        visualHeight: 620,
        scale: 1,
        reservedControlHeight: 60,
        reason: 'test',
      },
      naturalWidth: 900,
      naturalHeight: 620,
      measurementWidth: 900,
      measuring: false,
    });

    expect(layout.visualStyle).to.equal('width:900px;height:700px;');
    expect(layout.surfaceStyle).to.equal('width:900px;height:700px;transform:scale(1);');
    expect(layout.frameStyle).to.equal('width:900px;height:700px;');
  });

  it('uses the live stage as the provisional layout while measuring', function() {
    const layout = buildH5PFrameLayout({
      isSelfHosted: true,
      stageWidth: 900,
      stageHeight: 300,
      preferredHeight: 560,
      fitResult: null,
      naturalWidth: 900,
      naturalHeight: 620,
      measurementWidth: 900,
      measuring: true,
    });

    expect(layout.frameScale).to.equal(1);
    expect(layout.visualStyle).to.equal('width:900px;height:300px;');
    expect(layout.surfaceStyle).to.equal('width:900px;height:300px;transform:scale(1);');
    expect(layout.frameStyle).to.equal('width:900px;height:300px;');
  });

  it('ignores partial candidate dimensions in the provisional layout', function() {
    const layout = buildH5PFrameLayout({
      isSelfHosted: true,
      stageWidth: 390,
      stageHeight: 728,
      preferredHeight: 560,
      fitResult: null,
      naturalWidth: null,
      naturalHeight: 620,
      measurementWidth: 1280,
      measuring: true,
    });

    const expectedScale = 1;
    expect(layout.frameScale).to.equal(expectedScale);
    expect(layout.visualStyle).to.equal('width:390px;height:728px;');
    expect(layout.surfaceStyle).to.equal(`width:390px;height:728px;transform:scale(${expectedScale});`);
    expect(layout.frameStyle).to.equal('width:390px;height:728px;');
  });

  it('keeps external embeds on the measured/scaled layout path', function() {
    const layout = buildH5PFrameLayout({
      isSelfHosted: false,
      stageWidth: 500,
      stageHeight: 400,
      preferredHeight: 560,
      fitResult: {
        phase: 'question',
        mode: 'scaled',
        measurementWidth: 1000,
        naturalWidth: 1000,
        naturalHeight: 800,
        availableWidth: 500,
        availableHeight: 400,
        visualWidth: 500,
        visualHeight: 400,
        scale: 0.5,
        reservedControlHeight: 0,
        reason: 'test',
      },
      naturalWidth: 1000,
      naturalHeight: 800,
      measurementWidth: 1000,
      measuring: false,
    });

    expect(layout.displaySurfaceHeight).to.equal(800);
    expect(layout.visualStyle).to.equal('width:500px;height:400px;');
    expect(layout.surfaceStyle).to.equal('width:1000px;height:800px;transform:scale(0.5);');
    expect(layout.frameStyle).to.equal('width:1000px;height:800px;');
  });
});
