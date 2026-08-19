<script>
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
  import FlashcardSessionSurface from './FlashcardSessionSurface.svelte';
  import {
    canPlaceBlocksPiece,
    placeBlocksPiece,
    replenishBlocksAfterCorrectAnswer,
    resolveBlocksPlacement,
  } from '../services/blocksGameEngine';
  import {
    loadBlocksPracticeGame,
    saveBlocksPracticeGame,
  } from '../services/blocksPracticeRunState';
  import {
    calculateBlocksFlipTransform,
    serializeBlocksFlipTransform,
  } from '../services/blocksDragPresentation';

  const dispatch = createEventDispatcher();
  const DRAG_PREVIEW_GAP = 3;
  const PICKUP_DURATION_MS = 140;
  const RETURN_DURATION_MS = 160;
  const DRAG_EASING = 'cubic-bezier(.22, 1, .36, 1)';
  const CLEAR_POP_DURATION_MS = 320;
  const CLEAR_POP_STAGGER_MS = 32;
  const CLEAR_SETTLE_DURATION_MS = 150;
  const OVERLAY_VIEWPORT_QUERY = '(max-width: 899px)';

  export let flashcardProps = {};
  export let boardActive = false;
  export let showDrill = false;
  export let trayGeneration = 0;
  export let trialContentFadeElement = null;

  let game = loadBlocksPracticeGame();
  let boardElement;
  let dragging = null;
  let appliedTrayGeneration = 0;
  let boardCellSize = 18;
  let dragPreviewElement = null;
  let dragAnimation = null;
  let dragSequence = 0;
  let clearingCells = new Map();
  let clearAnimationTimer = null;
  let boardExitTimer = null;
  let boardExitDeferred = false;
  let blocksAudioContext = null;
  let drillMounted = showDrill;
  let retainedFlashcardProps = flashcardProps;
  let drillCleanupPending = false;
  let narrowViewport = typeof window !== 'undefined' && window.matchMedia(OVERLAY_VIEWPORT_QUERY).matches;

  $: usesOverlayLayout = narrowViewport;

  $: preview = dragging && dragging.phase !== 'returning'
    ? boardCellAt(dragging.clientX, dragging.clientY, dragging.anchorRow, dragging.anchorCol)
    : null;
  $: previewIsLegal = Boolean(preview && canPlaceBlocksPiece(game.board, dragging.piece, preview.row, preview.col));
  $: previewCells = preview && previewIsLegal
    ? new Set(dragging.piece.cells.map(([row, col]) => `${preview.row + row}:${preview.col + col}`))
    : new Set();

  // In overlay layout the board behaves as a moving cover. Keep the completed
  // drill frozen underneath it until the board's upward transition has
  // finished; otherwise the flashcard tears down while it is still visible.
  $: syncDrillPresentation(showDrill, boardActive, flashcardProps, usesOverlayLayout);

  function syncDrillPresentation(nextShowDrill, nextBoardActive, nextFlashcardProps, nextUsesOverlayLayout) {
    if (nextShowDrill) {
      retainedFlashcardProps = nextFlashcardProps;
      drillMounted = true;
      drillCleanupPending = false;
      return;
    }
    if (!drillMounted) return;
    if (nextBoardActive && nextUsesOverlayLayout) {
      drillCleanupPending = true;
      return;
    }
    drillMounted = false;
    drillCleanupPending = false;
  }

  function finishBoardCover(event) {
    if (
      event.target !== event.currentTarget ||
      event.propertyName !== 'transform' ||
      !drillCleanupPending ||
      !boardActive ||
      showDrill
    ) return;
    drillMounted = false;
    drillCleanupPending = false;
  }

  // Returning to the board after the required question awards exactly one tray.
  // The machine token, rather than surface visibility, is the ownership boundary.
  $: if (trayGeneration > appliedTrayGeneration) {
    if (game.gate === 'question') {
      game = saveBlocksPracticeGame(replenishBlocksAfterCorrectAnswer(game));
    }
    appliedTrayGeneration = trayGeneration;
  }

  function boardCellAt(clientX, clientY, anchorRow = 0, anchorCol = 0) {
    if (!boardElement) return null;
    // Resolve the actual cell under the pointer rather than estimating from
    // board bounds.  Padding and grid gaps otherwise make a drop land one
    // cell away from the piece the learner is holding.
    const target = document.elementFromPoint(clientX, clientY)?.closest('[data-board-row][data-board-col]');
    if (!target || !boardElement.contains(target)) return null;
    const row = Number(target.dataset.boardRow) - anchorRow;
    const col = Number(target.dataset.boardCol) - anchorCol;
    return { row, col };
  }

  function startDrag(event, trayIndex, piece) {
    if (!boardActive || game.gate !== 'board' || !piece || dragging) return;
    const sourcePiece = event.currentTarget.querySelector('.blocks-piece');
    const sourceCell = event.target.closest('[data-piece-row][data-piece-col]');
    const anchorRow = Number(sourceCell?.dataset.pieceRow || 0);
    const anchorCol = Number(sourceCell?.dataset.pieceCol || 0);
    const sourceAnchorCell = sourceCell || sourcePiece?.querySelector(
      `[data-piece-row="${anchorRow}"][data-piece-col="${anchorCol}"]`,
    );
    if (!sourcePiece || !sourceAnchorCell) return;
    const sourceRect = sourcePiece.getBoundingClientRect();
    const sourceAnchorRect = sourceAnchorCell.getBoundingClientRect();
    const previewCellSize = boardCellSize;
    const dragId = ++dragSequence;
    dragging = {
      id: dragId,
      phase: 'lifting',
      trayIndex,
      piece,
      pointerId: event.pointerId,
      anchorRow,
      anchorCol,
      clientX: event.clientX,
      clientY: event.clientY,
      previewCellSize,
      sourcePiece,
      sourceAnchorCell,
      sourceRect,
      sourceAnchor: {
        x: sourceAnchorRect.left - sourceRect.left + sourceAnchorRect.width / 2,
        y: sourceAnchorRect.top - sourceRect.top + sourceAnchorRect.height / 2,
      },
      // The picked-up piece expands to exact board-cell dimensions and stays
      // centered on the particular piece cell the learner grabbed.
      offsetX: anchorCol * (previewCellSize + DRAG_PREVIEW_GAP) + previewCellSize / 2,
      offsetY: anchorRow * (previewCellSize + DRAG_PREVIEW_GAP) + previewCellSize / 2,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    playGrabSound();
    event.preventDefault();
    void animatePickup(dragId);
  }

  function moveDrag(event) {
    if (!dragging || dragging.phase === 'returning' || event.pointerId !== dragging.pointerId) return;
    dragging = { ...dragging, clientX: event.clientX, clientY: event.clientY };
  }

  function finishDrag(event) {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    const completedDrag = dragging;
    const target = boardCellAt(event.clientX, event.clientY, completedDrag.anchorRow, completedDrag.anchorCol);
    if (!target || !canPlaceBlocksPiece(game.board, completedDrag.piece, target.row, target.col)) {
      beginReturn(completedDrag);
      return;
    }
    stopDragAnimation();
    dragging = null;
    placePiece(completedDrag.trayIndex, target.row, target.col);
  }

  function cancelDrag(event) {
    if (dragging && event.pointerId === dragging.pointerId) beginReturn(dragging);
  }

  function prefersReducedMotion() {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function previewAnchor(drag) {
    return {
      x: drag.anchorCol * (drag.previewCellSize + DRAG_PREVIEW_GAP) + drag.previewCellSize / 2,
      y: drag.anchorRow * (drag.previewCellSize + DRAG_PREVIEW_GAP) + drag.previewCellSize / 2,
    };
  }

  function stopDragAnimation() {
    if (!dragAnimation) return;
    dragAnimation.onfinish = null;
    dragAnimation.cancel();
    dragAnimation = null;
  }

  async function animatePickup(dragId) {
    await tick();
    if (!dragging || dragging.id !== dragId || !dragPreviewElement) return;
    const activeDrag = dragging;
    const targetRect = dragPreviewElement.getBoundingClientRect();
    const transform = calculateBlocksFlipTransform({
      sourceRect: activeDrag.sourceRect,
      sourceAnchor: activeDrag.sourceAnchor,
      targetRect,
      targetAnchor: previewAnchor(activeDrag),
    });
    const pickupTransform = serializeBlocksFlipTransform(transform);
    dragPreviewElement.style.transformOrigin = `${transform.originX}px ${transform.originY}px`;
    dragPreviewElement.style.transform = pickupTransform;

    if (prefersReducedMotion()) {
      dragPreviewElement.style.transform = 'none';
      dragging = { ...activeDrag, phase: 'tracking' };
      return;
    }

    const animation = dragPreviewElement.animate(
      [{ transform: pickupTransform }, { transform: 'none' }],
      { duration: PICKUP_DURATION_MS, easing: DRAG_EASING, fill: 'both' },
    );
    dragAnimation = animation;
    animation.onfinish = () => {
      if (dragAnimation !== animation || !dragging || dragging.id !== dragId || !dragPreviewElement) return;
      dragPreviewElement.style.transform = 'none';
      animation.cancel();
      dragAnimation = null;
      dragging = { ...dragging, phase: 'tracking' };
    };
  }

  function beginReturn(completedDrag) {
    if (!dragging || dragging.id !== completedDrag.id || dragging.phase === 'returning') return;
    dragging = { ...dragging, phase: 'returning' };
    void animateReturn(completedDrag.id);
  }

  async function animateReturn(dragId) {
    await tick();
    if (!dragging || dragging.id !== dragId || !dragPreviewElement) return;
    const activeDrag = dragging;

    if (prefersReducedMotion()) {
      stopDragAnimation();
      dragging = null;
      return;
    }

    const currentTransform = getComputedStyle(dragPreviewElement).transform;
    stopDragAnimation();
    dragPreviewElement.style.transform = 'none';
    const previewRect = dragPreviewElement.getBoundingClientRect();
    dragPreviewElement.style.transform = currentTransform;

    const sourceRect = activeDrag.sourcePiece.getBoundingClientRect();
    const sourceAnchorRect = activeDrag.sourceAnchorCell.getBoundingClientRect();
    const transform = calculateBlocksFlipTransform({
      sourceRect,
      sourceAnchor: {
        x: sourceAnchorRect.left - sourceRect.left + sourceAnchorRect.width / 2,
        y: sourceAnchorRect.top - sourceRect.top + sourceAnchorRect.height / 2,
      },
      targetRect: previewRect,
      targetAnchor: previewAnchor(activeDrag),
    });
    const returnTransform = serializeBlocksFlipTransform(transform);
    dragPreviewElement.style.transformOrigin = `${transform.originX}px ${transform.originY}px`;
    const animation = dragPreviewElement.animate(
      [{ transform: currentTransform }, { transform: returnTransform }],
      { duration: RETURN_DURATION_MS, easing: DRAG_EASING, fill: 'both' },
    );
    dragAnimation = animation;
    animation.onfinish = () => {
      if (dragAnimation !== animation || !dragging || dragging.id !== dragId) return;
      animation.cancel();
      dragAnimation = null;
      dragging = null;
    };
  }

  function handleBoardKeydown(event, row, col) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!boardActive) return;
    const trayIndex = game.tray.findIndex(Boolean);
    if (trayIndex < 0) return;
    event.preventDefault();
    placePiece(trayIndex, row, col);
  }

  function placePiece(trayIndex, row, col) {
    const piece = game.tray[trayIndex];
    if (!piece) return;
    const resolution = resolveBlocksPlacement(game.board, piece, row, col);
    const nextGame = placeBlocksPiece(game, trayIndex, row, col);
    playDropSound();
    const clearDurationMs = animateClearedCells(piece, row, col, resolution.rowsCleared, resolution.colsCleared);
    game = saveBlocksPracticeGame(nextGame);
    if (nextGame.gate === 'question') {
      deferBoardExitAfterClear(clearDurationMs);
      dispatch('traycomplete');
    }
  }

  function deferBoardExitAfterClear(clearDurationMs) {
    if (!usesOverlayLayout || clearDurationMs === 0 || prefersReducedMotion()) return;
    if (boardExitTimer) clearTimeout(boardExitTimer);
    boardExitDeferred = true;
    boardExitTimer = setTimeout(() => {
      boardExitDeferred = false;
      boardExitTimer = null;
    }, clearDurationMs + CLEAR_SETTLE_DURATION_MS);
  }

  function animateClearedCells(piece, placementRow, placementCol, rows, cols) {
    if (rows.length === 0 && cols.length === 0) return 0;
    const placedCells = new Map(piece.cells.map(([row, col]) => [`${placementRow + row}:${placementCol + col}`, piece.family]));
    const nextClearingCells = new Map();
    for (const row of rows) {
      for (let col = 0; col < 10; col += 1) {
        const key = `${row}:${col}`;
        nextClearingCells.set(key, placedCells.get(key) || game.board[row]?.[col]);
      }
    }
    for (const col of cols) {
      for (let row = 0; row < 10; row += 1) {
        const key = `${row}:${col}`;
        nextClearingCells.set(key, placedCells.get(key) || game.board[row]?.[col]);
      }
    }
    clearingCells = new Map([...nextClearingCells.entries()].map(([key, family], index) => [key, { family, index }]));
    if (clearAnimationTimer) clearTimeout(clearAnimationTimer);
    [...nextClearingCells.keys()].forEach((_, index) => playClearPop(index * CLEAR_POP_STAGGER_MS));
    const clearDurationMs = CLEAR_POP_DURATION_MS + Math.max(0, nextClearingCells.size - 1) * CLEAR_POP_STAGGER_MS;
    clearAnimationTimer = setTimeout(() => {
      clearingCells = new Map();
      clearAnimationTimer = null;
    }, clearDurationMs);
    return clearDurationMs;
  }

  function getAudioContext() {
    if (blocksAudioContext || typeof window === 'undefined') return blocksAudioContext;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    blocksAudioContext = new Context();
    if (blocksAudioContext.state === 'suspended') void blocksAudioContext.resume();
    return blocksAudioContext;
  }

  function playTone({ frequency, endFrequency = frequency, duration, delay = 0, volume = 0.035, type = 'sine' }) {
    const context = getAudioContext();
    if (!context) return;
    const start = context.currentTime + delay / 1000;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function playGrabSound() { playTone({ frequency: 523.25, endFrequency: 783.99, duration: 0.09, volume: 0.025 }); }
  function playDropSound() { playTone({ frequency: 659.25, endFrequency: 987.77, duration: 0.12, volume: 0.035 }); }
  function playClearPop(delay) { playTone({ frequency: 330, endFrequency: 165, duration: 0.07, delay, volume: 0.022, type: 'triangle' }); }

  onMount(() => {
    const viewportQuery = window.matchMedia(OVERLAY_VIEWPORT_QUERY);
    const updateNarrowViewport = (event) => { narrowViewport = event.matches; };
    narrowViewport = viewportQuery.matches;
    viewportQuery.addEventListener('change', updateNarrowViewport);

    const updateBoardCellSize = () => {
      const cell = boardElement?.querySelector('.blocks-board__cell');
      const width = cell?.getBoundingClientRect().width;
      if (Number.isFinite(width) && width > 0) boardCellSize = width;
    };
    updateBoardCellSize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateBoardCellSize);
    if (boardElement && observer) observer.observe(boardElement);
    return () => {
      observer?.disconnect();
      viewportQuery.removeEventListener('change', updateNarrowViewport);
    };
  });

  function pieceColor(family) {
    return {
      single: '#ef6c5b',
      line: '#4a90e2',
      sq2: '#f4bc42',
      sq3: '#8b5bd6',
      l2: '#39a96b',
      l3: '#df6aa1',
    }[family] || '#4a90e2';
  }

  function forward(name, detail) {
    dispatch(name, detail);
  }

  function leaveGame() {
    dispatch('exit');
  }

  onDestroy(() => {
    dragSequence += 1;
    stopDragAnimation();
    dragging = null;
    if (clearAnimationTimer) clearTimeout(clearAnimationTimer);
    if (boardExitTimer) clearTimeout(boardExitTimer);
    if (blocksAudioContext && blocksAudioContext.state !== 'closed') void blocksAudioContext.close();
  });
