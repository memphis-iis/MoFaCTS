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
    assert.equal((await fitSparcFigureClusters([[1, 0]], yieldWork)).selectedK, 1);
    assert.equal((await fitSparcFigureClusters([[1, 0], [1, .01]], yieldWork)).selectedK, 1);
    assert.equal((await fitSparcFigureClusters(Array.from({ length: 12 }, () => [1, 0]), yieldWork)).selectedK, 1);
    await assert.rejects(fitSparcFigureClusters([[0, 0]], yieldWork), /zero length/);
    await assert.rejects(fitSparcFigureClusters([[1, 0], [1, 0, 0]], yieldWork), /dimensions/);
  });
  it('can split three figures into a related pair and a singleton with a finite score', async () => {
    const vectors = [[1, 0], [1, .01], [0, 1]];
    const result = await fitSparcFigureClusters(vectors, yieldWork);
    assert.equal(result.selectedK, 2);
    const assignments = vectors.map(vector => nearestFigureCenter(vector, result.centers).index);
    assert.equal(assignments[0], assignments[1]);
    assert.notEqual(assignments[0], assignments[2]);
    const score = result.scores.find(candidate => candidate.k === 2)!.silhouette!;
    assert.ok(Number.isFinite(score) && score > .6 && score <= 2 / 3);
  });
  it('selects three topics for two close pairs and one distinct figure', async () => {
    const vectors = [[1, 0, 0], [1, .01, 0], [0, 1, 0], [.01, 1, 0], [0, 0, 1]];
    const result = await fitSparcFigureClusters(vectors, yieldWork);
    assert.equal(result.selectedK, 3);
    const assignments = vectors.map(vector => nearestFigureCenter(vector, result.centers).index);
    assert.equal(assignments[0], assignments[1]);
    assert.equal(assignments[2], assignments[3]);
    assert.notEqual(assignments[0], assignments[2]);
    assert.notEqual(assignments[4], assignments[0]);
    assert.notEqual(assignments[4], assignments[2]);
    assert.ok(result.scores.every(candidate => Number.isFinite(candidate.loss)
      && (candidate.silhouette === null || Number.isFinite(candidate.silhouette))));
    assert.deepEqual(await fitSparcFigureClusters(vectors, yieldWork), result);
  });
});
