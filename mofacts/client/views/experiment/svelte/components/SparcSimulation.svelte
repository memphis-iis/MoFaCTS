<script>
  import { getContext, onMount, onDestroy } from 'svelte';
  import { SimulationResearchHost, SIMULATION_HOST_CONTEXT } from '../services/simulationResearchHost';
  import { getActiveUiLocale } from '../../../../lib/interfaceLocaleState';
  import { translatePlatformString } from '../../../../lib/interfaceI18n';
  import { clientConsole } from '../../../../lib/clientLogger';

  export let node;
  export let authoringSelectOnly = false;
  const context = getContext(SIMULATION_HOST_CONTEXT);
  const text = key => translatePlatformString(getActiveUiLocale(), key);
  let iframe;
  let host;
  let status = 'initializing';
  let signature = '';
  let disposed = false;
  function unavailable() {
    if (!disposed) status = 'error';
    clientConsole(1, '[Simulation] Research activity unavailable; verify approved build configuration and telemetry access.');
  }
  onMount(() => {
    if (authoringSelectOnly) return;
    try {
      if (!context) throw new Error('Simulation requires a SPARC session host');
      signature = JSON.stringify(node.simulation);
      host = new SimulationResearchHost({ iframe, config: node.simulation,
        scope: context.scope(node.id, node.simulation.buildId),
        status: value => { if (!disposed) status = value; },
        monitoringError: reason => clientConsole(1, '[Simulation] Monitoring stopped:', reason),
        observation: (facts, evidence, activity) => context.observation(node.id, facts, evidence, activity),
      });
      context.registerHost(node.id, host);
      void host.initialize().catch(unavailable);
    } catch { unavailable(); }
  });
  onDestroy(() => { disposed = true; host?.dispose(); context?.registerHost(node.id, null); });
  $: if (host && signature !== JSON.stringify(node.simulation)) {
    host.dispose(); context?.registerHost(node.id, null); host = null; unavailable();
  }
  async function start() {
    if (!host || !['ready', 'stopped'].includes(status)) return;
    try { await host.start(); } catch { unavailable(); }
  }
</script>

<section class="sparc-simulation" aria-label={node.label}>
  {#if authoringSelectOnly}
    <p>{node.label}</p>
  {:else}
    {#if status === 'ready'}<p role="status">{text('simulation.ready')}</p>{/if}
    {#if status === 'stopped'}<p role="alert">{text('simulation.stopped')}</p>{/if}
    {#if status === 'error'}<p role="alert">{text('simulation.unavailable')}</p>{/if}
    {#if status === 'initializing' || status === 'starting'}<p role="status">{text('common.loading')}</p>{/if}
    {#if status === 'ready' || status === 'stopped'}
      <button type="button" class="btn btn-primary" on:click={start}>{text('simulation.start')}</button>
    {/if}
    <iframe bind:this={iframe} title={node.label} hidden={status !== 'running' && status !== 'starting'}
      sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer"></iframe>
  {/if}
</section>

<style>
  .sparc-simulation { width: 100%; min-width: 0; }
  iframe { width: 100%; height: min(75vh, 900px); min-height: 420px; border: 0; }
  iframe[hidden] { display: none; }
</style>
