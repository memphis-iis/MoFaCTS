<script>
  import { getActiveUiLocale } from '../../../lib/interfaceLocaleState';
  import { translatePlatformString } from '../../../lib/interfaceI18n';
  import { nodeClusterIndices } from './sparcAuthoringTargets';

  export let activeNode = null;
  export let clusterChoices = [];
  export let onToggleNodeCluster = () => {};

  $: activeNodeClusterIndices = activeNode ? nodeClusterIndices(activeNode) : [];

  const sparcText = (key, values) => translatePlatformString(getActiveUiLocale(), key, values);
</script>

<div class="sparc-context-card sparc-stimulus-attachments-card">
  <div class="sparc-panel-header">
    <h3>{sparcText('sparc.clusterAttachments')}</h3>
  </div>
  <table class="sparc-stimulus-attachment-table">
    <tbody>
      {#each clusterChoices as cluster}
        <tr>
          <td class="sparc-stimulus-checkbox-cell">
            <input
              type="checkbox"
              checked={activeNodeClusterIndices.includes(cluster.clusterIndex)}
              disabled={!cluster.hasFirstStimulus}
              on:change={(event) => onToggleNodeCluster(cluster.clusterIndex, event.currentTarget.checked)}
              aria-label={sparcText('sparc.attachCluster', { index: cluster.clusterIndex })}
            />
          </td>
          <td class="sparc-stimulus-definition-cell">
            <span class="sparc-stimulus-id">{cluster.clusterIndex}: {cluster.label}</span>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .sparc-context-card {
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-subtle-surface);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-card-padding);
  }

  .sparc-stimulus-attachments-card {
    display: flex;
    flex-direction: column;
    gap: var(--sparc-editor-gap-sm);
    padding-top: var(--sparc-editor-card-padding);
    padding-bottom: var(--sparc-editor-card-padding);
  }

  .sparc-panel-header {
    display: flex;
    align-items: center;
    gap: var(--sparc-editor-gap-sm);
    justify-content: space-between;
    min-height: 0;
    margin: 0;
  }

  .sparc-panel-header h3 {
    margin: 0;
    font-size: calc(var(--app-font-size-base) * 1.1);
    line-height: 1.1;
  }

  .sparc-stimulus-attachment-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .sparc-stimulus-checkbox-cell,
  .sparc-stimulus-definition-cell {
    padding: calc(1px * var(--app-density-scale)) var(--app-space-0);
    vertical-align: middle;
    font-size: calc(var(--app-font-size-base) * 0.8);
    line-height: 1.1;
  }

  .sparc-stimulus-checkbox-cell {
    width: 22px;
    text-align: left;
  }

  .sparc-stimulus-checkbox-cell input {
    width: auto;
  }

  .sparc-stimulus-definition-cell {
    width: auto;
  }

  .sparc-stimulus-id {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    display: block;
    font-family: var(--sparc-editor-monospace-font-family);
    font-weight: var(--app-font-weight-semibold, 600);
  }
</style>
