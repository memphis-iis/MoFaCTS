import { expect } from 'chai';
import { createDisclosureController } from './disclosureController';

describe('admin UI disclosure controller', function() {
  afterEach(function() {
    document.body.replaceChildren();
  });

  it('opens from ArrowDown, focuses the first control, and restores trigger focus on Escape', async function() {
    const trigger = document.createElement('button');
    const panel = document.createElement('div');
    const first = document.createElement('button');
    panel.append(first);
    document.body.append(trigger, panel);
    const controller = createDisclosureController(() => undefined);
    let prevented = false;

    expect(controller.handleTriggerKeydown({
      key: 'ArrowDown',
      preventDefault: () => { prevented = true; },
    }, trigger, panel)).to.equal(true);
    await Promise.resolve();
    expect(prevented).to.equal(true);
    expect(document.activeElement).to.equal(first);

    expect(controller.handlePanelKeydown({
      key: 'Escape',
      preventDefault: () => undefined,
    })).to.equal(true);
    expect(document.activeElement).to.equal(trigger);
  });

  it('closes without moving focus for an outside pointer target', function() {
    const root = document.createElement('div');
    const trigger = document.createElement('button');
    const panel = document.createElement('div');
    const outside = document.createElement('button');
    root.append(trigger, panel);
    document.body.append(root, outside);
    const controller = createDisclosureController(() => undefined);
    controller.open(trigger, panel);

    expect(controller.closeFromOutside(outside, root)).to.equal(true);
    expect(controller.getView()).to.deep.equal({ open: false });
  });
});
