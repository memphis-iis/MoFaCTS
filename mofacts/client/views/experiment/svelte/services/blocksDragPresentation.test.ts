import { expect } from 'chai';
import {
  calculateBlocksFlipTransform,
  serializeBlocksFlipTransform,
} from './blocksDragPresentation';

describe('blocks drag presentation', function() {
  it('translates equal-sized geometry without scaling it', function() {
    expect(calculateBlocksFlipTransform({
      sourceRect: { left: 10, top: 20, width: 40, height: 40 },
      sourceAnchor: { x: 20, y: 20 },
      targetRect: { left: 100, top: 200, width: 40, height: 40 },
      targetAnchor: { x: 20, y: 20 },
    })).to.deep.equal({
      originX: 20,
      originY: 20,
      scaleX: 1,
      scaleY: 1,
      translateX: -90,
      translateY: -180,
    });
  });

  it('calculates independent scales for differently sized pieces', function() {
    expect(calculateBlocksFlipTransform({
      sourceRect: { left: 10, top: 20, width: 40, height: 20 },
      sourceAnchor: { x: 10, y: 5 },
      targetRect: { left: 100, top: 200, width: 80, height: 50 },
      targetAnchor: { x: 20, y: 12.5 },
    })).to.deep.equal({
      originX: 20,
      originY: 12.5,
      scaleX: 0.5,
      scaleY: 0.4,
      translateX: -100,
      translateY: -187.5,
    });
  });

  it('aligns a nonzero grabbed-cell anchor instead of the piece center', function() {
    const transform = calculateBlocksFlipTransform({
      sourceRect: { left: 24, top: 30, width: 62, height: 41 },
      sourceAnchor: { x: 52, y: 10 },
      targetRect: { left: 140, top: 180, width: 101, height: 67 },
      targetAnchor: { x: 84, y: 16 },
    });

    expect(transform.originX).to.equal(84);
    expect(transform.originY).to.equal(16);
    expect(transform.translateX).to.equal(-148);
    expect(transform.translateY).to.equal(-156);
  });

  it('produces keyframe-ready transform text for pickup and return animations', function() {
    expect(serializeBlocksFlipTransform({
      originX: 24,
      originY: 12,
      scaleX: 0.5,
      scaleY: 0.4,
      translateX: -80,
      translateY: 35,
    })).to.equal('translate3d(-80px, 35px, 0) scale(0.5, 0.4)');
  });

  it('rejects geometry that cannot produce a finite FLIP scale', function() {
    expect(() => calculateBlocksFlipTransform({
      sourceRect: { left: 0, top: 0, width: 20, height: 20 },
      sourceAnchor: { x: 10, y: 10 },
      targetRect: { left: 0, top: 0, width: 0, height: 20 },
      targetAnchor: { x: 0, y: 10 },
    })).to.throw('Blocks drag target geometry must have positive dimensions');
  });
});
