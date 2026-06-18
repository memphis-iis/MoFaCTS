import { expect } from 'chai';
import {
  buildCompactLearningProgressChartHeightExpression,
  buildLearningProgressChartStyle,
  resolveLearningProgressChartRowCount,
} from './learningProgressChartSizing';

describe('learningProgressChartSizing', function() {
  it('normalizes compact chart row counts for empty and small SPARC progress widgets', function() {
    expect(resolveLearningProgressChartRowCount(0)).to.equal(1);
    expect(resolveLearningProgressChartRowCount(1)).to.equal(1);
    expect(resolveLearningProgressChartRowCount(7)).to.equal(7);
    expect(resolveLearningProgressChartRowCount(8)).to.equal(8);
  });

  it('keeps large progress reports content-sized by row count', function() {
    expect(resolveLearningProgressChartRowCount(250)).to.equal(250);
    expect(buildLearningProgressChartStyle(250)).to.equal('--progress-row-count: 250');
  });

  it('uses the compact height expression required by the SPARC inline widget plan', function() {
    expect(buildCompactLearningProgressChartHeightExpression()).to.equal(
      'calc(var(--progress-row-count) * var(--progress-bar-height) + (var(--progress-row-count) - 1) * var(--progress-bar-gap))',
    );
  });
});

