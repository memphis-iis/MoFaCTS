import { expect } from 'chai';
import {
  buildH5PCandidateWidths,
  chooseH5PFit,
  getH5PScaleFloor,
  type H5PFitInput,
} from './h5pFitPolicy';

function baseInput(overrides: Partial<H5PFitInput> = {}): H5PFitInput {
  return {
    phase: 'question',
    availableWidth: 1000,
    availableHeight: 600,
    reservedControlHeight: 60,
    scaleFloor: 0.85,
    focusAvailable: false,
    candidates: [
      {
        measurementWidth: 1000,
        naturalHeight: 500,
      },
    ],
    ...overrides,
  };
}

describe('h5pFitPolicy', function() {
  it('chooses native when the preferred measurement fits', function() {
    const result = chooseH5PFit(baseInput());

    expect(result.mode).to.equal('native');
    expect(result.scale).to.equal(1);
    expect(result.visualHeight).to.equal(500);
  });

  it('chooses a width-adjusted candidate before scaling', function() {
    const result = chooseH5PFit(baseInput({
      availableHeight: 500,
      candidates: [
        { measurementWidth: 1000, naturalHeight: 700 },
        { measurementWidth: 850, naturalHeight: 490 },
      ],
    }));

    expect(result.mode).to.equal('width-adjusted');
    expect(result.measurementWidth).to.equal(850);
    expect(result.scale).to.equal(1);
  });

  it('chooses scaled when the best candidate stays above the floor', function() {
    const result = chooseH5PFit(baseInput({
      availableHeight: 500,
      scaleFloor: 0.8,
      candidates: [
        { measurementWidth: 1000, naturalHeight: 625 },
      ],
    }));

    expect(result.mode).to.equal('scaled');
    expect(result.scale).to.equal(0.8);
    expect(result.visualHeight).to.equal(500);
  });

  it('chooses focus when required scale is below the floor and focus is available', function() {
    const result = chooseH5PFit(baseInput({
      availableHeight: 400,
      scaleFloor: 0.85,
      focusAvailable: true,
      candidates: [
        { measurementWidth: 1000, naturalHeight: 600 },
      ],
    }));

    expect(result.mode).to.equal('focus');
    expect(result.reason).to.equal('requires-focus-mode');
  });

  it('still scales when content needs more reduction and focus is unavailable', function() {
    const result = chooseH5PFit(baseInput({
      availableHeight: 400,
      scaleFloor: 0.85,
      focusAvailable: false,
      candidates: [
        { measurementWidth: 1000, naturalHeight: 600 },
      ],
    }));

    expect(result.mode).to.equal('scaled');
    expect(result.reason).to.equal('scaled-below-preferred-floor');
    expect(result.scale).to.equal(2 / 3);
  });

  it('throws when fit is requested without a valid stage size', function() {
    expect(() => chooseH5PFit(baseInput({
      availableWidth: 0,
    }))).to.throw('positive available stage size');
  });

  it('throws when fit is requested without valid measurements', function() {
    expect(() => chooseH5PFit(baseInput({
      candidates: [],
    }))).to.throw('at least one valid measured candidate');
  });

  it('builds deterministic candidate widths', function() {
    expect(buildH5PCandidateWidths(1000)).to.deep.equal([1000, 999, 998, 996, 992, 984, 950, 900, 850, 800]);
    expect(buildH5PCandidateWidths(333)).to.deep.equal([333, 332, 331, 329, 325]);
    expect(buildH5PCandidateWidths(300)).to.deep.equal([300, 285, 270, 255, 240]);
  });

  it('uses stricter scale floors on narrower stages', function() {
    expect(getH5PScaleFloor(1200)).to.equal(0.85);
    expect(getH5PScaleFloor(800)).to.equal(0.9);
    expect(getH5PScaleFloor(500)).to.equal(0.95);
    expect(getH5PScaleFloor(1200, true)).to.equal(0.8);
  });
});
