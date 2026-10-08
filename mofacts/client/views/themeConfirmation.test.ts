import { expect } from 'chai';
import sinon from 'sinon';
import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Tracker } from 'meteor/tracker';
import { ReactiveVar } from 'meteor/reactive-var';
import './theme';

declare const Blaze: any;
declare const DynamicSettings: any;

if (Meteor.isClient) describe('theme deletion confirmation rendered by Blaze', () => {
  let container: HTMLDivElement;
  let view: any;
  let call: sinon.SinonStub;
  let themes: ReactiveVar<Array<{ id: string; metadata: { name: string; origin: string }; properties: Record<string, unknown> }>>;
  async function settle() {
    await new Promise(resolve => setTimeout(resolve, 0));
    Tracker.flush();
  }
  beforeEach(async () => {
    const helpers = (Template as any).theme.__helpers;
    const hasHelper = helpers.has.bind(helpers);
    const getHelper = helpers.get.bind(helpers);
    // Blaze checks has() before get(). Declare the synthetic admin helper so
    // this fixture reaches the real theme UI instead of the anonymous branch.
    sinon.stub(helpers, 'has').callsFake((name: unknown) => name === 'isInRole' || hasHelper(name));
    sinon.stub(helpers, 'get').callsFake((name: unknown) => name === 'isInRole' ? () => true : getHelper(name));
    sinon.stub(Meteor, 'subscribe').callsFake((...args: any[]) => {
      const callbacks = args[args.length - 1];
      queueMicrotask(() => callbacks?.onReady?.());
      return { ready: () => true, stop() {}, subscriptionId: 'theme-confirmation-test' } as any;
    });
    call = sinon.stub(Meteor as any, 'callAsync').resolves(null);
    themes = new ReactiveVar(['selected', 'other'].map(id => ({
      id, metadata: { name: id, origin: 'custom' }, properties: {},
    })));
    sinon.stub(DynamicSettings, 'findOne').callsFake((selector: any) => {
      if (selector?.key === 'themeLibrary') return { value: themes.get() };
      return null;
    });
    container = document.createElement('div');
    document.body.append(container);
    view = Blaze.render((Template as any).theme, container);
    await settle();
    await settle();
  });
  afterEach(() => {
    Blaze.remove(view);
    container.remove();
    sinon.restore();
  });
  function selected(): HTMLButtonElement {
    const button = container.querySelector<HTMLButtonElement>('.delete-theme[data-id="selected"]');
    expect(button).not.to.equal(null);
    return button!;
  }
  async function open() {
    selected().click();
    await settle();
    const panel = container.querySelector<HTMLElement>('.admin-inline-confirmation[aria-hidden="false"]');
    expect(panel).not.to.equal(null);
    expect(panel!.closest('.theme-pill')!.querySelector('.delete-theme')!.getAttribute('data-id')).to.equal('selected');
    expect(document.activeElement).to.equal(panel!.querySelector('[data-confirmation-initial-focus]'));
    return panel!;
  }
  for (const cancellation of ['Cancel', 'Escape']) it(`opens from closed state and ${cancellation} preserves the selected theme and returns focus`, async () => {
    const panel = await open();
    if (cancellation === 'Cancel') panel.querySelector<HTMLButtonElement>('.admin-confirmation-cancel')!.click();
    else panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    // The shared component retains its hidden section when closed.
    expect(container.querySelector('.admin-inline-confirmation[aria-hidden="false"]')).to.equal(null);
    expect(call.calledWith('deleteTheme')).to.equal(false);
    expect(document.activeElement).to.equal(selected());
    await open();
  });
  it('confirms only the selected theme and ignores duplicate confirmation clicks', async () => {
    let finish!: () => void;
    call.withArgs('deleteTheme', 'selected').returns(new Promise<void>(resolve => {
      finish = () => { themes.set(themes.get().filter(theme => theme.id !== 'selected')); resolve(); };
    }));
    const panel = await open();
    const confirm = panel.querySelector<HTMLButtonElement>('.admin-confirmation-confirm')!;
    confirm.click();
    confirm.click();
    await settle();
    expect(call.getCalls().filter(item => item.args[0] === 'deleteTheme').map(item => item.args)).to.deep.equal([['deleteTheme', 'selected']]);
    expect(document.activeElement).to.equal(container.querySelector('[data-theme-confirmation-return-fallback]'));
    finish();
    await settle();
    expect(container.querySelector('.delete-theme[data-id="selected"]')).to.equal(null);
    expect(container.querySelector('.delete-theme[data-id="other"]')).not.to.equal(null);
    expect(document.activeElement).to.equal(container.querySelector('[data-theme-confirmation-return-fallback]'));
  });
});
