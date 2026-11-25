<script>
  import { getActiveUiLocale } from '../../../lib/interfaceLocaleState';
  import { translatePlatformString } from '../../../lib/interfaceI18n';
  import { validateSimulationConfig } from '../../../../../packages/phet-monitor/lesson';

  export let node;
  export let onUpdateField;
  const text = key => translatePlatformString(getActiveUiLocale(), key);
  let assetText = '';
  let appliedAsset = '';
  let bindingsText = '';
  let appliedBindings = '';
  let error = false;
  $: serializedAsset = JSON.stringify(node.simulation.asset);
  $: if (serializedAsset !== appliedAsset) {
    appliedAsset = serializedAsset;
    assetText = JSON.stringify(node.simulation.asset, null, 2);
  }
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
  function updateAsset() {
    try {
      const config = validateSimulationConfig({ ...node.simulation, asset: JSON.parse(assetText) });
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
  <input value={node.simulation.buildId} on:change={event => updateBuild(event.currentTarget.value)} />
</label>
<label>
  {text('simulation.assets')}
  <textarea rows="8" bind:value={assetText} on:change={updateAsset} spellcheck="false"></textarea>
</label>
<label>
  {text('simulation.bindings')}
  <textarea rows="12" bind:value={bindingsText} on:change={updateBindings} spellcheck="false"></textarea>
</label>
{#if error}<p role="alert">{text('simulation.invalidConfiguration')}</p>{/if}

<style>
  label { display: flex; flex-direction: column; gap: var(--sparc-editor-gap-xs); font-size: calc(var(--app-font-size-base) * 0.85); }
  input, select, textarea { width: 100%; border: 1px solid var(--border-color); background: var(--sparc-editor-input-surface); color: var(--app-text-color); border-radius: var(--sparc-editor-border-radius-sm); padding: var(--sparc-editor-control-padding-y) var(--sparc-editor-control-padding-x); }
</style>
