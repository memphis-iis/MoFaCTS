<script>
  import { onDestroy } from 'svelte';

  export let component = null;
  export let propsStore = null;

  let componentProps = {};
  let unsubscribe = null;

  $: {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }

    if (propsStore && typeof propsStore.subscribe === 'function') {
      unsubscribe = propsStore.subscribe((nextProps) => {
        componentProps = nextProps || {};
      });
    } else {
      componentProps = {};
    }
  }

  onDestroy(() => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  });
</script>

{#if component}
  <svelte:component this={component} {...componentProps} />
{/if}
