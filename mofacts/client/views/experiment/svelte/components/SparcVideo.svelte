<script>
  import { onMount } from 'svelte';
  import Plyr from 'plyr';
  import { ensureStylesheet } from '../../../../lib/cssAssetLoader';
  import { parseSparcVideoSegment } from '../../../../../../learning-components/runtime/sparcVideo';
  import { translatePlatformString } from '../../../../lib/interfaceI18n';
  import { getActiveUiLocale } from '../../../../lib/interfaceLocaleState';

  export let video;
  const text = key => translatePlatformString(getActiveUiLocale(), key);
  let element;
  let failed = false;
  let ready = false;
  $: segment = parseSparcVideoSegment(video);
  onMount(() => {
    ensureStylesheet('/vendor/plyr/3.8.4/plyr.css');
    let player;
    let guard;
    let disposed = false;
    let starting = false;
    const loadTimeout = setTimeout(() => { if (!ready && !disposed) failed = true; }, 20000);
    try {
      player = new Plyr(element, { autoplay: false, controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'captions', 'fullscreen'],
        captions: { active: true, language: segment.language }, youtube: { noCookie: true, rel: 0, iv_load_policy: 3,
          start: Math.floor(segment.startSeconds), end: Math.ceil(segment.endSeconds) } });
      const interval = { videoId: segment.videoId, startSeconds: segment.startSeconds, endSeconds: segment.endSeconds };
      player.on('ready', () => {
        if (disposed) return;
        if (typeof player.embed?.cueVideoById !== 'function') { failed = true; return; }
        player.embed.cueVideoById(interval); ready = true;
      });
      player.on('play', () => {
        if (!ready || disposed) return;
        if (!starting && (player.currentTime >= segment.endSeconds || player.currentTime < segment.startSeconds - 0.25)) {
          starting = true;
          player.embed.loadVideoById(interval);
        }
      });
      // YouTube seeking can clear endSeconds. Enforce the saved interval independently.
      guard = setInterval(() => {
        if (disposed || !ready) return;
        const time = player.currentTime;
        if (time >= segment.startSeconds - 0.25 && time < segment.endSeconds) starting = false;
        if (player.paused) return;
        if (time >= segment.endSeconds) player.pause();
        else if (!starting && time < segment.startSeconds - 0.25) {
          starting = true;
          player.embed.seekTo(segment.startSeconds, true);
        }
      }, 100);
      player.on('error', () => { failed = true; player.pause(); });
    } catch { failed = true; }
    return () => { disposed = true; clearTimeout(loadTimeout); clearInterval(guard); player?.destroy(); };
  });
</script>

<div class="sparc-video" role="group" aria-label={text('sparc.videoLabel')}>
  {#if failed}<p role="alert">{text('sparc.videoError')}</p>{:else if !ready}<p role="status">{text('common.loading')}</p>{/if}
  <div class:unavailable={failed}><div bind:this={element} data-plyr-provider="youtube" data-plyr-embed-id={segment.videoId}></div></div>
</div>
