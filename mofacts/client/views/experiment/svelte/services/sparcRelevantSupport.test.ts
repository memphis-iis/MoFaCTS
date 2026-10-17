import { strict as assert } from 'node:assert';
import { relevantSupport } from './sparcRelevantSupport';

describe('Previously presented instructional support', () => {
  it('highlights the referenced earlier content and clears the highlight on the next move', async () => {
    const host = document.createElement('div');
    host.innerHTML = '<div data-sparc-speaker="tutor"><div id="old-support">Prior explanation</div></div><div data-sparc-speaker="tutor"><a data-sparc-reference="old-support" href="#old-support">Relevant earlier explanation</a></div>';
    document.body.append(host);
    const action = relevantSupport(host);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(document.getElementById('old-support')?.classList.contains('sparc-relevant-support'), true);
    const next = document.createElement('div'); next.dataset.sparcSpeaker = 'tutor'; host.append(next);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(document.getElementById('old-support')?.classList.contains('sparc-relevant-support'), false);
    action.destroy(); host.remove();
  });
});
