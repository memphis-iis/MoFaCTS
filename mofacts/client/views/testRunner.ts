import { Template } from 'meteor/templating';
import './svelteCardTester';
import './testRunner.html';

declare const $: (selector: string | EventTarget | null) => {
  slideDown(): void;
  slideUp(): void;
  removeClass(className: string): { addClass(className: string): void };
  html(value: string): void;
};

Template.testRunner.events({
  'click .open-svelte-tester'(event: Event) {
    event.preventDefault();
    $('#svelte-tester-container').slideDown();
    $('.open-svelte-tester').html('<i class="fa fa-eye-slash"></i> Hide Svelte Card Tester');
    $('.open-svelte-tester').removeClass('open-svelte-tester').addClass('close-svelte-tester');
  },

  'click .close-svelte-tester'(event: Event) {
    event.preventDefault();
    $('#svelte-tester-container').slideUp();
    $('.close-svelte-tester').html('<i class="fa fa-eye"></i> Open Svelte Card Tester');
    $('.close-svelte-tester').removeClass('close-svelte-tester').addClass('open-svelte-tester');
  }
});
