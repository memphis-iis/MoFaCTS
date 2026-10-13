import { Template } from 'meteor/templating';
import './sparcImageLibrary.html';
import SparcImageLibrary from './sparc/SparcImageLibrary.svelte';
import { createBlazeMount } from '../experiment/svelte/meteorIntegration';

Template.sparcImageLibrary.onRendered(function(this: any) {
  this.mount = createBlazeMount(this.find('#sparc-image-library-root'), SparcImageLibrary);
});
Template.sparcImageLibrary.onDestroyed(function(this: any) { this.mount?.cleanup(); });
