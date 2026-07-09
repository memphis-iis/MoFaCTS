import { expect } from 'chai';
import {
  buildStimulusEditorRawStimuliSavePayload,
  mergeEditorContentPreservingSourceShape,
} from './editorSaveShape';

describe('editor save shape preservation', function() {
  it('does not add tutor.unit when a condition-root TDF never had units', function() {
    const source = {
      tdfs: {
        tutor: {
          setspec: {
            lessonname: 'Experiment Root',
            condition: ['a.json'],
          },
        },
      },
    };
    const editorValue = {
      tdfs: {
        tutor: {
          setspec: {
            lessonname: 'Experiment Root',
            condition: ['a.json'],
            loadbalancing: 'max',
          },
          unit: [],
        },
      },
    };

    const saved: any = mergeEditorContentPreservingSourceShape(source, editorValue);

    expect(saved.tdfs.tutor).to.not.have.property('unit');
    expect(saved.tdfs.tutor.setspec.loadbalancing).to.equal('max');
  });

  it('preserves source fields that the editor did not send', function() {
    const source = {
      fileName: 'root.json',
      tdfs: {
        tutor: {
          setspec: {
            lessonname: 'Experiment Root',
            condition: ['a.json', 'b.json'],
            conditionTdfIds: ['a-id', 'b-id'],
            loadbalancing: 'min',
          },
          deliverySettings: {
            experimentLoginText: 'Prolific ID',
          },
        },
      },
      conditionCounts: [3, 4],
    };
    const editorValue = {
      tdfs: {
        tutor: {
          setspec: {
            lessonname: 'Experiment Root',
            loadbalancing: 'max',
          },
        },
      },
    };

    const saved: any = mergeEditorContentPreservingSourceShape(source, editorValue);

    expect(saved.tdfs.tutor.setspec.condition).to.deep.equal(['a.json', 'b.json']);
    expect(saved.tdfs.tutor.setspec.conditionTdfIds).to.deep.equal(['a-id', 'b-id']);
    expect(saved.conditionCounts).to.deep.equal([3, 4]);
    expect(saved.tdfs.tutor.deliverySettings).to.deep.equal({ experimentLoginText: 'Prolific ID' });
    expect(saved.tdfs.tutor.setspec.loadbalancing).to.equal('max');
  });

  it('allows non-empty fields that were intentionally added by the editor', function() {
    const source = {
      tdfs: {
        tutor: {
          setspec: {
            lessonname: 'Lesson',
          },
        },
      },
    };
    const editorValue = {
      tdfs: {
        tutor: {
          setspec: {
            lessonname: 'Lesson',
            tips: ['Read carefully'],
          },
        },
      },
    };

    const saved = mergeEditorContentPreservingSourceShape(source, editorValue);

    expect(saved.tdfs.tutor.setspec.tips).to.deep.equal(['Read carefully']);
  });

  it('does not add empty wrapper fields to stimulus save payloads', function() {
    const saved = buildStimulusEditorRawStimuliSavePayload(undefined, [{ stims: [] }]);

    expect(saved).to.deep.equal({
      setspec: {
        clusters: [{ stims: [] }],
      },
    });
  });

  it('preserves stimulus setspec siblings while replacing clusters', function() {
    const source = {
      setspec: {
        lessonPrompt: 'Keep me',
        clusters: [{ stims: [{ id: 'old' }] }],
      },
      metadata: {
        author: 'source',
      },
    };

    const saved = buildStimulusEditorRawStimuliSavePayload(source, [{ stims: [{ id: 'new' }] }]);

    expect(saved.setspec).to.deep.equal({
      lessonPrompt: 'Keep me',
      clusters: [{ stims: [{ id: 'new' }] }],
    });
    expect(saved.metadata).to.deep.equal({ author: 'source' });
  });
});
