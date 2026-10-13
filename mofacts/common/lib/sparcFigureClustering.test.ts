import { strict as assert } from 'node:assert';
import { fitSparcFigureClusters, nearestFigureCenter } from './sparcFigureClustering';
const yieldWork = async () => {};
describe('SPARC automatic semantic figure clustering', () => {
  it('chooses two separated semantic directions without requiring a cluster-count parameter', async () => {
    const vectors = Array.from({ length: 12 }, (_, i) => i < 6 ? [1, .01 * i, 0] : [0, .01 * (i - 6), 1]);
    const result = await fitSparcFigureClusters(vectors, yieldWork);
    assert.equal(result.selectedK, 2);
    assert.ok(result.scores.find(score => score.k === 2)!.silhouette! > .9);
    assert.notEqual(nearestFigureCenter([1, 0, 0], result.centers).index, nearestFigureCenter([0, 0, 1], result.centers).index);
    assert.deepEqual(await fitSparcFigureClusters(vectors, yieldWork), result);
  });
  it('keeps tiny and identical collections together and rejects incompatible spaces', async () => {
    assert.equal((await fitSparcFigureClusters([[1, 0], [1, .01]], yieldWork)).selectedK, 1);
    assert.equal((await fitSparcFigureClusters(Array.from({ length: 12 }, () => [1, 0]), yieldWork)).selectedK, 1);
    await assert.rejects(fitSparcFigureClusters([[0, 0]], yieldWork), /zero length/);
    await assert.rejects(fitSparcFigureClusters([[1, 0], [1, 0, 0]], yieldWork), /dimensions/);
  });
});
