import { expect } from 'chai';
import {
  DELIVERY_DISPLAY_SETTINGS_RUNTIME_DEFAULTS,
  STIM_REGISTRY_SECTIONS,
  TDF_REGISTRY_SECTIONS,
  createStimSchemaFromRegistry,
  createTdfSchemaFromRegistry,
} from './fieldRegistrySections';

describe('field registry section composition', function() {
  it('keeps the public TDF registry sections grouped by domain', function() {
    expect(TDF_REGISTRY_SECTIONS.map((section) => section.schemaLabel)).to.deep.equal([
      'tutor.setspec',
      'tutor.unit[]',
      'tutor.unit[].learningsession',
      'tutor.unit[].assessmentsession',
      'tutor.unit[].assessmentsession.conditiontemplatesbygroup',
      'tutor.unit[].videosession',
      'tutor.unit[].autotutorsession',
    ]);
  });

  it('keeps the public stimulus registry sections grouped by domain', function() {
    expect(STIM_REGISTRY_SECTIONS.map((section) => section.schemaLabel)).to.deep.equal([
      'setspec.clusters[]',
      'setspec.clusters[].stims[]',
      'setspec.clusters[].stims[].display',
      'setspec.clusters[].stims[].response',
    ]);
  });

  it('still generates schemas across TDF and stimulus registry domains', function() {
    const tdfSchema = createTdfSchemaFromRegistry();
    const stimSchema = createStimSchemaFromRegistry();

    expect(tdfSchema.properties).to.have.property('tutor');
    expect(stimSchema.properties).to.have.property('setspec');
    expect(DELIVERY_DISPLAY_SETTINGS_RUNTIME_DEFAULTS).to.include({
      stimuliPosition: 'top',
      displayCorrectFeedback: true,
      displayIncorrectFeedback: true,
    });
  });

  it('allows cluster-level clusterKC in the public stimulus schema', function() {
    const stimSchema = createStimSchemaFromRegistry() as any;
    const clusterProperties = stimSchema.properties.setspec.properties.clusters.items.properties;

    expect(clusterProperties.clusterKC).to.deep.include({
      title: 'Cluster KC identity.',
    });
    expect(clusterProperties.clusterKC.anyOf).to.deep.equal([
      { type: 'number' },
      { type: 'string' },
    ]);
  });
});
