import { expect } from 'chai';
import { Meteor } from 'meteor/meteor';
import { tick } from 'svelte';
import { createClassComponent } from 'svelte/legacy';
import MultipleChoice from './MultipleChoice.svelte';

if (Meteor.isClient) describe('multiple-choice interaction across questions', function() {
  let component: ReturnType<typeof createClassComponent>;
  let container: HTMLDivElement;
  let answers: Array<{ index: number; buttonName: string }>;
  let activeChoices: ReturnType<typeof choices>;

  const choices = (question: number) => ['A', 'B', 'C', 'D'].map(answer => ({
    buttonName: `Question ${question} ${answer}`, buttonValue: answer,
    verbalChoice: answer, isImage: false,
  }));

  beforeEach(async function() {
    answers = [];
    activeChoices = choices(1);
    container = document.createElement('div');
    container.className = 'response-area';
    document.body.append(container);
    component = createClassComponent({
      component: MultipleChoice, target: container,
      props: { buttonList: activeChoices, enabled: true, columns: 2 },
    });
    component.$on('choice', (event: CustomEvent) => answers.push(event.detail));
    await tick();
  });

  afterEach(function() {
    component.$destroy();
    container.remove();
  });

  for (const index of [0, 1, 2, 3]) {
    it(`replaces the previously selected button at position ${index} for the next question`, async function() {
      const before = container.querySelectorAll<HTMLButtonElement>('.choice-button');
      before[index]!.focus();
      before[index]!.click();
      expect(answers).to.have.length(1);
      expect(answers[0]!.index).to.equal(index);
      component.$set({ buttonList: choices(2) });
      await tick();
      const after = container.querySelectorAll<HTMLButtonElement>('.choice-button');
      for (let position = 0; position < after.length; position++) {
        expect(after[position]).not.to.equal(before[position]);
      }
      expect(document.activeElement).not.to.equal(before[index]);
      expect(answers).to.have.length(1, 'Updating a question must not submit an answer');
      after[index]!.click();
      expect(answers[1]).to.include({ index, buttonName: `Question 2 ${['A', 'B', 'C', 'D'][index]}` });
    });
  }

  it('clears previous interaction state when the next question has identical answer text', async function() {
    const before = container.querySelector<HTMLButtonElement>('.choice-button')!;
    before.focus();
    before.click();
    component.$set({ buttonList: choices(1) });
    await tick();
    expect(container.querySelector('.choice-button')).not.to.equal(before);
    expect(document.activeElement).not.to.equal(before);
  });

  it('preserves buttons and keyboard focus during updates within the same question', async function() {
    const button = container.querySelector<HTMLButtonElement>('.choice-button')!;
    button.focus();
    component.$set({ buttonList: activeChoices, columns: 1 });
    await tick();
    expect(container.querySelector('.choice-button')).to.equal(button);
    expect(document.activeElement).to.equal(button);
  });

  it('preserves the fitted active grid through submission and parent snapshot updates', async function() {
    // Let the component's scheduled sizing run before submitting an answer.
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const grid = container.querySelector<HTMLElement>('.button-grid')!;
    const before = Array.from(grid.querySelectorAll<HTMLButtonElement>('.choice-button'));
    const fittedStyle = grid.getAttribute('style');
    expect(grid.style.getPropertyValue('--choice-font-size')).not.to.equal('');
    before[0]!.click();
    expect(answers).to.have.length(1);

    // ContentSurface rebuilds props for each machine snapshot, including the
    // unchanged list while input is disabled and another trial is prepared.
    for (let snapshot = 0; snapshot < 3; snapshot++) {
      component.$set({ buttonList: activeChoices, enabled: false, columns: 2 });
      await tick();
      expect(container.querySelector('.button-grid')).to.equal(grid);
      expect(Array.from(grid.querySelectorAll('.choice-button'))).to.deep.equal(before);
      expect(grid.getAttribute('style')).to.equal(fittedStyle);
      expect(before.every(button => button.disabled)).to.equal(true);
      before[0]!.click();
      expect(answers).to.have.length(1);
    }
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    expect(grid.getAttribute('style')).to.equal(fittedStyle);

    // A committed trial has a fresh list even if every answer label repeats.
    component.$set({ buttonList: choices(1), enabled: true, columns: 2 });
    await tick();
    expect(container.querySelector('.button-grid')).not.to.equal(grid);
    expect(before.every(button => !button.isConnected)).to.equal(true);
    const next = container.querySelector<HTMLButtonElement>('.choice-button')!;
    expect(next.disabled).to.equal(false);
    next.click();
    expect(answers).to.have.length(2);
  });

  it('retains arrow navigation and Enter/Space submission after moving to the next question', async function() {
    component.$set({ buttonList: choices(2) });
    await tick();
    const buttons = container.querySelectorAll<HTMLButtonElement>('.choice-button');
    buttons[0]!.focus();
    buttons[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).to.equal(buttons[1]);
    buttons[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    buttons[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(answers.map(answer => answer.index)).to.deep.equal([1, 1]);
  });

  it('does not submit a disabled choice', async function() {
    component.$set({ enabled: false });
    await tick();
    const button = container.querySelector<HTMLButtonElement>('.choice-button')!;
    button.click();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(answers).to.have.length(0);
  });
});
