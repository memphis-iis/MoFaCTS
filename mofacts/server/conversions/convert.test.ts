import { expect } from 'chai';
import { getNewItemFormat } from './convert';
import {
  removeInvisibleUnicode,
  repairFormattedStimuliResponsesFromRaw,
} from '../../common/lib/stimuliResponseRepair';

describe('stimuli response Unicode handling', function() {
  it('preserves accented answers while stripping truly invisible characters', function() {
    expect(removeInvisibleUnicode('ni\u00f1o')).to.equal('ni\u00f1o');
    expect(removeInvisibleUnicode('energ\u00eda')).to.equal('energ\u00eda');
    expect(removeInvisibleUnicode('ni\u200b\u00f1o')).to.equal('ni\u00f1o');
  });

  it('keeps accented correct and incorrect responses when formatting stimuli', function() {
    const formatted = getNewItemFormat({
      stimuli: {
        setspec: {
          clusters: [
            {
              stims: [
                {
                  response: {
                    correctResponse: 'ni\u00f1o',
                    incorrectResponses: ['nina', 'sen\u0303ora', 'energ\u00eda'],
                  },
                  display: {
                    text: 'boy',
                  },
                },
              ],
            },
          ],
        },
      },
    }, 'spanish.json', 77, {});

    expect(formatted).to.have.length(1);
    expect(formatted[0].correctResponse).to.equal('ni\u00f1o');
    expect(formatted[0].incorrectResponses).to.deep.equal(['nina', 'sen\u0303ora', 'energ\u00eda']);
  });

  it('repairs flattened stored stimuli from the raw stimuli file', function() {
    const repaired = repairFormattedStimuliResponsesFromRaw(
      [
        {
          stimulusKC: 1,
          correctResponse: 'nio',
          incorrectResponses: ['senora', 'energia'],
        },
      ],
      {
        setspec: {
          clusters: [
            {
              stims: [
                {
                  response: {
                    correctResponse: 'ni\u00f1o',
                    incorrectResponses: ['se\u00f1ora', 'energ\u00eda'],
                  },
                },
              ],
            },
          ],
        },
      }
    );

    expect(repaired).to.deep.equal([
      {
        stimulusKC: 1,
        correctResponse: 'ni\u00f1o',
        incorrectResponses: ['se\u00f1ora', 'energ\u00eda'],
      },
    ]);
  });
});
