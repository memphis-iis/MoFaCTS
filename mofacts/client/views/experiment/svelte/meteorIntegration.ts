/**
 * Meteor + Svelte Integration Helper
 *
 * Provides utilities for mounting Svelte components in Meteor/Blaze templates
 * and managing their lifecycle.
 */

import { Tracker } from 'meteor/tracker';
import { mount, unmount } from 'svelte';
import { writable } from 'svelte/store';
import ComponentMountBridge from './components/ComponentMountBridge.svelte';

type CleanupHandle = { cleanup(): void };
type ReactivePropsGetter = (() => Record<string, unknown>) | null;
type ComponentCtor = unknown;

/**
 * Mount a Svelte component into a DOM element with Meteor reactivity support
 *
 * @param {HTMLElement} target - DOM element to mount component into
 * @param {SvelteComponent} Component - Svelte component to mount
 * @param {Object} props - Props to pass to component (can include reactive Meteor data)
 * @param {Function} getReactiveProps - Optional function that returns reactive props
 * @returns {Object} - Object with cleanup function
 */
function mountSvelteComponent(
  target: HTMLElement,
  Component: ComponentCtor,
  props: Record<string, unknown> = {},
  getReactiveProps: ReactivePropsGetter = null,
): CleanupHandle {
  if (!target) {
    throw new Error('mountSvelteComponent: target element is required');
  }

  if (!Component) {
    throw new Error('mountSvelteComponent: Component is required');
  }

  let component: unknown = null;
  let computation: { stop(): void } | null = null;
  const propsStore = writable(props || {});

  function mountBridge() {
    component = mount(ComponentMountBridge, {
      target,
      props: {
        component: Component,
        propsStore
      }
    });
  }

  // If reactive props are provided, set up Tracker autorun
  if (getReactiveProps && typeof getReactiveProps === 'function') {
    computation = Tracker.autorun(() => {
      const reactiveProps = getReactiveProps();
      const allProps = { ...props, ...reactiveProps };

      // Mount once, then update props on reactive changes
      propsStore.set(allProps);
      if (!component) {
        mountBridge();
      }
    });
  } else {
    // Static props - mount once
    mountBridge();
  }

  // Return cleanup function
  return {
    cleanup() {
      if (computation) {
        computation.stop();
      }
      if (component) {
        unmount(component);
        component = null;
      }
    }
  };
}

/**
 * Create a Blaze template helper that mounts a Svelte component
 *
 * Usage in template.js:
 * Template.myTemplate.onRendered(function() {
 *   this.svelteMount = createBlazeMount(
 *     this.$('.svelte-container')[0],
 *     MySvelteComponent,
 *     { prop1: 'value1' },
 *     () => ({ reactiveData: Session.get('someData') })
 *   );
 * });
 *
 * Template.myTemplate.onDestroyed(function() {
 *   if (this.svelteMount) {
 *     this.svelteMount.cleanup();
 *   }
 * });
 *
 * @param {HTMLElement} target - DOM element to mount into
 * @param {SvelteComponent} Component - Svelte component
 * @param {Object} staticProps - Non-reactive props
 * @param {Function} getReactiveProps - Function returning reactive props
 * @returns {Object} - Cleanup object
 */
export function createBlazeMount(
  target: HTMLElement,
  Component: ComponentCtor,
  staticProps: Record<string, unknown> = {},
  getReactiveProps: ReactivePropsGetter = null,
): CleanupHandle {
  return mountSvelteComponent(target, Component, staticProps, getReactiveProps);
}

