<script>
  import { Meteor } from 'meteor/meteor';
  import { getActiveUiLocale } from '../../../lib/interfaceLocaleState';
  import { translatePlatformString } from '../../../lib/interfaceI18n';
  import { approvedSimulationBuild } from '../../../../common/simulationBuildCatalog';
  import { validateSimulationConfig } from '../../../../../packages/phet-monitor/lesson';

  export let node;
  export let onUpdateField;
  const text = key => translatePlatformString(getActiveUiLocale(), key);
  const configured = Meteor.settings.public?.simulationBuilds;
  let builds = [];
  let configurationError = false;
  try {
    if (!Array.isArray(configured) || !configured.length) throw new Error('Approved builds are not configured');
    builds = configured.map(build => approvedSimulationBuild(configured, build?.id));
  } catch { configurationError = true; }
  let bindingsText = '';
  let appliedBindings = '';
  let error = false;
  $: serializedBindings = JSON.stringify(node.simulation.bindings);
  $: if (serializedBindings !== appliedBindings) {
    appliedBindings = serializedBindings;
    bindingsText = JSON.stringify(node.simulation.bindings, null, 2);
    error = false;
  }
  function updateLabel(value) {
    if (!value.trim()) { error = true; return; }
    error = false; onUpdateField('label', value);
  }
  function updateBuild(value) {
    try {
      approvedSimulationBuild(configured, value);
      const config = validateSimulationConfig({ ...node.simulation, buildId: value });
      error = false; onUpdateField('simulation', config);
    } catch { error = true; }
  }
  function updateBindings() {
    try {
      const config = validateSimulationConfig({ ...node.simulation, bindings: JSON.parse(bindingsText) });
      error = false; onUpdateField('simulation', config);
    } catch { error = true; }
  }
</script>

<label>
  {text('sparc.label')}
  <input value={node.label} on:change={event => updateLabel(event.currentTarget.value)} />
</label>
<label>
  {text('simulation.build')}
  <select value={node.simulation.buildId} on:change={event => updateBuild(event.currentTarget.value)}>
    {#if !builds.some(build => build.id === node.simulation.buildId)}
      <option value={node.simulation.buildId} disabled>{text('simulation.chooseBuild')}</option>
    {/if}
    {#each builds as build (build.id)}<option value={build.id}>{build.id}</option>{/each}
  </select>
</label>
<label>
  {text('simulation.bindings')}
  <textarea rows="12" bind:value={bindingsText} on:change={updateBindings} spellcheck="false"></textarea>
</label>
{#if error || configurationError}<p role="alert">{text('simulation.invalidConfiguration')}</p>{/if}

<style>
  label { display: flex; flex-direction: column; gap: var(--sparc-editor-gap-xs); font-size: calc(var(--app-font-size-base) * 0.85); }
  input, select, textarea { width: 100%; border: 1px solid var(--border-color); background: var(--sparc-editor-input-surface); color: var(--app-text-color); border-radius: var(--sparc-editor-border-radius-sm); padding: var(--sparc-editor-control-padding-y) var(--sparc-editor-control-padding-x); }
</style>