</script>

<svelte:window on:pointermove={moveDrag} on:pointerup={finishDrag} on:pointercancel={cancelDrag} />

<section
  class="blocks-session"
  class:blocks-session--board-active={boardActive}
  class:blocks-session--drill-active={showDrill}
  class:blocks-session--board-exit-deferred={boardExitDeferred}
  class:blocks-session--overlay-layout={usesOverlayLayout}
  style:--blocks-clear-pop-duration={`${CLEAR_POP_DURATION_MS}ms`}
  aria-label="Blocks practice game"
>
  <div class="blocks-session__drill">
    {#if game.gate === 'game-over'}
      <div class="blocks-session__complete" role="status">
        <h2>Blocks complete</h2>
        <p>Final score: {game.score}</p>
        <button type="button" class="btn btn-success" on:click={leaveGame}>Return to practice</button>
      </div>
    {:else if drillMounted}
      <FlashcardSessionSurface {...retainedFlashcardProps}
        bind:trialContentFadeElement
        on:transitionrun={(event) => forward('transitionrun', event.detail)}
        on:transitionstart={(event) => forward('transitionstart', event.detail)}
        on:transitionend={(event) => forward('transitionend', event.detail)}
        on:submit={(event) => forward('submit', event.detail)}
        on:choice={(event) => forward('choice', event.detail)}
        on:input={(event) => forward('input', event.detail)}
        on:activity={(event) => forward('activity', event.detail)}
        on:firstKeypress={(event) => forward('firstKeypress', event.detail)}
        on:feedbackcontent={(event) => forward('feedbackcontent', event.detail)}
        on:replay={(event) => forward('replay', event.detail)}
        on:blockingassetstate={(event) => forward('blockingassetstate', event.detail)}
        on:incomingblockingassetstate={(event) => forward('incomingblockingassetstate', event.detail)}
        on:reviewrevealstarted={(event) => forward('reviewrevealstarted', event.detail)}
        on:skipstudy={(event) => forward('skipstudy', event.detail)}
        on:learningprogresstoggle={(event) => forward('learningprogresstoggle', event.detail)}
      />
    {:else}
      <div class="blocks-session__instruction" role="status">
        <h2>Build your next question</h2>
        <p>Drag all three colorful pieces onto the board. Your study question will appear here when the tray is empty.</p>
      </div>
    {/if}
  </div>

  <aside
    class="blocks-session__game"
    aria-label="Blocks board and pieces"
    data-blocks-gate={game.gate}
    data-tray-generation={trayGeneration}
    data-applied-tray-generation={appliedTrayGeneration}
    on:transitionend={finishBoardCover}
  >
    <header class="blocks-session__header">
      <div>
        <span class="blocks-session__label">Blocks score</span>
        <strong class="blocks-session__score">{game.score}</strong>
      </div>
      <p class="blocks-session__status" aria-live="polite">
        {#if game.gate === 'game-over'}No pieces fit. Your Blocks run is complete.{:else if boardActive}Drag all three pieces to unlock your question.{:else}Answer the question to continue your Blocks run.{/if}
      </p>
    </header>

    <div class="blocks-board" bind:this={boardElement} role="grid" aria-label="Blocks board">
      {#each game.board as boardRow, row}
        {#each boardRow as cell, col}
          <button
            type="button"
            class="blocks-board__cell"
            class:blocks-board__cell--filled={cell !== null || clearingCells.has(`${row}:${col}`)}
            class:blocks-board__cell--clearing={clearingCells.has(`${row}:${col}`)}
            class:blocks-board__cell--preview={previewCells.has(`${row}:${col}`)}
            style:--piece-color={cell || clearingCells.get(`${row}:${col}`)?.family ? pieceColor(cell || clearingCells.get(`${row}:${col}`)?.family) : ''}
            style:--blocks-clear-pop-delay={`${(clearingCells.get(`${row}:${col}`)?.index || 0) * CLEAR_POP_STAGGER_MS}ms`}
            data-board-row={row}
            data-board-col={col}
            aria-label={`Row ${row + 1}, column ${col + 1}`}
            on:keydown={(event) => handleBoardKeydown(event, row, col)}
          ></button>
        {/each}
      {/each}
    </div>

    <div class="blocks-tray" aria-label="Available blocks">
      {#each game.tray as piece, index}
        <button
          type="button"
          class="blocks-tray__piece"
          class:blocks-tray__piece--dragging={dragging?.trayIndex === index}
          disabled={!piece || !boardActive || game.gate !== 'board'}
          aria-label={piece ? `Drag ${piece.cells.length} block piece ${index + 1}` : `Used block piece ${index + 1}`}
          on:pointerdown={(event) => startDrag(event, index, piece)}
        >
          {#if piece}
            <span class="blocks-piece" style={`--piece-width: ${Math.max(...piece.cells.map(([, col]) => col)) + 1}; --piece-height: ${Math.max(...piece.cells.map(([row]) => row)) + 1};`}>
              {#each piece.cells as [pieceRow, pieceCol]}
                <span class="blocks-piece__cell" data-piece-row={pieceRow} data-piece-col={pieceCol} style={`grid-row: ${pieceRow + 1}; grid-column: ${pieceCol + 1}; --piece-color: ${pieceColor(piece.family)};`}></span>
              {/each}
            </span>
          {:else}<span class="blocks-tray__used" aria-hidden="true"></span>{/if}
        </button>
      {/each}
    </div>
  </aside>

  {#if dragging}
    <div class="blocks-drag-positioner" aria-hidden="true" style={`transform: translate3d(${dragging.clientX - dragging.offsetX}px, ${dragging.clientY - dragging.offsetY}px, 0);`}>
      <div bind:this={dragPreviewElement} class="blocks-drag-preview" style={`--piece-width: ${Math.max(...dragging.piece.cells.map(([, col]) => col)) + 1}; --piece-height: ${Math.max(...dragging.piece.cells.map(([row]) => row)) + 1}; --piece-cell-size: ${dragging.previewCellSize}px; --piece-gap: ${DRAG_PREVIEW_GAP}px;`}>
        {#each dragging.piece.cells as [pieceRow, pieceCol]}
          <span style={`grid-row: ${pieceRow + 1}; grid-column: ${pieceCol + 1}; --piece-color: ${pieceColor(dragging.piece.family)};`}></span>
        {/each}
      </div>
    </div>
  {/if}
</section>

<style>
  .blocks-session { flex: 1 1 auto; min-height: 0; overflow: auto; display: grid; grid-template-columns: minmax(0, 1fr) minmax(18rem, 24rem); gap: clamp(1rem, 3vw, 3rem); align-items: stretch; padding: clamp(1rem, 2vw, 2rem); background: var(--app-background-color); }
  .blocks-session__drill { min-width: 0; min-height: 30rem; display: flex; align-items: stretch; }
  .blocks-session__drill :global(.learning-session-layout) { flex: 1 1 auto; }
  .blocks-session__instruction, .blocks-session__complete { width: min(100%, 42rem); margin: auto; padding: clamp(1.25rem, 3vw, 2.5rem); border: 1px solid color-mix(in srgb, var(--app-text-color) 14%, transparent); border-radius: var(--app-border-radius-md); background: var(--learning-card-surface-color); text-align: center; }
  .blocks-session__instruction h2, .blocks-session__complete h2 { margin-top: 0; }
  .blocks-session__game { align-self: start; min-width: 0; }
  .blocks-session__header { display: flex; align-items: end; justify-content: space-between; gap: var(--app-space-2); margin-bottom: var(--app-space-2); }
  .blocks-session__label { display: block; color: color-mix(in srgb, var(--app-text-color) 65%, transparent); font-size: .8em; text-transform: uppercase; }
  .blocks-session__score { font-size: 2rem; font-variant-numeric: tabular-nums; }
  .blocks-session__status { max-width: 14rem; margin: 0; text-align: right; font-size: .9rem; }
  .blocks-board { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 3px; width: min(100%, 23rem); margin-inline: auto; padding: 6px; border-radius: .9rem; background: #17375e; aspect-ratio: 1; touch-action: none; }
  .blocks-board__cell { min-width: 0; border: 0; border-radius: 3px; background: #edf3fa; box-shadow: inset 0 0 0 1px rgb(23 55 94 / 12%); }
  .blocks-board__cell--filled { background: var(--piece-color); box-shadow: inset 0 -2px 0 rgb(0 0 0 / 15%); }
  .blocks-board__cell--preview { background: color-mix(in srgb, var(--piece-color, #4a90e2) 72%, white); box-shadow: inset 0 0 0 2px var(--piece-color, #4a90e2); }
  .blocks-board__cell:focus-visible, .blocks-tray__piece:focus-visible { outline: 3px solid var(--app-accent-color); outline-offset: 2px; }
  .blocks-tray { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--app-space-2); width: min(100%, 23rem); margin: var(--app-space-2) auto 0; }
  .blocks-tray__piece { min-height: 4.5rem; display: grid; place-items: center; padding: .4rem; border: 0; border-radius: 0; background: transparent; color: var(--app-text-color); cursor: grab; touch-action: none; }
  .blocks-tray__piece:active, .blocks-tray__piece--dragging { cursor: grabbing; }
  .blocks-tray__piece--dragging .blocks-piece { visibility: hidden; }
  .blocks-tray__piece:disabled { cursor: default; opacity: .55; }
  .blocks-piece, .blocks-drag-preview { display: inline-grid; grid-template-columns: repeat(var(--piece-width), 1.15rem); grid-template-rows: repeat(var(--piece-height), 1.15rem); gap: 2px; }
  .blocks-piece__cell, .blocks-drag-preview span { min-width: 1.15rem; min-height: 1.15rem; border-radius: 3px; background: var(--piece-color); box-shadow: inset 0 -2px 0 rgb(0 0 0 / 16%); }
  .blocks-drag-positioner { position: fixed; top: 0; left: 0; z-index: 10000; pointer-events: none; will-change: transform; }
  .blocks-drag-preview { grid-template-columns: repeat(var(--piece-width), var(--piece-cell-size)); grid-template-rows: repeat(var(--piece-height), var(--piece-cell-size)); gap: var(--piece-gap); filter: drop-shadow(0 7px 7px rgb(0 0 0 / 25%)); will-change: transform; }
  .blocks-drag-preview span { min-width: var(--piece-cell-size); min-height: var(--piece-cell-size); }
  .blocks-board__cell--clearing { animation: blocks-clear-pop var(--blocks-clear-pop-duration) ease-out both; animation-delay: var(--blocks-clear-pop-delay, 0ms); }
  @keyframes blocks-clear-pop { 35% { transform: scale(1.16); filter: brightness(1.28); } 100% { transform: scale(.08); opacity: 0; } }
  .blocks-session--overlay-layout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    gap: 0;
    position: relative;
    overflow: hidden;
  }
  .blocks-session--overlay-layout .blocks-session__drill,
  .blocks-session--overlay-layout .blocks-session__game {
    grid-column: 1;
    grid-row: 1;
    width: 100%;
  }
  .blocks-session--overlay-layout .blocks-session__drill {
    min-height: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 1;
  }
  .blocks-session--overlay-layout .blocks-session__game {
    align-self: start;
    max-height: 100%;
    overflow: hidden;
    background: var(--app-background-color);
    transform: translateY(0);
    transition:
      transform 520ms cubic-bezier(.22, 1, .36, 1),
      visibility 0s linear 520ms;
    will-change: transform;
    z-index: 2;
  }
  .blocks-session--overlay-layout.blocks-session--drill-active .blocks-session__drill {
    overflow: auto;
    pointer-events: auto;
  }
  .blocks-session--overlay-layout.blocks-session--drill-active .blocks-session__game {
    pointer-events: none;
    transform: translateY(calc(100dvh + var(--app-space-2)));
    visibility: hidden;
  }
  .blocks-session--overlay-layout.blocks-session--drill-active.blocks-session--board-exit-deferred .blocks-session__drill {
    overflow: hidden;
    pointer-events: none;
  }
  .blocks-session--overlay-layout.blocks-session--drill-active.blocks-session--board-exit-deferred .blocks-session__game {
    transform: translateY(0);
    visibility: visible;
  }
  .blocks-session--overlay-layout.blocks-session--board-active .blocks-session__game {
    overflow: auto;
    pointer-events: auto;
    transform: translateY(0);
    transition-delay: 0s;
    visibility: visible;
  }
  @media (prefers-reduced-motion: reduce) {
    .blocks-board__cell--clearing { animation-duration: 1ms; }
    .blocks-session__game {
      transition-duration: 1ms;
      transition-delay: 0s;
    }
  }
</style>
