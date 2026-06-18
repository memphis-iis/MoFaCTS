import assert from 'node:assert/strict';
import { normalizeSparcFractionGroups } from './sparcFractionGroups';

describe('normalizeSparcFractionGroups', function() {
  it('converts adjacent top and bottom fraction atoms into an explicit fraction group', function() {
    const nodes = normalizeSparcFractionGroups([{
      id: 'known-top',
      nodeType: 'atomic',
      atomType: 'fraction-box',
      position: 'top',
      value: '1',
    }, {
      id: 'known-bottom',
      nodeType: 'atomic',
      atomType: 'fraction-box',
      position: 'bottom',
      value: '4',
    }]);

    assert.equal(nodes.length, 1);
    const fraction = nodes[0] as Record<string, unknown>;
    assert.equal(fraction.nodeType, 'group');
    assert.equal(fraction.groupType, 'fraction');
    const children = fraction.children as Record<string, unknown>[];
    assert.equal(children[0]?.id, 'known-top');
    assert.equal(children[0]?.fractionRole, 'numerator');
    assert.equal(children[1]?.id, 'known-bottom');
    assert.equal(children[1]?.fractionRole, 'denominator');
  });

  it('normalizes fraction pairs inside rendered groups', function() {
    const nodes = normalizeSparcFractionGroups([{
      id: 'equation-row',
      nodeType: 'group',
      groupType: 'equation-row',
      children: [{
        id: 'converted-top',
        nodeType: 'atomic',
        atomType: 'fraction-input',
        position: 'top',
        value: '',
      }, {
        id: 'converted-bottom',
        nodeType: 'atomic',
        atomType: 'fraction-input',
        position: 'bottom',
        value: '',
      }],
    }]);

    const row = nodes[0] as Record<string, unknown>;
    const children = row.children as Record<string, unknown>[];
    assert.equal(children.length, 1);
    assert.equal(children[0]?.groupType, 'fraction');
  });

  it('leaves explicit fraction groups intact while normalizing their children', function() {
    const nodes = normalizeSparcFractionGroups([{
      id: 'fraction-one',
      nodeType: 'group',
      groupType: 'fraction',
      children: [{
        id: 'fraction-one-numerator',
        nodeType: 'atomic',
        atomType: 'fraction-input',
        fractionRole: 'numerator',
      }, {
        id: 'fraction-one-denominator',
        nodeType: 'atomic',
        atomType: 'fraction-box',
        fractionRole: 'denominator',
      }],
    }]);

    const fraction = nodes[0] as Record<string, unknown>;
    assert.equal(fraction.id, 'fraction-one');
    assert.equal(fraction.groupType, 'fraction');
    const children = fraction.children as Record<string, unknown>[];
    assert.equal(children.length, 2);
  });
});
